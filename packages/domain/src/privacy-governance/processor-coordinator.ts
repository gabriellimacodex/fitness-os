import { createHash } from 'node:crypto';

import {
  privacyProcessorExecutionJournalRecordSchema,
  privacyProcessorExecutionReceiptSchema,
  privacyOperationIdSchema,
  privacyProcessorIdSchema,
  privacyProcessorStepIdSchema,
  privacySyntheticProcessorResultSchema,
  type PrivacyExpectedProcessorInventoryEntry,
  type PrivacyProcessorDescriptorReference,
  type PrivacyProcessorExecutionReceipt,
  type PrivacySyntheticProcessorCommand,
} from '@fitness-os/schemas';

import { buildRequestProcessorPlan } from './processor-plan.js';
import { createPrivacyProcessorExecutionReceiptVerifier } from './execution-receipt.js';
import {
  recordProcessorStepAndAdvanceRequest,
  type ProcessorStepAdvanceResult,
} from './processor-step.js';
import type {
  PrivacyExpectedProcessorInventoryPort,
  PrivacyProcessorExecutionCoordinator,
  PrivacyProcessorExecutionCoordinationResult,
  PrivacyProcessorExecutionJournal,
  PrivacyProcessorStepRepository,
  PrivacyProcessorExecutionReceiptSource,
  PrivacySubjectRequestRepository,
  PrivacyTrustedClock,
  PrivacySubjectDataProcessorResolver,
} from './ports.js';

const sameExecutionInput = (
  left: ProcessorExecutionInput,
  right: ProcessorExecutionInput,
): boolean =>
  digestProcessorExecutionInput(left) === digestProcessorExecutionInput(right);

export type ProcessorExecutionInput = {
  requestId: string;
  command: PrivacySyntheticProcessorCommand;
  expected: {
    inventoryVersionDigest: string;
    processor: PrivacyExpectedProcessorInventoryEntry;
  };
};

export const digestProcessorExecutionInput = (input: ProcessorExecutionInput) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        canonicalizationVersion: 'privacy-processor-execution-binding.v1',
        requestId: input.requestId,
        command: input.command,
        expected: input.expected,
      }),
      'utf8',
    )
    .digest('hex');

const descriptorMatchesReviewedInventory = (
  input: ProcessorExecutionInput,
  descriptor: PrivacyProcessorDescriptorReference,
): boolean =>
  descriptor.processorId === input.command.processorId &&
  descriptor.inventoryId === input.expected.processor.inventoryId &&
  descriptor.inventoryVersionDigest === input.expected.inventoryVersionDigest &&
  descriptor.descriptorDigest === input.expected.processor.descriptorDigest &&
  descriptor.codeOwner === input.expected.processor.codeOwner &&
  descriptor.synthetic === true &&
  descriptor.supportsSubjectLookup === true &&
  input.expected.processor.synthetic === true &&
  input.expected.processor.subjectLookupStrategy === 'synthetic_scope_id' &&
  input.expected.processor.requiredReadiness === 'mechanism_only' &&
  ['synthetic_only', 'disposable_test'].includes(
    input.expected.processor.environmentApplicability,
  ) &&
  descriptor.capabilities.includes(input.command.capability);

/**
 * Disposable coordinator with durable operation ownership. It validates the
 * reviewed handler before reserving, reserves before executing, and treats an
 * unfinished reservation as ambiguous after restart. Exact completed replays
 * are served from the journal without invoking the processor again.
 */
export class JournaledSyntheticPrivacyProcessorExecutionCoordinator
  implements
    PrivacyProcessorExecutionCoordinator,
    PrivacyProcessorExecutionReceiptSource
{
  private readonly operations = new Map<
    string,
    {
      input: ProcessorExecutionInput;
      result: Promise<PrivacyProcessorExecutionCoordinationResult>;
    }
  >();

  constructor(
    private readonly dependencies: {
      resolver: PrivacySubjectDataProcessorResolver;
      journal: PrivacyProcessorExecutionJournal;
      clock: PrivacyTrustedClock;
    },
  ) {}

  async execute(
    input: ProcessorExecutionInput,
  ): Promise<PrivacyProcessorExecutionCoordinationResult> {
    const existing = this.operations.get(input.command.operationId);
    if (existing !== undefined) {
      return sameExecutionInput(existing.input, input)
        ? existing.result
        : { status: 'conflict' };
    }

    const result = this.executeOnce(input);
    this.operations.set(input.command.operationId, { input, result });
    void result.then(
      (outcome) => {
        if (outcome.status !== 'executed') {
          this.forgetOperation(input.command.operationId, result);
        }
      },
      () => this.forgetOperation(input.command.operationId, result),
    );
    return result;
  }

  async listByOperationId(
    operationId: string,
  ): Promise<readonly PrivacyProcessorExecutionReceipt[]> {
    const record =
      await this.dependencies.journal.getByOperationId(operationId);
    if (record?.state !== 'completed' || record.outcome === null) return [];

    return [
      privacyProcessorExecutionReceiptSchema.parse({
        requestId: record.requestId,
        processorId: record.processorId,
        capability: record.capability,
        outcome: record.outcome,
        operationId: record.operationId,
        correlationId: record.correlationId,
      }),
    ];
  }

  private async executeOnce(
    input: ProcessorExecutionInput,
  ): Promise<PrivacyProcessorExecutionCoordinationResult> {
    if (input.command.productionMode) return { status: 'receipt_invalid' };

    let processor;
    try {
      processor = await this.dependencies.resolver.resolve(
        input.command.processorId,
      );
    } catch {
      return { status: 'unavailable' };
    }
    if (
      processor === null ||
      !descriptorMatchesReviewedInventory(
        input,
        processor.descriptorReference(),
      )
    ) {
      return { status: 'handler_missing' };
    }

    const bindingDigest = digestProcessorExecutionInput(input);
    const reservation = privacyProcessorExecutionJournalRecordSchema.parse({
      operationId: input.command.operationId,
      requestId: input.requestId,
      processorId: input.command.processorId,
      capability: input.command.capability,
      correlationId: input.command.correlationId,
      bindingDigest,
      state: 'reserved',
      outcome: null,
      reservedAt: this.dependencies.clock.nowUtcMs(),
      completedAt: null,
      synthetic: true,
    });

    let reserveResult;
    try {
      reserveResult = await this.dependencies.journal.reserve(reservation);
    } catch {
      return { status: 'unavailable' };
    }
    if (reserveResult.status === 'conflict') return { status: 'conflict' };
    if (reserveResult.status === 'reconciliation_required') {
      return { status: 'reconciliation_required' };
    }
    if (reserveResult.status === 'completed') {
      const completed = privacyProcessorExecutionJournalRecordSchema.safeParse(
        reserveResult.record,
      );
      return completed.success &&
        completed.data.state === 'completed' &&
        completed.data.operationId === reservation.operationId &&
        completed.data.requestId === reservation.requestId &&
        completed.data.processorId === reservation.processorId &&
        completed.data.capability === reservation.capability &&
        completed.data.correlationId === reservation.correlationId &&
        completed.data.bindingDigest === reservation.bindingDigest
        ? { status: 'executed' }
        : { status: 'conflict' };
    }

    let rawResult;
    try {
      rawResult = await processor.execute(input.command);
    } catch {
      await this.markAmbiguous(input.command.operationId, bindingDigest);
      return { status: 'reconciliation_required' };
    }
    const parsed = privacySyntheticProcessorResultSchema.safeParse(rawResult);
    if (
      !parsed.success ||
      parsed.data.capability !== input.command.capability ||
      parsed.data.operationId !== input.command.operationId ||
      parsed.data.correlationId !== input.command.correlationId
    ) {
      await this.markAmbiguous(input.command.operationId, bindingDigest);
      return { status: 'reconciliation_required' };
    }

    const completed = privacyProcessorExecutionJournalRecordSchema.parse({
      ...reservation,
      state: 'completed',
      outcome:
        parsed.data.status === 'completed' ? 'completed' : 'permanent_failure',
      completedAt: this.dependencies.clock.nowUtcMs(),
    });
    try {
      const completion = await this.dependencies.journal.complete(completed);
      return completion === 'conflict'
        ? { status: 'reconciliation_required' }
        : { status: 'executed' };
    } catch {
      await this.markAmbiguous(input.command.operationId, bindingDigest);
      return { status: 'reconciliation_required' };
    }
  }

  private async markAmbiguous(operationId: string, bindingDigest: string) {
    try {
      await this.dependencies.journal.markReconciliationRequired(
        operationId,
        bindingDigest,
      );
    } catch {
      // The reservation remains fail-closed even if this best-effort marker fails.
    }
  }

  private forgetOperation(
    operationId: string,
    result: Promise<PrivacyProcessorExecutionCoordinationResult>,
  ) {
    if (this.operations.get(operationId)?.result === result) {
      this.operations.delete(operationId);
    }
  }
}

/**
 * In-process disposable execution authority. It memoizes the promise before
 * resolving the handler so identical sequential or concurrent replays cannot
 * invoke the synthetic processor twice. Durable/restart-safe reconciliation
 * remains outside this mechanism-only adapter.
 */
export class SyntheticPrivacyProcessorExecutionCoordinator implements PrivacyProcessorExecutionCoordinator {
  private readonly operations = new Map<
    string,
    {
      input: ProcessorExecutionInput;
      result: Promise<PrivacyProcessorExecutionCoordinationResult>;
    }
  >();
  private readonly receipts = new Map<
    string,
    PrivacyProcessorExecutionReceipt
  >();

  constructor(private readonly resolver: PrivacySubjectDataProcessorResolver) {}

  async execute(
    input: ProcessorExecutionInput,
  ): Promise<PrivacyProcessorExecutionCoordinationResult> {
    const existing = this.operations.get(input.command.operationId);
    if (existing !== undefined) {
      return sameExecutionInput(existing.input, input)
        ? existing.result
        : { status: 'conflict' };
    }

    const result = this.executeOnce(input);
    this.operations.set(input.command.operationId, { input, result });
    return result;
  }

  async listByOperationId(
    operationId: string,
  ): Promise<readonly PrivacyProcessorExecutionReceipt[]> {
    const receipt = this.receipts.get(operationId);
    return receipt === undefined ? [] : [receipt];
  }

  private async executeOnce(
    input: ProcessorExecutionInput,
  ): Promise<PrivacyProcessorExecutionCoordinationResult> {
    if (input.command.productionMode) return { status: 'receipt_invalid' };

    let processor;
    try {
      processor = await this.resolver.resolve(input.command.processorId);
    } catch {
      return { status: 'unavailable' };
    }
    if (processor === null) return { status: 'handler_missing' };

    const descriptor = processor.descriptorReference();
    if (
      descriptor.processorId !== input.command.processorId ||
      descriptor.inventoryId !== input.expected.processor.inventoryId ||
      descriptor.inventoryVersionDigest !==
        input.expected.inventoryVersionDigest ||
      descriptor.descriptorDigest !==
        input.expected.processor.descriptorDigest ||
      descriptor.codeOwner !== input.expected.processor.codeOwner ||
      descriptor.synthetic !== true ||
      descriptor.supportsSubjectLookup !== true ||
      input.expected.processor.synthetic !== true ||
      input.expected.processor.subjectLookupStrategy !== 'synthetic_scope_id' ||
      input.expected.processor.requiredReadiness !== 'mechanism_only' ||
      !['synthetic_only', 'disposable_test'].includes(
        input.expected.processor.environmentApplicability,
      ) ||
      !descriptor.capabilities.includes(input.command.capability)
    ) {
      return { status: 'handler_missing' };
    }

    let rawResult;
    try {
      rawResult = await processor.execute(input.command);
    } catch {
      return { status: 'unavailable' };
    }
    const parsed = privacySyntheticProcessorResultSchema.safeParse(rawResult);
    if (
      !parsed.success ||
      parsed.data.capability !== input.command.capability ||
      parsed.data.operationId !== input.command.operationId ||
      parsed.data.correlationId !== input.command.correlationId
    ) {
      return { status: 'receipt_invalid' };
    }

    this.receipts.set(
      input.command.operationId,
      privacyProcessorExecutionReceiptSchema.parse({
        requestId: input.requestId,
        processorId: input.command.processorId,
        capability: input.command.capability,
        outcome:
          parsed.data.status === 'completed'
            ? 'completed'
            : 'permanent_failure',
        operationId: input.command.operationId,
        correlationId: input.command.correlationId,
      }),
    );
    return { status: 'executed' };
  }
}

export type SyntheticProcessorCoordinationResult =
  | ProcessorStepAdvanceResult
  | {
      status:
        | 'hard_disabled'
        | 'inventory_mismatch'
        | 'no_pending_step'
        | 'plan_incomplete'
        | 'request_not_executable'
        | 'receipt_invalid';
    }
  | { status: 'execution_unavailable' }
  | { status: 'execution_conflict' }
  | { status: 'reconciliation_required' }
  | { status: 'handler_missing' };

const receiptMatches = (
  receipt: PrivacyProcessorExecutionReceipt,
  expected: Omit<PrivacyProcessorExecutionReceipt, 'outcome'>,
): boolean =>
  receipt.requestId === expected.requestId &&
  receipt.processorId === expected.processorId &&
  receipt.capability === expected.capability &&
  receipt.operationId === expected.operationId &&
  receipt.correlationId === expected.correlationId;

/**
 * Selects the first unfinished step from the stable request-pinned plan,
 * executes it through a composition-owned coordinator, and records only the
 * coordinator-owned receipt outcome. This mechanism is synthetic-only and
 * performs no delete, retention, or governance-lifecycle capability.
 */
export async function coordinateSyntheticProcessorStep(input: {
  requestId: string;
  operationId: string;
  productionMode: boolean;
  requests: PrivacySubjectRequestRepository;
  steps: PrivacyProcessorStepRepository;
  expectedInventory: PrivacyExpectedProcessorInventoryPort;
  execution: PrivacyProcessorExecutionCoordinator;
  receipts: PrivacyProcessorExecutionReceiptSource;
  clock: PrivacyTrustedClock;
}): Promise<SyntheticProcessorCoordinationResult> {
  if (input.productionMode) return { status: 'hard_disabled' };

  const request = await input.requests.get(input.requestId);
  if (request === null) return { status: 'request_not_found' };
  if (
    request.state !== 'in_progress' &&
    request.state !== 'partially_failed' &&
    request.state !== 'completed'
  ) {
    return { status: 'request_not_executable' };
  }

  const inventory = await input.expectedInventory.getInventory();
  if (inventory.inventoryVersionDigest !== request.inventoryVersionDigest) {
    return { status: 'inventory_mismatch' };
  }

  const plan = buildRequestProcessorPlan({
    expected: inventory,
    requestType: request.requestType,
  });
  if (plan.status !== 'planned' || plan.steps.length === 0) {
    return { status: 'plan_incomplete' };
  }

  const history = await input.steps.listForRequest(request.requestId);
  const operationHistory = history.filter(
    (step) => step.operationId === input.operationId,
  );
  if (
    operationHistory.length > 1 ||
    (operationHistory[0] !== undefined &&
      operationHistory[0].stepId !== input.operationId)
  ) {
    return { status: 'execution_conflict' };
  }
  const replay = operationHistory[0];
  if (request.state === 'completed' && replay === undefined) {
    return { status: 'request_not_executable' };
  }
  const latest = new Map(
    history.map((step) => [`${step.processorId}:${step.capability}`, step]),
  );
  const next =
    replay === undefined
      ? plan.steps.find((step) => {
          const prior = latest.get(`${step.processorId}:${step.capability}`);
          return prior === undefined || prior.outcome === 'retryable_failure';
        })
      : plan.steps.find(
          (step) =>
            step.processorId === replay.processorId &&
            step.capability === replay.capability,
        );
  if (next === undefined) return { status: 'no_pending_step' };
  if (
    next.capability === 'delete' ||
    next.capability === 'retention' ||
    next.capability === 'governance_lifecycle'
  ) {
    return { status: 'hard_disabled' };
  }

  const processorId = privacyProcessorIdSchema.parse(next.processorId);
  const operationId = privacyOperationIdSchema.parse(input.operationId);
  const expectedReceipt = {
    requestId: request.requestId,
    processorId,
    capability: next.capability,
    operationId,
    correlationId: request.correlationId,
  };
  const expectedProcessor = inventory.processors.find(
    (processor) => processor.processorId === next.processorId,
  );
  if (expectedProcessor === undefined) return { status: 'plan_incomplete' };
  const execution = await input.execution.execute({
    requestId: request.requestId,
    expected: {
      inventoryVersionDigest: inventory.inventoryVersionDigest,
      processor: expectedProcessor,
    },
    command: {
      processorId,
      capability: next.capability,
      subjectScopeId: request.subjectScopeId,
      correlationId: request.correlationId,
      operationId,
      productionMode: false,
    },
  });

  if (execution.status === 'unavailable') {
    return { status: 'execution_unavailable' };
  }
  if (execution.status === 'conflict') {
    return { status: 'execution_conflict' };
  }
  if (execution.status === 'handler_missing') {
    return { status: 'handler_missing' };
  }
  if (execution.status === 'receipt_invalid') {
    return { status: 'receipt_invalid' };
  }
  if (execution.status === 'reconciliation_required') {
    return { status: 'reconciliation_required' };
  }

  const receiptVerification =
    await createPrivacyProcessorExecutionReceiptVerifier(input.receipts).verify(
      expectedReceipt,
    );
  if (receiptVerification.status === 'unavailable') {
    return { status: 'execution_unavailable' };
  }
  if (
    receiptVerification.status === 'invalid' ||
    !receiptMatches(receiptVerification.receipt, expectedReceipt) ||
    (replay !== undefined &&
      replay.outcome !== receiptVerification.receipt.outcome)
  ) {
    return { status: 'receipt_invalid' };
  }

  const recordedAt = input.clock.nowUtcMs();
  return recordProcessorStepAndAdvanceRequest({
    requests: input.requests,
    steps: input.steps,
    step: {
      stepId: privacyProcessorStepIdSchema.parse(operationId),
      ...receiptVerification.receipt,
      recordedAt,
    },
    expected: plan.steps,
    updatedAt: recordedAt,
    productionMode: false,
  });
}

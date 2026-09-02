import {
  privacyProcessorExecutionReceiptSchema,
  privacyOperationIdSchema,
  privacyProcessorIdSchema,
  privacyProcessorStepIdSchema,
  privacySyntheticProcessorResultSchema,
  type PrivacyExpectedProcessorInventoryEntry,
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
  left.requestId === right.requestId &&
  left.command.processorId === right.command.processorId &&
  left.command.capability === right.command.capability &&
  left.command.subjectScopeId === right.command.subjectScopeId &&
  left.command.correlationId === right.command.correlationId &&
  left.command.operationId === right.command.operationId &&
  left.command.productionMode === right.command.productionMode &&
  left.expected.inventoryVersionDigest ===
    right.expected.inventoryVersionDigest &&
  left.expected.processor.processorId ===
    right.expected.processor.processorId &&
  left.expected.processor.descriptorDigest ===
    right.expected.processor.descriptorDigest;

type ProcessorExecutionInput = {
  requestId: string;
  command: PrivacySyntheticProcessorCommand;
  expected: {
    inventoryVersionDigest: string;
    processor: PrivacyExpectedProcessorInventoryEntry;
  };
};

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
      input.expected.processor.synthetic !== true ||
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

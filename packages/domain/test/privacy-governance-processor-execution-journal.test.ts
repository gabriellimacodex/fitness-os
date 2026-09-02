import {
  privacyExpectedProcessorInventorySchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyProcessorExecutionJournalRecordSchema,
  type PrivacyProcessorExecutionJournalRecord,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  JournaledSyntheticPrivacyProcessorExecutionCoordinator,
  digestProcessorExecutionInput,
  type PrivacyProcessorExecutionJournal,
} from '../src/privacy-governance/index.js';

const descriptor = privacyProcessorDescriptorReferenceSchema.parse({
  processorId: '99999999-9999-4999-8999-999999999999',
  inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  descriptorDigest: '2'.repeat(64),
  inventoryVersionDigest: '1'.repeat(64),
  allowedPurposeIds: [],
  allowedCategoryIds: [],
  capabilities: ['export'],
  supportsSubjectLookup: true,
  codeOwner: 'packages.domain.privacy',
  synthetic: true,
});

const expected = privacyExpectedProcessorInventorySchema.parse({
  schemaVersion: 'privacy.processor-inventory.v1',
  inventoryId: descriptor.inventoryId,
  inventoryVersionDigest: descriptor.inventoryVersionDigest,
  canonicalizationVersion: 'privacy-governance.canonical.v1',
  sourceCommit: '6f62a8f',
  processors: [
    {
      processorId: descriptor.processorId,
      registrationVersion: 1,
      inventoryId: descriptor.inventoryId,
      descriptorDigest: descriptor.descriptorDigest,
      codeOwner: descriptor.codeOwner,
      adapterPackage: '@fitness-os/domain',
      storageKind: 'in_memory_synthetic',
      allowedPurposeIds: [],
      allowedCategoryIds: [],
      subjectLookupStrategy: 'synthetic_scope_id',
      supportedCapabilities: ['export'],
      unsupportedCapabilities: [],
      recordFamilies: [
        {
          family: 'privacy_export_metadata',
          lifecycleAction: 'retain_until_reviewed',
        },
      ],
      environmentApplicability: 'disposable_test',
      requiredReadiness: 'mechanism_only',
      synthetic: true,
    },
  ],
}).processors[0]!;

const command = {
  processorId: descriptor.processorId,
  capability: 'export' as const,
  subjectScopeId: '22222222-2222-4222-8222-222222222222' as never,
  correlationId: '55555555-5555-4555-8555-555555555555' as never,
  operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' as never,
  productionMode: false,
};

class MemoryJournal implements PrivacyProcessorExecutionJournal {
  readonly records = new Map<string, PrivacyProcessorExecutionJournalRecord>();

  async reserve(record: PrivacyProcessorExecutionJournalRecord) {
    const prior = this.records.get(record.operationId);
    if (prior === undefined) {
      this.records.set(record.operationId, record);
      return { status: 'reserved' as const };
    }
    if (prior.bindingDigest !== record.bindingDigest) {
      return { status: 'conflict' as const };
    }
    if (prior.state === 'completed') {
      return { status: 'completed' as const, record: prior };
    }
    return { status: 'reconciliation_required' as const };
  }

  async complete(record: PrivacyProcessorExecutionJournalRecord) {
    this.records.set(record.operationId, record);
    return 'accepted' as const;
  }

  async markReconciliationRequired(operationId: string, bindingDigest: string) {
    const prior = this.records.get(operationId);
    if (prior === undefined || prior.bindingDigest !== bindingDigest) {
      return 'conflict' as const;
    }
    this.records.set(
      operationId,
      privacyProcessorExecutionJournalRecordSchema.parse({
        ...prior,
        state: 'reconciliation_required',
      }),
    );
    return 'accepted' as const;
  }

  async getByOperationId(operationId: string) {
    return this.records.get(operationId) ?? null;
  }
}

describe('journaled synthetic processor execution coordinator', () => {
  it('replays a completed operation after restart without executing again', async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const resolver = {
      resolve: async () => ({
        descriptorReference: () => descriptor,
        execute: async () => {
          executions += 1;
          return {
            status: 'completed' as const,
            reasonCode: null,
            capability: 'export' as const,
            families: [],
            accessLocatorDigest: null,
            exportManifestDigest: '3'.repeat(64),
            operationId: command.operationId,
            correlationId: command.correlationId,
          };
        },
      }),
    };
    const dependencies = {
      journal,
      resolver,
      clock: { nowUtcMs: () => '2026-08-18T12:03:00.000Z' },
    };
    const input = {
      requestId: '66666666-6666-4666-8666-666666666666',
      command,
      expected: {
        inventoryVersionDigest: descriptor.inventoryVersionDigest,
        processor: expected,
      },
    };

    const first =
      await new JournaledSyntheticPrivacyProcessorExecutionCoordinator(
        dependencies,
      ).execute(input);
    const afterRestart =
      new JournaledSyntheticPrivacyProcessorExecutionCoordinator(dependencies);
    const replay = await afterRestart.execute(input);

    expect(first).toEqual({ status: 'executed' });
    expect(replay).toEqual({ status: 'executed' });
    expect(executions).toBe(1);
    await expect(
      afterRestart.listByOperationId(command.operationId),
    ).resolves.toMatchObject([{ outcome: 'completed' }]);
  });

  it('refuses an unfinished reservation and observes later reconciliation', async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const dependencies = {
      journal,
      resolver: {
        resolve: async () => ({
          descriptorReference: () => descriptor,
          execute: async () => {
            executions += 1;
            throw new Error('must not execute');
          },
        }),
      },
      clock: { nowUtcMs: () => '2026-08-18T12:03:00.000Z' },
    };
    const input = {
      requestId: '66666666-6666-4666-8666-666666666666',
      command,
      expected: {
        inventoryVersionDigest: descriptor.inventoryVersionDigest,
        processor: expected,
      },
    };
    const bindingDigest = digestProcessorExecutionInput(input);
    const reserved = privacyProcessorExecutionJournalRecordSchema.parse({
      operationId: command.operationId,
      requestId: input.requestId,
      processorId: command.processorId,
      capability: command.capability,
      correlationId: command.correlationId,
      bindingDigest,
      state: 'reserved',
      outcome: null,
      reservedAt: '2026-08-18T12:03:00.000Z',
      completedAt: null,
      synthetic: true,
    });
    journal.records.set(command.operationId, reserved);

    const coordinator =
      new JournaledSyntheticPrivacyProcessorExecutionCoordinator(dependencies);
    const result = await coordinator.execute(input);

    expect(result).toEqual({ status: 'reconciliation_required' });
    journal.records.set(
      command.operationId,
      privacyProcessorExecutionJournalRecordSchema.parse({
        ...reserved,
        state: 'completed',
        outcome: 'completed',
        completedAt: '2026-08-18T12:04:00.000Z',
      }),
    );
    await expect(coordinator.execute(input)).resolves.toEqual({
      status: 'executed',
    });
    expect(executions).toBe(0);
  });

  it('marks a thrown handler result for reconciliation and never retries it', async () => {
    const journal = new MemoryJournal();
    let executions = 0;
    const dependencies = {
      journal,
      resolver: {
        resolve: async () => ({
          descriptorReference: () => descriptor,
          execute: async () => {
            executions += 1;
            throw new Error('ambiguous handler result');
          },
        }),
      },
      clock: { nowUtcMs: () => '2026-08-18T12:03:00.000Z' },
    };
    const input = {
      requestId: '66666666-6666-4666-8666-666666666666',
      command,
      expected: {
        inventoryVersionDigest: descriptor.inventoryVersionDigest,
        processor: expected,
      },
    };

    await expect(
      new JournaledSyntheticPrivacyProcessorExecutionCoordinator(
        dependencies,
      ).execute(input),
    ).resolves.toEqual({ status: 'reconciliation_required' });
    await expect(
      new JournaledSyntheticPrivacyProcessorExecutionCoordinator(
        dependencies,
      ).execute(input),
    ).resolves.toEqual({ status: 'reconciliation_required' });

    expect(executions).toBe(1);
    expect(journal.records.get(command.operationId)?.state).toBe(
      'reconciliation_required',
    );
  });
});

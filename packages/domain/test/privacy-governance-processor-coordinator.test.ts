import {
  privacyExpectedProcessorInventorySchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyProcessorExecutionReceiptSchema,
  privacyProcessorStepReferenceSchema,
  privacySubjectRequestReferenceSchema,
  type PrivacyExpectedProcessorInventory,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  coordinateSyntheticProcessorStep,
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacyProcessorExecutionCoordinator,
  SyntheticPrivacyProcessorStepRepository,
  SyntheticPrivacySubjectRequestRepository,
  SyntheticPrivacyTrustedClock,
} from '../src/privacy-governance/index.js';

describe('synthetic processor coordinator', () => {
  it('selects and executes the next step from the request-pinned plan', async () => {
    const requestId = '66666666-6666-4666-8666-666666666666';
    const processorId = '99999999-9999-4999-8999-999999999999';
    const operationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const correlationId = '55555555-5555-4555-8555-555555555555';
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(
      privacySubjectRequestReferenceSchema.parse({
        requestId,
        requestType: 'export',
        state: 'in_progress',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        inventoryVersionDigest: '1'.repeat(64),
        correlationId,
        updatedAt: '2026-08-18T12:00:00.000Z',
      }),
    );
    const expectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
      privacyExpectedProcessorInventorySchema.parse({
        schemaVersion: 'privacy.processor-inventory.v1',
        inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        inventoryVersionDigest: '1'.repeat(64),
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        sourceCommit: '2a59a47',
        processors: [
          {
            processorId,
            registrationVersion: 1,
            inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            descriptorDigest: '2'.repeat(64),
            codeOwner: 'packages.domain.privacy',
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
            environmentApplicability: 'synthetic_only',
            requiredReadiness: 'mechanism_only',
            synthetic: true,
          },
        ],
      }),
    );
    const executed: unknown[] = [];

    const result = await coordinateSyntheticProcessorStep({
      clock: new SyntheticPrivacyTrustedClock('2026-08-18T12:03:00.000Z'),
      execution: {
        execute: async (input) => {
          executed.push(input);
          return { status: 'executed' };
        },
      },
      expectedInventory,
      operationId,
      productionMode: false,
      requestId,
      requests,
      receipts: {
        listByOperationId: async () => [
          privacyProcessorExecutionReceiptSchema.parse({
            requestId,
            processorId,
            capability: 'export',
            outcome: 'completed',
            operationId,
            correlationId,
          }),
        ],
      },
      steps: new SyntheticPrivacyProcessorStepRepository(),
    });

    expect(executed).toEqual([
      {
        requestId,
        expected: {
          inventoryVersionDigest: '1'.repeat(64),
          processor: expect.objectContaining({
            processorId,
            descriptorDigest: '2'.repeat(64),
          }),
        },
        command: {
          processorId,
          capability: 'export',
          subjectScopeId: '22222222-2222-4222-8222-222222222222',
          correlationId,
          operationId,
          productionMode: false,
        },
      },
    ]);
    expect(result).toMatchObject({
      status: 'advanced',
      completion: 'completed',
      request: { state: 'completed' },
    });
  });

  it('serializes concurrent replay and rejects changed input for the same operation', async () => {
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
    let executions = 0;
    const coordinator = new SyntheticPrivacyProcessorExecutionCoordinator({
      resolve: async () => ({
        descriptorReference: () => descriptor,
        execute: async (command) => {
          executions += 1;
          return {
            status: 'completed',
            reasonCode: null,
            capability: command.capability,
            families: [],
            accessLocatorDigest: null,
            exportManifestDigest: '3'.repeat(64),
            operationId: command.operationId,
            correlationId: command.correlationId,
          };
        },
      }),
    });
    const input = {
      requestId: '66666666-6666-4666-8666-666666666666',
      expected: {
        inventoryVersionDigest: descriptor.inventoryVersionDigest,
        processor: {
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
          environmentApplicability: 'synthetic_only',
          requiredReadiness: 'mechanism_only',
          synthetic: true,
        } as never,
      },
      command: {
        processorId: descriptor.processorId,
        capability: 'export' as const,
        subjectScopeId: '22222222-2222-4222-8222-222222222222' as never,
        correlationId: '55555555-5555-4555-8555-555555555555' as never,
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' as never,
        productionMode: false,
      },
    };

    const [first, replay] = await Promise.all([
      coordinator.execute(input),
      coordinator.execute(input),
    ]);
    const changedInput = await coordinator.execute({
      ...input,
      requestId: '77777777-7777-4777-8777-777777777777',
    });

    expect(first).toEqual(replay);
    expect(changedInput).toEqual({ status: 'conflict' });
    expect(first).toEqual({ status: 'executed' });
    await expect(
      coordinator.listByOperationId(input.command.operationId),
    ).resolves.toMatchObject([{ outcome: 'completed' }]);
    expect(executions).toBe(1);
  });

  it('rejects a handler whose descriptor diverges from the reviewed inventory', async () => {
    const descriptor = privacyProcessorDescriptorReferenceSchema.parse({
      processorId: '99999999-9999-4999-8999-999999999999',
      inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      descriptorDigest: '9'.repeat(64),
      inventoryVersionDigest: '1'.repeat(64),
      allowedPurposeIds: [],
      allowedCategoryIds: [],
      capabilities: ['export'],
      supportsSubjectLookup: true,
      codeOwner: 'packages.domain.privacy',
      synthetic: true,
    });
    let executions = 0;
    const coordinator = new SyntheticPrivacyProcessorExecutionCoordinator({
      resolve: async () => ({
        descriptorReference: () => descriptor,
        execute: async () => {
          executions += 1;
          throw new Error('must not execute');
        },
      }),
    });
    const expected = privacyExpectedProcessorInventorySchema.parse({
      schemaVersion: 'privacy.processor-inventory.v1',
      inventoryId: descriptor.inventoryId,
      inventoryVersionDigest: descriptor.inventoryVersionDigest,
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      sourceCommit: '2a59a47',
      processors: [
        {
          processorId: descriptor.processorId,
          registrationVersion: 1,
          inventoryId: descriptor.inventoryId,
          descriptorDigest: '2'.repeat(64),
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
          environmentApplicability: 'synthetic_only',
          requiredReadiness: 'mechanism_only',
          synthetic: true,
        },
      ],
    }).processors[0]!;

    const result = await coordinator.execute({
      requestId: '66666666-6666-4666-8666-666666666666',
      expected: {
        inventoryVersionDigest: descriptor.inventoryVersionDigest,
        processor: expected,
      },
      command: {
        processorId: descriptor.processorId,
        capability: 'export',
        subjectScopeId: '22222222-2222-4222-8222-222222222222' as never,
        correlationId: '55555555-5555-4555-8555-555555555555' as never,
        operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as never,
        productionMode: false,
      },
    });

    expect(result).toEqual({ status: 'handler_missing' });
    expect(executions).toBe(0);
  });

  it('rejects runtime or inventory subject-lookup incompatibility before execute', async () => {
    let executions = 0;
    const executeForLookup = async (
      supportsSubjectLookup: boolean,
      subjectLookupStrategy: 'none' | 'synthetic_scope_id',
      operationId: string,
    ) => {
      const descriptor = privacyProcessorDescriptorReferenceSchema.parse({
        processorId: '99999999-9999-4999-8999-999999999999',
        inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        descriptorDigest: '2'.repeat(64),
        inventoryVersionDigest: '1'.repeat(64),
        allowedPurposeIds: [],
        allowedCategoryIds: [],
        capabilities: ['export'],
        supportsSubjectLookup,
        codeOwner: 'packages.domain.privacy',
        synthetic: true,
      });
      const expected = privacyExpectedProcessorInventorySchema.parse({
        schemaVersion: 'privacy.processor-inventory.v1',
        inventoryId: descriptor.inventoryId,
        inventoryVersionDigest: descriptor.inventoryVersionDigest,
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        sourceCommit: '2a59a47',
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
            subjectLookupStrategy,
            supportedCapabilities: ['export'],
            unsupportedCapabilities: [],
            recordFamilies: [
              {
                family: 'privacy_export_metadata',
                lifecycleAction: 'retain_until_reviewed',
              },
            ],
            environmentApplicability: 'synthetic_only',
            requiredReadiness: 'mechanism_only',
            synthetic: true,
          },
        ],
      }).processors[0]!;
      const coordinator = new SyntheticPrivacyProcessorExecutionCoordinator({
        resolve: async () => ({
          descriptorReference: () => descriptor,
          execute: async () => {
            executions += 1;
            throw new Error('must not execute');
          },
        }),
      });

      return coordinator.execute({
        requestId: '66666666-6666-4666-8666-666666666666',
        expected: {
          inventoryVersionDigest: descriptor.inventoryVersionDigest,
          processor: expected,
        },
        command: {
          processorId: descriptor.processorId,
          capability: 'export',
          subjectScopeId: '22222222-2222-4222-8222-222222222222' as never,
          correlationId: '55555555-5555-4555-8555-555555555555' as never,
          operationId: operationId as never,
          productionMode: false,
        },
      });
    };

    await expect(
      executeForLookup(
        false,
        'synthetic_scope_id',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      ),
    ).resolves.toEqual({ status: 'handler_missing' });
    await expect(
      executeForLookup(true, 'none', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
    ).resolves.toEqual({ status: 'handler_missing' });
    expect(executions).toBe(0);
  });

  it('never invokes a destructive capability', async () => {
    let executions = 0;
    const result = await coordinateSyntheticProcessorStep({
      clock: new SyntheticPrivacyTrustedClock('2026-08-18T12:03:00.000Z'),
      execution: {
        execute: async () => {
          executions += 1;
          return { status: 'executed' };
        },
      },
      expectedInventory: {
        getInventory: async () =>
          ({
            schemaVersion: 'privacy.processor-inventory.v1',
            inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            inventoryVersionDigest: '1'.repeat(64),
            canonicalizationVersion: 'privacy-governance.canonical.v1',
            sourceCommit: '2a59a47',
            processors: [
              {
                processorId: '99999999-9999-4999-8999-999999999999',
                registrationVersion: 1,
                inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                descriptorDigest: '2'.repeat(64),
                codeOwner: 'packages.domain.privacy',
                adapterPackage: '@fitness-os/domain',
                storageKind: 'in_memory_synthetic',
                allowedPurposeIds: [],
                allowedCategoryIds: [],
                subjectLookupStrategy: 'synthetic_scope_id',
                supportedCapabilities: ['delete'],
                unsupportedCapabilities: [],
                recordFamilies: [
                  {
                    family: 'privacy_export_metadata',
                    lifecycleAction: 'retain_until_reviewed',
                  },
                ],
                environmentApplicability: 'synthetic_only',
                requiredReadiness: 'mechanism_only',
                synthetic: true,
              },
            ],
          }) as never,
      },
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      productionMode: false,
      receipts: { listByOperationId: async () => [] },
      requestId: '66666666-6666-4666-8666-666666666666',
      requests: {
        get: async () =>
          ({
            requestId: '66666666-6666-4666-8666-666666666666',
            requestType: 'deletion',
            state: 'in_progress',
            inventoryVersionDigest: '1'.repeat(64),
            correlationId: '55555555-5555-4555-8555-555555555555',
          }) as never,
      } as never,
      steps: {
        append: async () => 'accepted',
        listForRequest: async () => [],
      },
    });

    expect(result).toEqual({ status: 'hard_disabled' });
    expect(executions).toBe(0);
  });

  it('does not execute a request outside an executable lifecycle state', async () => {
    let downstreamReads = 0;
    const unavailable = () => {
      downstreamReads += 1;
      throw new Error('must not continue');
    };
    const result = await coordinateSyntheticProcessorStep({
      clock: new SyntheticPrivacyTrustedClock('2026-08-18T12:03:00.000Z'),
      execution: { execute: async () => unavailable() },
      expectedInventory: { getInventory: async () => unavailable() },
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      productionMode: false,
      receipts: { listByOperationId: async () => unavailable() },
      requestId: '66666666-6666-4666-8666-666666666666',
      requests: {
        get: async () => ({ state: 'ready' }) as never,
      } as never,
      steps: {
        append: async () => unavailable(),
        listForRequest: async () => unavailable(),
      },
    });

    expect(result).toEqual({ status: 'request_not_executable' });
    expect(downstreamReads).toBe(0);
  });

  it('does not start a new operation for a completed request with incomplete history', async () => {
    let executions = 0;
    const requestId = '66666666-6666-4666-8666-666666666666';
    const processorId = '99999999-9999-4999-8999-999999999999';
    const inventory = privacyExpectedProcessorInventorySchema.parse({
      schemaVersion: 'privacy.processor-inventory.v1',
      inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      inventoryVersionDigest: '1'.repeat(64),
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      sourceCommit: '2a59a47',
      processors: [
        {
          processorId,
          registrationVersion: 1,
          inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          descriptorDigest: '2'.repeat(64),
          codeOwner: 'packages.domain.privacy',
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
          environmentApplicability: 'synthetic_only',
          requiredReadiness: 'mechanism_only',
          synthetic: true,
        },
      ],
    });

    const result = await coordinateSyntheticProcessorStep({
      clock: new SyntheticPrivacyTrustedClock('2026-08-18T12:03:00.000Z'),
      execution: {
        execute: async () => {
          executions += 1;
          return { status: 'executed' };
        },
      },
      expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
        inventory,
      ),
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      productionMode: false,
      receipts: { listByOperationId: async () => [] },
      requestId,
      requests: {
        get: async () =>
          privacySubjectRequestReferenceSchema.parse({
            requestId,
            requestType: 'export',
            state: 'completed',
            subjectScopeId: '22222222-2222-4222-8222-222222222222',
            verification: null,
            policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            inventoryVersionDigest: inventory.inventoryVersionDigest,
            correlationId: '55555555-5555-4555-8555-555555555555',
            updatedAt: '2026-08-18T12:00:00.000Z',
          }),
      } as never,
      steps: {
        append: async () => 'accepted',
        listForRequest: async () => [],
      },
    });

    expect(result).toEqual({ status: 'request_not_executable' });
    expect(executions).toBe(0);
  });
});

describe('coordinateSyntheticProcessorStep remaining branch guards', () => {
  const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
  const PROCESSOR_ID = '99999999-9999-4999-8999-999999999999';
  const OPERATION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const OTHER_OPERATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const CORRELATION_ID = '55555555-5555-4555-8555-555555555555';
  const SUBJECT_SCOPE_ID = '22222222-2222-4222-8222-222222222222';
  const INVENTORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const INVENTORY_DIGEST = '1'.repeat(64);
  const DESCRIPTOR_DIGEST = '2'.repeat(64);
  const RECORDED_AT = '2026-08-18T12:00:00.000Z';

  function buildInventory(
    overrides: Partial<{
      inventoryVersionDigest: string;
      processors: readonly Record<string, unknown>[];
    }> = {},
  ): PrivacyExpectedProcessorInventory {
    return privacyExpectedProcessorInventorySchema.parse({
      schemaVersion: 'privacy.processor-inventory.v1',
      inventoryId: INVENTORY_ID,
      inventoryVersionDigest:
        overrides.inventoryVersionDigest ?? INVENTORY_DIGEST,
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      sourceCommit: '2a59a47',
      processors: overrides.processors ?? [
        {
          processorId: PROCESSOR_ID,
          registrationVersion: 1,
          inventoryId: INVENTORY_ID,
          descriptorDigest: DESCRIPTOR_DIGEST,
          codeOwner: 'packages.domain.privacy',
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
          environmentApplicability: 'synthetic_only',
          requiredReadiness: 'mechanism_only',
          synthetic: true,
        },
      ],
    });
  }

  function buildRequest(
    overrides: Partial<{
      inventoryVersionDigest: string;
      state: 'in_progress' | 'partially_failed' | 'completed';
    }> = {},
  ) {
    return privacySubjectRequestReferenceSchema.parse({
      requestId: REQUEST_ID,
      requestType: 'export',
      state: overrides.state ?? 'in_progress',
      subjectScopeId: SUBJECT_SCOPE_ID,
      verification: null,
      policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      inventoryVersionDigest:
        overrides.inventoryVersionDigest ?? INVENTORY_DIGEST,
      correlationId: CORRELATION_ID,
      updatedAt: RECORDED_AT,
    });
  }

  function baseInput(
    overrides: Partial<{
      expectedInventory: { getInventory: () => Promise<unknown> };
      execution: { execute: (input: unknown) => Promise<unknown> };
      receipts: { listByOperationId: (id: string) => Promise<unknown> };
      requests: { get: (id: string) => Promise<unknown> };
      steps: {
        append: (step: unknown) => Promise<unknown>;
        listForRequest: (id: string) => Promise<unknown>;
      };
    }> = {},
  ) {
    return {
      clock: new SyntheticPrivacyTrustedClock(RECORDED_AT),
      execution: overrides.execution ?? {
        execute: async () => {
          throw new Error('execution must not be invoked');
        },
      },
      expectedInventory:
        overrides.expectedInventory ??
        new SyntheticPrivacyExpectedProcessorInventory(buildInventory()),
      operationId: OPERATION_ID,
      productionMode: false,
      receipts: overrides.receipts ?? {
        listByOperationId: async () => {
          throw new Error('receipts must not be read');
        },
      },
      requestId: REQUEST_ID,
      requests: overrides.requests ?? {
        get: async () => buildRequest(),
      },
      steps: overrides.steps ?? {
        append: async () => 'accepted' as const,
        listForRequest: async () => [],
      },
    } as never;
  }

  it('rejects an execution attempt whose request pins a different inventory version', async () => {
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
          buildInventory({ inventoryVersionDigest: '9'.repeat(64) }),
        ),
        requests: { get: async () => buildRequest() },
      }),
    );

    expect(result).toEqual({ status: 'inventory_mismatch' });
  });

  it('refuses a plan with an undeclared processor/capability pairing', async () => {
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
          buildInventory({
            processors: [
              {
                processorId: PROCESSOR_ID,
                registrationVersion: 1,
                inventoryId: INVENTORY_ID,
                descriptorDigest: DESCRIPTOR_DIGEST,
                codeOwner: 'packages.domain.privacy',
                adapterPackage: '@fitness-os/domain',
                storageKind: 'in_memory_synthetic',
                allowedPurposeIds: [],
                allowedCategoryIds: [],
                subjectLookupStrategy: 'synthetic_scope_id',
                supportedCapabilities: [],
                unsupportedCapabilities: [],
                recordFamilies: [
                  {
                    family: 'privacy_export_metadata',
                    lifecycleAction: 'retain_until_reviewed',
                  },
                ],
                environmentApplicability: 'synthetic_only',
                requiredReadiness: 'mechanism_only',
                synthetic: true,
              },
            ],
          }),
        ),
      }),
    );

    expect(result).toEqual({ status: 'plan_incomplete' });
  });

  it('refuses a plan built from an empty reviewed inventory', async () => {
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
          buildInventory({ processors: [] }),
        ),
      }),
    );

    expect(result).toEqual({ status: 'plan_incomplete' });
  });

  it('treats a plan whose only processor is wholly exempted as incomplete', async () => {
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
          buildInventory({
            processors: [
              {
                processorId: PROCESSOR_ID,
                registrationVersion: 1,
                inventoryId: INVENTORY_ID,
                descriptorDigest: DESCRIPTOR_DIGEST,
                codeOwner: 'packages.domain.privacy',
                adapterPackage: '@fitness-os/domain',
                storageKind: 'in_memory_synthetic',
                allowedPurposeIds: [],
                allowedCategoryIds: [],
                subjectLookupStrategy: 'synthetic_scope_id',
                supportedCapabilities: [],
                unsupportedCapabilities: [
                  {
                    capability: 'export',
                    rationale: 'not_in_scope_for_candidate',
                  },
                ],
                recordFamilies: [
                  {
                    family: 'privacy_export_metadata',
                    lifecycleAction: 'retain_until_reviewed',
                  },
                ],
                environmentApplicability: 'synthetic_only',
                requiredReadiness: 'mechanism_only',
                synthetic: true,
              },
            ],
          }),
        ),
      }),
    );

    expect(result).toEqual({ status: 'plan_incomplete' });
  });

  it('reports no pending step when every planned pair already has a terminal success', async () => {
    const priorStep = privacyProcessorStepReferenceSchema.parse({
      stepId: OTHER_OPERATION_ID,
      requestId: REQUEST_ID,
      processorId: PROCESSOR_ID,
      capability: 'export',
      outcome: 'completed',
      operationId: OTHER_OPERATION_ID,
      correlationId: CORRELATION_ID,
      recordedAt: RECORDED_AT,
    });

    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        steps: {
          append: async () => {
            throw new Error('must not append a new step');
          },
          listForRequest: async () => [priorStep],
        },
      }),
    );

    expect(result).toEqual({ status: 'no_pending_step' });
  });

  it('refuses to execute when the recorded history already holds more than one record for this operation', async () => {
    const duplicate = privacyProcessorStepReferenceSchema.parse({
      stepId: OPERATION_ID,
      requestId: REQUEST_ID,
      processorId: PROCESSOR_ID,
      capability: 'export',
      outcome: 'completed',
      operationId: OPERATION_ID,
      correlationId: CORRELATION_ID,
      recordedAt: RECORDED_AT,
    });

    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        steps: {
          append: async () => {
            throw new Error('must not append a new step');
          },
          listForRequest: async () => [duplicate, duplicate],
        },
      }),
    );

    expect(result).toEqual({ status: 'execution_conflict' });
  });

  it('refuses to execute when a recorded step carries a stepId that does not match its own operationId', async () => {
    const corrupted = privacyProcessorStepReferenceSchema.parse({
      stepId: OTHER_OPERATION_ID,
      requestId: REQUEST_ID,
      processorId: PROCESSOR_ID,
      capability: 'export',
      outcome: 'completed',
      operationId: OPERATION_ID,
      correlationId: CORRELATION_ID,
      recordedAt: RECORDED_AT,
    });

    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        steps: {
          append: async () => {
            throw new Error('must not append a new step');
          },
          listForRequest: async () => [corrupted],
        },
      }),
    );

    expect(result).toEqual({ status: 'execution_conflict' });
  });

  it('surfaces execution-coordinator unavailability without recording a step', async () => {
    let appended = false;
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        execution: { execute: async () => ({ status: 'unavailable' }) },
        steps: {
          append: async () => {
            appended = true;
            return 'accepted' as const;
          },
          listForRequest: async () => [],
        },
      }),
    );

    expect(result).toEqual({ status: 'execution_unavailable' });
    expect(appended).toBe(false);
  });

  it('passes through an execution-coordinator reconciliation requirement', async () => {
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        execution: {
          execute: async () => ({ status: 'reconciliation_required' }),
        },
      }),
    );

    expect(result).toEqual({ status: 'reconciliation_required' });
  });

  it('rejects a claimed execution with no independently verifiable receipt', async () => {
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        execution: { execute: async () => ({ status: 'executed' }) },
        receipts: { listByOperationId: async () => [] },
      }),
    );

    expect(result).toEqual({ status: 'receipt_invalid' });
  });

  it('treats an unreachable independent receipt source as unavailable after a claimed execution', async () => {
    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        execution: { execute: async () => ({ status: 'executed' }) },
        receipts: {
          listByOperationId: async () => {
            throw new Error('receipt source unreachable');
          },
        },
      }),
    );

    expect(result).toEqual({ status: 'execution_unavailable' });
  });

  it('rejects a replay whose stored outcome disagrees with the independently verified receipt', async () => {
    const replayedStep = privacyProcessorStepReferenceSchema.parse({
      stepId: OPERATION_ID,
      requestId: REQUEST_ID,
      processorId: PROCESSOR_ID,
      capability: 'export',
      outcome: 'completed',
      operationId: OPERATION_ID,
      correlationId: CORRELATION_ID,
      recordedAt: RECORDED_AT,
    });

    const result = await coordinateSyntheticProcessorStep(
      baseInput({
        execution: { execute: async () => ({ status: 'executed' }) },
        steps: {
          append: async () => {
            throw new Error('must not append a new step');
          },
          listForRequest: async () => [replayedStep],
        },
        receipts: {
          listByOperationId: async () => [
            privacyProcessorExecutionReceiptSchema.parse({
              requestId: REQUEST_ID,
              processorId: PROCESSOR_ID,
              capability: 'export',
              outcome: 'permanent_failure',
              operationId: OPERATION_ID,
              correlationId: CORRELATION_ID,
            }),
          ],
        },
      }),
    );

    expect(result).toEqual({ status: 'receipt_invalid' });
  });
});

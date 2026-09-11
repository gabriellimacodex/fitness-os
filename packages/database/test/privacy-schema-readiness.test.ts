import { describe, expect, it } from 'vitest';

import {
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacyRuntimeProcessorRegistry,
  type PrivacyExpectedProcessorInventoryPort,
  type PrivacyReadinessProbe,
  type PrivacyRuntimeProcessorRegistry,
} from '@fitness-os/domain';
import {
  privacyExpectedProcessorInventorySchema,
  privacyProcessorDescriptorReferenceSchema,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../src/connection.js';
import { createPostgresPrivacyReadinessProbe } from '../src/privacy/readiness.js';

const processor = privacyProcessorDescriptorReferenceSchema.parse({
  processorId: '99999999-9999-4999-8999-999999999999',
  inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  descriptorDigest: 'c'.repeat(64),
  inventoryVersionDigest: 'd'.repeat(64),
  allowedPurposeIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
  allowedCategoryIds: ['44444444-4444-4444-8444-444444444444'],
  capabilities: ['access', 'inventory'],
  supportsSubjectLookup: true,
  codeOwner: 'packages.domain.privacy',
  synthetic: true,
});

const expectedInventoryArtifact = privacyExpectedProcessorInventorySchema.parse(
  {
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: processor.inventoryId,
    inventoryVersionDigest: processor.inventoryVersionDigest,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: '579b735',
    processors: [
      {
        processorId: processor.processorId,
        registrationVersion: 1,
        inventoryId: processor.inventoryId,
        descriptorDigest: processor.descriptorDigest,
        codeOwner: processor.codeOwner,
        adapterPackage: '@fitness-os/domain',
        storageKind: 'in_memory_synthetic',
        allowedPurposeIds: processor.allowedPurposeIds,
        allowedCategoryIds: processor.allowedCategoryIds,
        subjectLookupStrategy: 'synthetic_scope_id',
        supportedCapabilities: processor.capabilities,
        unsupportedCapabilities: [
          { capability: 'delete', rationale: 'deferred_to_later_prd21_slice' },
        ],
        recordFamilies: [
          {
            family: 'privacy_audit_event',
            lifecycleAction: 'retain_until_reviewed',
          },
        ],
        environmentApplicability: 'synthetic_only',
        requiredReadiness: 'mechanism_only',
        synthetic: true,
      },
    ],
  },
);

const connectionStub = {
  close: async () => undefined,
  db: { execute: async () => [] },
} as unknown as PostgresConnection;

describe('privacy schema readiness', () => {
  it('fails closed when the base probe omits migrations and repositories', async () => {
    const connection = {
      close: async () => undefined,
      db: { execute: async () => [] },
    } as unknown as PostgresConnection;
    const baseProbe: PrivacyReadinessProbe = {
      evaluate: async () => ({
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        components: [
          { componentId: 'contracts', diagnosticCode: null, state: 'ready' },
        ],
        diagnosticCodes: [],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        inventoryVersionDigest: 'b'.repeat(64),
        mechanismReady: true,
        productionReady: false,
        schemaDigest: 'a'.repeat(64),
      }),
    };

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      baseProbe,
      requiredHashes: ['0'.repeat(64)],
    }).evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(
      result.components.filter((component) =>
        ['migrations', 'repositories', 'audit_sink'].includes(
          component.componentId,
        ),
      ),
    ).toEqual([
      {
        componentId: 'migrations',
        diagnosticCode: 'migration_missing',
        state: 'not_ready',
      },
      {
        componentId: 'repositories',
        diagnosticCode: 'repository_unavailable',
        state: 'not_ready',
      },
      {
        componentId: 'audit_sink',
        diagnosticCode: 'audit_unavailable',
        state: 'not_ready',
      },
    ]);
  });

  it('keeps migrations ready when only required privacy tables are missing', async () => {
    const connection = {
      close: async () => undefined,
      db: { execute: async () => [] },
    } as unknown as PostgresConnection;

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      evaluatedAt: '2026-08-31T00:00:00.000Z',
      requiredHashes: [],
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'migrations',
      diagnosticCode: null,
      state: 'ready',
    });
    expect(result.components).toContainEqual({
      componentId: 'repositories',
      diagnosticCode: 'repository_unavailable',
      state: 'not_ready',
    });
    expect(result.components).toContainEqual({
      componentId: 'audit_sink',
      diagnosticCode: 'audit_unavailable',
      state: 'not_ready',
    });
  });

  it('preserves an overridden diagnostic still used by another component', async () => {
    let executeCount = 0;
    const connection = {
      close: async () => undefined,
      db: {
        execute: async () => {
          executeCount += 1;
          return executeCount === 1
            ? []
            : [
                { tablename: 'privacy_policy_package_version' },
                { tablename: 'privacy_purpose_version' },
                { tablename: 'privacy_processor_registration' },
                { tablename: 'privacy_authorization_evidence' },
                { tablename: 'privacy_withdrawal' },
                { tablename: 'privacy_audit_event' },
                { tablename: 'privacy_subject_request' },
                { tablename: 'privacy_subject_request_transition' },
              ];
        },
      },
    } as unknown as PostgresConnection;
    const baseProbe: PrivacyReadinessProbe = {
      evaluate: async () => ({
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        components: [
          { componentId: 'contracts', diagnosticCode: null, state: 'ready' },
          {
            componentId: 'migrations',
            diagnosticCode: 'migration_missing',
            state: 'not_ready',
          },
          {
            componentId: 'repositories',
            diagnosticCode: 'repository_unavailable',
            state: 'unavailable',
          },
          { componentId: 'audit_sink', diagnosticCode: null, state: 'ready' },
          {
            componentId: 'expected_inventory',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'runtime_processors',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'governance_lifecycle',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'identity_boundary',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'policy_package',
            diagnosticCode: 'repository_unavailable',
            state: 'unavailable',
          },
          { componentId: 'recovery', diagnosticCode: null, state: 'ready' },
        ],
        diagnosticCodes: [
          'legal_privacy_decision_required',
          'migration_missing',
          'repository_unavailable',
        ],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        inventoryVersionDigest: 'b'.repeat(64),
        mechanismReady: false,
        productionReady: false,
        schemaDigest: 'a'.repeat(64),
      }),
    };

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      baseProbe,
      requiredHashes: [],
    }).evaluate();

    expect(result.diagnosticCodes).toContain('repository_unavailable');
    expect(result.diagnosticCodes).not.toContain('migration_missing');
  });

  it('flips audit_sink ready once the core schema is ready, reusing the same evidence as repositories', async () => {
    let executeCount = 0;
    const connection = {
      close: async () => undefined,
      db: {
        execute: async () => {
          executeCount += 1;
          return executeCount === 1
            ? []
            : [
                { tablename: 'privacy_policy_package_version' },
                { tablename: 'privacy_purpose_version' },
                { tablename: 'privacy_processor_registration' },
                { tablename: 'privacy_authorization_evidence' },
                { tablename: 'privacy_withdrawal' },
                { tablename: 'privacy_audit_event' },
                { tablename: 'privacy_subject_request' },
                { tablename: 'privacy_subject_request_transition' },
              ];
        },
      },
    } as unknown as PostgresConnection;

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      evaluatedAt: '2026-08-31T00:00:00.000Z',
      requiredHashes: [],
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'audit_sink',
      diagnosticCode: null,
      state: 'ready',
    });
    expect(result.diagnosticCodes).not.toContain('audit_unavailable');
  });
});

describe('privacy recovery readiness', () => {
  it('reports recovery not_ready with recovery_unverified when no append-only guard triggers are present', async () => {
    const connection = {
      close: async () => undefined,
      db: { execute: async () => [] },
    } as unknown as PostgresConnection;

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      evaluatedAt: '2026-08-31T00:00:00.000Z',
      requiredHashes: [],
    }).evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(result.components).toContainEqual({
      componentId: 'recovery',
      diagnosticCode: 'recovery_unverified',
      state: 'not_ready',
    });
    expect(result.diagnosticCodes).toContain('recovery_unverified');
  });

  it('reports recovery not_ready with recovery_unverified when only some required guard triggers are present', async () => {
    const connection = {
      close: async () => undefined,
      db: {
        execute: async () => [
          { tgname: 'privacy_audit_event_append_only_guard' },
          { tgname: 'privacy_withdrawal_append_only_guard' },
        ],
      },
    } as unknown as PostgresConnection;

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      evaluatedAt: '2026-08-31T00:00:00.000Z',
      requiredHashes: [],
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'recovery',
      diagnosticCode: 'recovery_unverified',
      state: 'not_ready',
    });
  });

  it('reports recovery ready once every required append-only guard trigger is present', async () => {
    const connection = {
      close: async () => undefined,
      db: {
        execute: async () => [
          { tgname: 'privacy_authorization_evidence_append_only_guard' },
          { tgname: 'privacy_withdrawal_append_only_guard' },
          { tgname: 'privacy_audit_event_append_only_guard' },
          { tgname: 'privacy_subject_request_transition_append_only_guard' },
          { tgname: 'privacy_policy_package_version_append_only_guard' },
          { tgname: 'privacy_purpose_version_append_only_guard' },
          { tgname: 'privacy_processor_registration_append_only_guard' },
          // An unrelated trigger must not be required or otherwise affect
          // the result.
          { tgname: 'some_other_unrelated_guard' },
        ],
      },
    } as unknown as PostgresConnection;

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      evaluatedAt: '2026-08-31T00:00:00.000Z',
      requiredHashes: [],
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'recovery',
      diagnosticCode: null,
      state: 'ready',
    });
    expect(result.diagnosticCodes).not.toContain('recovery_unverified');
  });

  it('reports recovery not_ready with recovery_unverified on a database error', async () => {
    const connection = {
      close: async () => undefined,
      db: {
        execute: async () => {
          throw new Error('connection refused');
        },
      },
    } as unknown as PostgresConnection;

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      evaluatedAt: '2026-08-31T00:00:00.000Z',
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'recovery',
      diagnosticCode: 'recovery_unverified',
      state: 'not_ready',
    });
  });
});

describe('privacy readiness inventory coverage override', () => {
  it('leaves expected_inventory and runtime_processors exactly as the base probe reports them when the ports are omitted', async () => {
    const result =
      await createPostgresPrivacyReadinessProbe(connectionStub).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'expected_inventory',
      state: 'not_ready',
      diagnosticCode: 'inventory_mismatch',
    });
    expect(result.components).toContainEqual({
      componentId: 'runtime_processors',
      state: 'not_ready',
      diagnosticCode: 'processor_missing',
    });
  });

  it('reports expected_inventory and runtime_processors ready when the runtime registry exactly matches the reviewed inventory', async () => {
    const expectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
      expectedInventoryArtifact,
    );
    const runtimeProcessors = new SyntheticPrivacyRuntimeProcessorRegistry();
    runtimeProcessors.seed(processor);

    const result = await createPostgresPrivacyReadinessProbe(connectionStub, {
      expectedInventory,
      runtimeProcessors,
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'expected_inventory',
      state: 'ready',
      diagnosticCode: null,
    });
    expect(result.components).toContainEqual({
      componentId: 'runtime_processors',
      state: 'ready',
      diagnosticCode: null,
    });
    expect(result.diagnosticCodes).not.toContain('inventory_mismatch');
    expect(result.diagnosticCodes).not.toContain('processor_missing');
  });

  it('reports both components not_ready with processor_missing when an expected processor is absent from the runtime registry', async () => {
    const expectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
      expectedInventoryArtifact,
    );
    const runtimeProcessors = new SyntheticPrivacyRuntimeProcessorRegistry();

    const result = await createPostgresPrivacyReadinessProbe(connectionStub, {
      expectedInventory,
      runtimeProcessors,
    }).evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(result.components).toContainEqual({
      componentId: 'expected_inventory',
      state: 'not_ready',
      diagnosticCode: 'inventory_mismatch',
    });
    expect(result.components).toContainEqual({
      componentId: 'runtime_processors',
      state: 'not_ready',
      diagnosticCode: 'processor_missing',
    });
    expect(result.diagnosticCodes).toContain('processor_missing');
    expect(result.diagnosticCodes).toContain('inventory_mismatch');
  });

  it('reports both components not_ready with inventory_mismatch when the runtime descriptor is present but its content diverges', async () => {
    const expectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
      expectedInventoryArtifact,
    );
    const runtimeProcessors = new SyntheticPrivacyRuntimeProcessorRegistry();
    runtimeProcessors.seed({ ...processor, descriptorDigest: 'f'.repeat(64) });

    const result = await createPostgresPrivacyReadinessProbe(connectionStub, {
      expectedInventory,
      runtimeProcessors,
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'expected_inventory',
      state: 'not_ready',
      diagnosticCode: 'inventory_mismatch',
    });
    expect(result.components).toContainEqual({
      componentId: 'runtime_processors',
      state: 'not_ready',
      diagnosticCode: 'inventory_mismatch',
    });
  });

  it('drops the base probe stale codes and re-adds only what the real coverage check reports', async () => {
    const baseProbe: PrivacyReadinessProbe = {
      evaluate: async () => ({
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        components: [
          { componentId: 'contracts', diagnosticCode: null, state: 'ready' },
          {
            componentId: 'migrations',
            diagnosticCode: 'migration_missing',
            state: 'not_ready',
          },
          {
            componentId: 'repositories',
            diagnosticCode: 'repository_unavailable',
            state: 'unavailable',
          },
          { componentId: 'audit_sink', diagnosticCode: null, state: 'ready' },
          {
            componentId: 'expected_inventory',
            diagnosticCode: 'inventory_mismatch',
            state: 'not_ready',
          },
          {
            componentId: 'runtime_processors',
            diagnosticCode: 'processor_missing',
            state: 'not_ready',
          },
          {
            componentId: 'governance_lifecycle',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'identity_boundary',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'policy_package',
            diagnosticCode: null,
            state: 'ready',
          },
          { componentId: 'recovery', diagnosticCode: null, state: 'ready' },
        ],
        diagnosticCodes: [
          'legal_privacy_decision_required',
          'inventory_mismatch',
          'processor_missing',
        ],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        inventoryVersionDigest: 'b'.repeat(64),
        mechanismReady: false,
        productionReady: false,
        schemaDigest: 'a'.repeat(64),
      }),
    };
    const expectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
      expectedInventoryArtifact,
    );
    const runtimeProcessors = new SyntheticPrivacyRuntimeProcessorRegistry();
    runtimeProcessors.seed(processor);

    const result = await createPostgresPrivacyReadinessProbe(connectionStub, {
      baseProbe,
      requiredHashes: [],
      expectedInventory,
      runtimeProcessors,
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'expected_inventory',
      state: 'ready',
      diagnosticCode: null,
    });
    expect(result.components).toContainEqual({
      componentId: 'runtime_processors',
      state: 'ready',
      diagnosticCode: null,
    });
    expect(result.diagnosticCodes).not.toContain('inventory_mismatch');
    expect(result.diagnosticCodes).not.toContain('processor_missing');
  });

  it('fails closed with repository_unavailable on both components, instead of rejecting, when expectedInventory.getInventory() throws', async () => {
    const throwingExpectedInventory: PrivacyExpectedProcessorInventoryPort = {
      getInventory: async () => {
        throw new Error('inventory artifact store unavailable');
      },
    };
    const runtimeProcessors = new SyntheticPrivacyRuntimeProcessorRegistry();
    runtimeProcessors.seed(processor);

    const result = await createPostgresPrivacyReadinessProbe(connectionStub, {
      expectedInventory: throwingExpectedInventory,
      runtimeProcessors,
    }).evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(result.components).toContainEqual({
      componentId: 'expected_inventory',
      state: 'not_ready',
      diagnosticCode: 'repository_unavailable',
    });
    expect(result.components).toContainEqual({
      componentId: 'runtime_processors',
      state: 'not_ready',
      diagnosticCode: 'repository_unavailable',
    });
    expect(result.diagnosticCodes).toContain('repository_unavailable');
  });

  it('fails closed with repository_unavailable on both components, instead of rejecting, when runtimeProcessors.listDescriptors() throws', async () => {
    const expectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
      expectedInventoryArtifact,
    );
    const throwingRuntimeProcessors: PrivacyRuntimeProcessorRegistry = {
      getDescriptor: async () => null,
      listDescriptors: async () => {
        throw new Error('connection terminated unexpectedly');
      },
      put: async () => {
        throw new Error('not exercised by this test');
      },
    };

    const result = await createPostgresPrivacyReadinessProbe(connectionStub, {
      expectedInventory,
      runtimeProcessors: throwingRuntimeProcessors,
    }).evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(result.components).toContainEqual({
      componentId: 'expected_inventory',
      state: 'not_ready',
      diagnosticCode: 'repository_unavailable',
    });
    expect(result.components).toContainEqual({
      componentId: 'runtime_processors',
      state: 'not_ready',
      diagnosticCode: 'repository_unavailable',
    });
    expect(result.diagnosticCodes).toContain('repository_unavailable');
  });
});

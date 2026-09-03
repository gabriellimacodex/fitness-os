import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SyntheticPrivacyExpectedProcessorInventory } from '@fitness-os/domain';
import {
  privacyExpectedProcessorInventorySchema,
  privacyProcessorDescriptorReferenceSchema,
} from '@fitness-os/schemas';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresPrivacyReadinessProbe } from '../src/privacy/readiness.js';
import { createPostgresPrivacyRuntimeProcessorRegistry } from '../src/privacy/registries.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

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

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'createPostgresPrivacyReadinessProbe (disposable PG)',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    afterAll(async () => {
      await connection.close();
    });

    it('reports migrations, repositories, and governance_lifecycle ready and leaves every other component as the base probe reports it', async () => {
      const probe = createPostgresPrivacyReadinessProbe(connection, {
        evaluatedAt: '2026-08-27T00:00:00.000Z',
      });

      const result = await probe.evaluate();

      // Only migrations/repositories/governance_lifecycle are DB-verified by
      // this probe; the synthetic base probe's other components stay
      // not_ready/unavailable, so mechanismReady correctly remains false.
      expect(result.mechanismReady).toBe(false);
      expect(result.productionReady).toBe(false);
      expect(result.evaluatedAt).toBe('2026-08-27T00:00:00.000Z');
      expect(result.components).toContainEqual({
        componentId: 'migrations',
        state: 'ready',
        diagnosticCode: null,
      });
      expect(result.components).toContainEqual({
        componentId: 'repositories',
        state: 'ready',
        diagnosticCode: null,
      });
      expect(result.components).toContainEqual({
        componentId: 'governance_lifecycle',
        state: 'ready',
        diagnosticCode: null,
      });
      expect(result.components).toContainEqual({
        componentId: 'audit_sink',
        state: 'unavailable',
        diagnosticCode: 'audit_unavailable',
      });
      expect(result.diagnosticCodes).not.toContain('migration_missing');
      expect(result.diagnosticCodes).not.toContain('repository_unavailable');
      expect(result.diagnosticCodes).not.toContain(
        'governance_table_lifecycle_missing',
      );
      expect(result.diagnosticCodes).toContain(
        'legal_privacy_decision_required',
      );
    });

    it('reports migrations not_ready with migration_missing and flips mechanismReady false on a missing required migration', async () => {
      const probe = createPostgresPrivacyReadinessProbe(connection, {
        evaluatedAt: '2026-08-27T00:00:00.000Z',
        requiredHashes: ['0'.repeat(64)],
      });

      const result = await probe.evaluate();

      expect(result.mechanismReady).toBe(false);
      expect(result.productionReady).toBe(false);
      expect(result.components).toContainEqual({
        componentId: 'migrations',
        state: 'not_ready',
        diagnosticCode: 'migration_missing',
      });
      expect(result.components).toContainEqual({
        componentId: 'repositories',
        state: 'not_ready',
        diagnosticCode: 'repository_unavailable',
      });
      expect(result.diagnosticCodes).toContain('migration_missing');
      expect(result.diagnosticCodes).toContain('repository_unavailable');
    });

    it('reports governance_lifecycle not_ready with governance_table_lifecycle_missing and flips mechanismReady false on a missing required migration, independent of the core migrations/repositories result', async () => {
      const probe = createPostgresPrivacyReadinessProbe(connection, {
        evaluatedAt: '2026-08-27T00:00:00.000Z',
        governanceLifecycleRequiredHashes: ['0'.repeat(64)],
      });

      const result = await probe.evaluate();

      expect(result.mechanismReady).toBe(false);
      expect(result.productionReady).toBe(false);
      expect(result.components).toContainEqual({
        componentId: 'migrations',
        state: 'ready',
        diagnosticCode: null,
      });
      expect(result.components).toContainEqual({
        componentId: 'repositories',
        state: 'ready',
        diagnosticCode: null,
      });
      expect(result.components).toContainEqual({
        componentId: 'governance_lifecycle',
        state: 'not_ready',
        diagnosticCode: 'governance_table_lifecycle_missing',
      });
      expect(result.diagnosticCodes).toContain(
        'governance_table_lifecycle_missing',
      );
      expect(result.diagnosticCodes).not.toContain('migration_missing');
      expect(result.diagnosticCodes).not.toContain('repository_unavailable');
    });

    // Runs before the following test seeds `privacy_processor_registration`,
    // so this exercises the real registry table while it is still empty.
    it('reports expected_inventory and runtime_processors not_ready with processor_missing when the real PG-backed runtime registry has no matching registration', async () => {
      const runtimeProcessors =
        createPostgresPrivacyRuntimeProcessorRegistry(connection);

      const probe = createPostgresPrivacyReadinessProbe(connection, {
        evaluatedAt: '2026-08-27T00:00:00.000Z',
        expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
          expectedInventoryArtifact,
        ),
        runtimeProcessors,
      });

      const result = await probe.evaluate();

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
    });

    it('reports expected_inventory and runtime_processors ready from the real PG-backed runtime registry once the reviewed processor is registered', async () => {
      const runtimeProcessors =
        createPostgresPrivacyRuntimeProcessorRegistry(connection);
      const putResult = await runtimeProcessors.put(processor);
      expect(putResult).toBe('accepted');

      const probe = createPostgresPrivacyReadinessProbe(connection, {
        evaluatedAt: '2026-08-27T00:00:00.000Z',
        expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
          expectedInventoryArtifact,
        ),
        runtimeProcessors,
      });

      const result = await probe.evaluate();

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
  },
);

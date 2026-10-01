import { fileURLToPath } from 'node:url';

import { SyntheticPrivacyExpectedProcessorInventory } from '@fitness-os/domain';
import {
  privacyExpectedProcessorInventorySchema,
  privacyProcessorDescriptorReferenceSchema,
} from '@fitness-os/schemas';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createPrivacyPlatformFromEnv } from './platform.js';

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/database/drizzle', import.meta.url),
);

function requireDisposableDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  }
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname.slice(1) !== 'fitness_os_prd02_test'
  ) {
    throw new Error(
      'PostgreSQL tests require the local fitness_os_prd02_test database.',
    );
  }
  return value;
}

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
  'privacy platform env composition (disposable PG)',
  () => {
    let handles: ReturnType<typeof createPrivacyPlatformFromEnv> = null;

    beforeAll(async () => {
      const databaseUrl = requireDisposableDatabaseUrl();
      const bootstrap = createPrivacyPlatformFromEnv({
        PRIVACY_DATABASE_URL: databaseUrl,
      });
      if (!bootstrap) {
        throw new Error('expected a composed privacy platform');
      }
      await bootstrap.connection.db.execute(
        sql`DROP SCHEMA IF EXISTS drizzle CASCADE`,
      );
      await bootstrap.connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await bootstrap.connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(bootstrap.connection.db, { migrationsFolder });
      await bootstrap.connection.close();
    });

    afterEach(async () => {
      await handles?.connection.close();
      handles = null;
    });

    it('leaves expected_inventory/runtime_processors at the base synthetic defaults when no expectedInventory override is supplied', async () => {
      handles = createPrivacyPlatformFromEnv({
        PRIVACY_DATABASE_URL: requireDisposableDatabaseUrl(),
      });
      const result = await handles?.platform.privacy?.readiness?.evaluate();

      expect(result?.components).toContainEqual({
        componentId: 'expected_inventory',
        state: 'not_ready',
        diagnosticCode: 'inventory_mismatch',
      });
      expect(result?.components).toContainEqual({
        componentId: 'runtime_processors',
        state: 'not_ready',
        diagnosticCode: 'processor_missing',
      });
    });

    it('binds runtimeProcessors to the same PG-backed registry the platform exposes for real processor registration, reporting not_ready with processor_missing before registration', async () => {
      handles = createPrivacyPlatformFromEnv(
        { PRIVACY_DATABASE_URL: requireDisposableDatabaseUrl() },
        {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expectedInventoryArtifact,
          ),
        },
      );
      const result = await handles?.platform.privacy?.readiness?.evaluate();

      expect(result?.components).toContainEqual({
        componentId: 'expected_inventory',
        state: 'not_ready',
        diagnosticCode: 'inventory_mismatch',
      });
      expect(result?.components).toContainEqual({
        componentId: 'runtime_processors',
        state: 'not_ready',
        diagnosticCode: 'processor_missing',
      });
    });

    it('reports expected_inventory/runtime_processors ready once the reviewed processor is registered through the same platform composition', async () => {
      handles = createPrivacyPlatformFromEnv(
        { PRIVACY_DATABASE_URL: requireDisposableDatabaseUrl() },
        {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expectedInventoryArtifact,
          ),
        },
      );

      const putResult =
        await handles?.platform.privacy?.processors?.put(processor);
      expect(putResult).toBe('accepted');

      const result = await handles?.platform.privacy?.readiness?.evaluate();

      expect(result?.components).toContainEqual({
        componentId: 'expected_inventory',
        state: 'ready',
        diagnosticCode: null,
      });
      expect(result?.components).toContainEqual({
        componentId: 'runtime_processors',
        state: 'ready',
        diagnosticCode: null,
      });
    });
  },
);

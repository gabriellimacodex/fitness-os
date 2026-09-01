import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import {
  checkOnboardingSchemaReadiness,
  createPostgresOnboardingReadinessProbe,
} from '../src/onboarding/readiness.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 onboarding schema readiness (disposable PG)',
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

    it('reports ready after the required migrations and tables are present', async () => {
      await expect(checkOnboardingSchemaReadiness(connection)).resolves.toEqual(
        { ready: true },
      );
    });

    it('reports missing_required_migration for an unapplied hash', async () => {
      await expect(
        checkOnboardingSchemaReadiness(connection, {
          requiredHashes: ['0'.repeat(64)],
        }),
      ).resolves.toEqual({
        ready: false,
        reason: 'missing_required_migration',
        detail: '0'.repeat(64),
      });
    });

    describe('createPostgresOnboardingReadinessProbe', () => {
      it('reports the schema component ready and leaves every other component as the base probe reports it', async () => {
        const probe = createPostgresOnboardingReadinessProbe(connection, {
          evaluatedAt: '2026-08-27T00:00:00.000Z',
        });

        const result = await probe.evaluate();

        expect(result.mechanismReady).toBe(true);
        expect(result.productionReady).toBe(false);
        expect(result.evaluatedAt).toBe('2026-08-27T00:00:00.000Z');
        expect(result.components).toContainEqual({
          componentId: 'schema',
          diagnosticCode: null,
          state: 'ready',
        });
        expect(result.components).toContainEqual({
          componentId: 'identity_adapter',
          diagnosticCode: 'identity_adapter_synthetic',
          state: 'ready',
        });
      });

      it('reports the schema component not_ready with migration_missing and flips mechanismReady false on a missing required migration', async () => {
        const probe = createPostgresOnboardingReadinessProbe(connection, {
          evaluatedAt: '2026-08-27T00:00:00.000Z',
          requiredHashes: ['0'.repeat(64)],
        });

        const result = await probe.evaluate();

        expect(result.mechanismReady).toBe(false);
        expect(result.productionReady).toBe(false);
        expect(result.components).toContainEqual({
          componentId: 'schema',
          diagnosticCode: 'migration_missing',
          state: 'not_ready',
        });
        expect(result.diagnosticCodes).toContain('migration_missing');
      });
    });
  },
);

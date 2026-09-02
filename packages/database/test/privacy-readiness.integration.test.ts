import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresPrivacyReadinessProbe } from '../src/privacy/readiness.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

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
  },
);

import { fileURLToPath } from 'node:url';

import {
  createPostgresConnection,
  createPostgresPrivacyReadinessProbe,
} from '@fitness-os/database';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

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

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'privacy PG-backed readiness probe composition',
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

    it('reports migrations/repositories ready through the synthetic readiness route when the PG-backed probe is injected', async () => {
      const readiness = createPostgresPrivacyReadinessProbe(connection, {
        evaluatedAt: '2026-08-27T00:00:00.000Z',
      });

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: { readiness },
        },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/privacy/synthetic/readiness',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // Only migrations/repositories are DB-verified by this probe; the
      // synthetic base probe's other components stay not_ready/unavailable,
      // so mechanismReady correctly remains false.
      expect(body.mechanismReady).toBe(false);
      expect(body.productionReady).toBe(false);
      expect(body.components).toContainEqual({
        componentId: 'migrations',
        diagnosticCode: null,
        state: 'ready',
      });
      expect(body.components).toContainEqual({
        componentId: 'repositories',
        diagnosticCode: null,
        state: 'ready',
      });
      expect(body.diagnosticCodes).toContain('legal_privacy_decision_required');

      await app.close();
    });

    it('reports migrations not_ready and mechanismReady false through the route on a missing required migration', async () => {
      const readiness = createPostgresPrivacyReadinessProbe(connection, {
        evaluatedAt: '2026-08-27T00:00:00.000Z',
        requiredHashes: ['0'.repeat(64)],
      });

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: { readiness },
        },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/privacy/synthetic/readiness',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.mechanismReady).toBe(false);
      expect(body.components).toContainEqual({
        componentId: 'migrations',
        diagnosticCode: 'migration_missing',
        state: 'not_ready',
      });

      await app.close();
    });
  },
);

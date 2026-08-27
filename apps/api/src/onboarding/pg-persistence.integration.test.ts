import { fileURLToPath } from 'node:url';

import { createPostgresConnection } from '@fitness-os/database';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createOnboardingPgPersistence } from './pg-persistence.js';

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
  'onboarding PG persistence synthetic HTTP composition',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE onboarding_principal_binding`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('establishes a principal binding through disposable Postgres on first request', async () => {
      const persistence = createOnboardingPgPersistence(connection);

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticOnboarding: true,
          onboarding: {
            principalBinding: persistence.principalBinding,
            resolveContext: () => ({
              mappedRoles: ['coach'],
              principalKey: 'coach-pg-binding-1',
              synthetic: true,
            }),
          },
        },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/onboarding/current',
      });

      expect(response.statusCode).toBe(200);

      const rows = await connection.db.execute<{
        principal_key: string;
      }>(sql`
        SELECT principal_key FROM onboarding_principal_binding
        WHERE principal_key = 'coach-pg-binding-1'
      `);
      expect(rows.length).toBe(1);

      await expect(
        persistence.principalBinding.getByPrincipalKey('coach-pg-binding-1'),
      ).resolves.toMatchObject({ principalKey: 'coach-pg-binding-1' });

      await app.close();
    });

    it('resolves the same binding on a repeat request instead of establishing a second row', async () => {
      const persistence = createOnboardingPgPersistence(connection);

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticOnboarding: true,
          onboarding: {
            principalBinding: persistence.principalBinding,
            resolveContext: () => ({
              mappedRoles: ['coach'],
              principalKey: 'coach-pg-binding-2',
              synthetic: true,
            }),
          },
        },
      );

      const first = await app.inject({
        method: 'GET',
        url: '/v1/onboarding/current',
      });
      const second = await app.inject({
        method: 'GET',
        url: '/v1/onboarding/current',
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const rows = await connection.db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM onboarding_principal_binding
        WHERE principal_key = 'coach-pg-binding-2'
      `);
      expect(rows[0]?.count).toBe('1');

      await app.close();
    });
  },
);

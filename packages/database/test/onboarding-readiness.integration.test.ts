import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { checkOnboardingSchemaReadiness } from '../src/onboarding/readiness.js';
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
  },
);

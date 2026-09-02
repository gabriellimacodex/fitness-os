import { fileURLToPath } from 'node:url';

import { createPostgresConnection } from '@fitness-os/database';
import { retryTokenSchema } from '@fitness-os/schemas';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createOnboardingPgPersistence } from './pg-persistence.js';
import { createOnboardingStore } from './store.js';

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
  'onboarding student invitation revoke PostgreSQL write-through',
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
      await connection.db.execute(sql`
        TRUNCATE onboarding_operation, onboarding_invitation CASCADE
      `);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('writes a revoked student invitation through to Postgres', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const app = buildApp(
        { logger: false },
        {
          allowSyntheticOnboarding: true,
          onboarding: {
            persistence,
            resolveContext: () => ({
              mappedRoles: ['coach'],
              principalKey: 'coach-revoke-1',
              synthetic: true,
            }),
            store,
          },
        },
      );

      const issued = await app.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: { retryToken: retryTokenSchema.parse('pg-revoke-issue-01') },
      });
      const issuedBody = issued.json() as {
        result: { issued: { invitationId: string } };
      };
      const invitationId = issuedBody.result.issued.invitationId;

      const revoked = await app.inject({
        method: 'POST',
        url: `/v1/onboarding/student-invitations/${invitationId}/revoke`,
        payload: { retryToken: retryTokenSchema.parse('pg-revoke-revoke-01') },
      });
      expect(revoked.statusCode).toBe(200);
      const revokedBody = revoked.json() as {
        operation: { state: string };
        result: { outcome: string; invitation?: { state: string } };
      };
      expect(revokedBody.operation.state).toBe('operation_committed');
      expect(revokedBody.result.outcome).toBe('command_succeeded');
      expect(revokedBody.result.invitation?.state).toBe('revoked');

      await app.close();

      const rows = await connection.db.execute<{ state: string }>(sql`
        SELECT state FROM onboarding_invitation WHERE invitation_id = ${invitationId}
      `);
      expect(rows.length).toBe(1);
      expect(rows[0]?.state).toBe('revoked');
    });

    it('replays a repeated revoke retry token without writing a second operation row', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const app = buildApp(
        { logger: false },
        {
          allowSyntheticOnboarding: true,
          onboarding: {
            persistence,
            resolveContext: () => ({
              mappedRoles: ['coach'],
              principalKey: 'coach-revoke-2',
              synthetic: true,
            }),
            store,
          },
        },
      );

      const issued = await app.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: { retryToken: retryTokenSchema.parse('pg-revoke-issue-02') },
      });
      const { invitationId } = (
        issued.json() as { result: { issued: { invitationId: string } } }
      ).result.issued;

      const retryToken = retryTokenSchema.parse('pg-revoke-repeat-01');
      const first = await app.inject({
        method: 'POST',
        url: `/v1/onboarding/student-invitations/${invitationId}/revoke`,
        payload: { retryToken },
      });
      const second = await app.inject({
        method: 'POST',
        url: `/v1/onboarding/student-invitations/${invitationId}/revoke`,
        payload: { retryToken },
      });
      await app.close();

      expect(
        (first.json() as { operation: { state: string } }).operation.state,
      ).toBe('operation_committed');
      expect(
        (second.json() as { operation: { state: string } }).operation.state,
      ).toBe('operation_replayed');

      const operationRows = await connection.db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM onboarding_operation
        WHERE principal_key = 'coach-revoke-2'
        AND namespace = 'revoke_student_invitation'
      `);
      expect(operationRows[0]?.count).toBe('1');
    });
  },
);

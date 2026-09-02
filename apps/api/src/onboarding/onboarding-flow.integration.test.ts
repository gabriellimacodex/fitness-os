import { fileURLToPath } from 'node:url';

import { createPostgresConnection } from '@fitness-os/database';
import { retryTokenSchema } from '@fitness-os/schemas';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import {
  createOnboardingPgPersistence,
  type OnboardingPgPersistence,
} from './pg-persistence.js';
import { createOnboardingStore, type OnboardingStore } from './store.js';

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
  'onboarding student invitation -> attempt -> claim PostgreSQL write-through',
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
        TRUNCATE
          onboarding_operation,
          onboarding_role_mapping,
          onboarding_attempt,
          onboarding_invitation
        CASCADE
      `);
    });

    afterAll(async () => {
      await connection.close();
    });

    function buildOnboardingApp(input: {
      mappedRoles: readonly ('student' | 'coach')[];
      persistence: OnboardingPgPersistence;
      principalKey: string;
      store: OnboardingStore;
    }) {
      return buildApp(
        { logger: false },
        {
          allowSyntheticOnboarding: true,
          onboarding: {
            persistence: input.persistence,
            resolveContext: () => ({
              mappedRoles: input.mappedRoles,
              principalKey: input.principalKey,
              synthetic: true,
            }),
            store: input.store,
          },
        },
      );
    }

    it('writes the issue, create-attempt, policy-refresh, and claim chain through to Postgres', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);

      const coachApp = buildOnboardingApp({
        mappedRoles: ['coach'],
        persistence,
        principalKey: 'coach-flow-1',
        store,
      });

      const issued = await coachApp.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: { retryToken: retryTokenSchema.parse('pg-flow-issue-01') },
      });
      expect(issued.statusCode).toBe(200);
      const issuedBody = issued.json() as {
        result: { issued: { claimSecret: string; invitationId: string } };
      };
      const { claimSecret, invitationId } = issuedBody.result.issued;
      await coachApp.close();

      const studentApp = buildOnboardingApp({
        mappedRoles: [],
        persistence,
        principalKey: 'student-flow-1',
        store,
      });

      const created = await studentApp.inject({
        method: 'POST',
        url: '/v1/onboarding/attempts',
        payload: {
          claimSecret,
          retryToken: retryTokenSchema.parse('pg-flow-create-01'),
        },
      });
      expect(created.statusCode).toBe(200);
      const createdBody = created.json() as {
        result: { outcome: string; attempt?: { attemptId: string } };
      };
      expect(createdBody.result.outcome).toBe('command_succeeded');
      const attemptId = createdBody.result.attempt?.attemptId;
      if (attemptId === undefined) {
        throw new Error('expected attempt');
      }

      const refreshed = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/policy-refresh`,
        payload: { retryToken: retryTokenSchema.parse('pg-flow-refresh-01') },
      });
      expect(refreshed.statusCode).toBe(200);
      const refreshedBody = refreshed.json() as {
        result: { attempt?: { lifecycle: string } };
      };
      expect(refreshedBody.result.attempt?.lifecycle).toBe('ready_to_claim');

      const claimed = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/claim`,
        payload: {
          claimSecret,
          retryToken: retryTokenSchema.parse('pg-flow-claim-01'),
        },
      });
      expect(claimed.statusCode).toBe(200);
      const claimedBody = claimed.json() as {
        result: { outcome: string; mappingId?: string; role?: string };
      };
      expect(claimedBody.result.outcome).toBe('completed');
      expect(claimedBody.result.role).toBe('student');
      const mappingId = claimedBody.result.mappingId;
      if (mappingId === undefined) {
        throw new Error('expected mappingId');
      }
      await studentApp.close();

      const invitationRows = await connection.db.execute<{ state: string }>(sql`
        SELECT state FROM onboarding_invitation WHERE invitation_id = ${invitationId}
      `);
      expect(invitationRows.length).toBe(1);
      expect(invitationRows[0]?.state).toBe('claimed');

      const attemptRows = await connection.db.execute<{
        lifecycle: string;
        principal_key: string;
      }>(sql`
        SELECT lifecycle, principal_key FROM onboarding_attempt WHERE attempt_id = ${attemptId}
      `);
      expect(attemptRows.length).toBe(1);
      expect(attemptRows[0]?.lifecycle).toBe('completed');
      expect(attemptRows[0]?.principal_key).toBe('student-flow-1');

      const mappingRows = await connection.db.execute<{
        principal_key: string;
        role: string;
      }>(sql`
        SELECT principal_key, role FROM onboarding_role_mapping WHERE mapping_id = ${mappingId}
      `);
      expect(mappingRows.length).toBe(1);
      expect(mappingRows[0]?.role).toBe('student');
      expect(mappingRows[0]?.principal_key).toBe('student-flow-1');

      const operationRows = await connection.db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM onboarding_operation
        WHERE principal_key IN ('coach-flow-1', 'student-flow-1')
      `);
      expect(Number(operationRows[0]?.count)).toBeGreaterThanOrEqual(3);
    });

    it('replays a repeated create-attempt retry token without writing a second operation row', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);

      const coachApp = buildOnboardingApp({
        mappedRoles: ['coach'],
        persistence,
        principalKey: 'coach-flow-2',
        store,
      });
      const issued = await coachApp.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: { retryToken: retryTokenSchema.parse('pg-flow-issue-02') },
      });
      const issuedBody = issued.json() as {
        result: { issued: { claimSecret: string } };
      };
      const { claimSecret } = issuedBody.result.issued;
      await coachApp.close();

      const studentApp = buildOnboardingApp({
        mappedRoles: [],
        persistence,
        principalKey: 'student-flow-2',
        store,
      });
      const retryToken = retryTokenSchema.parse('pg-flow-create-repeat-01');

      const first = await studentApp.inject({
        method: 'POST',
        url: '/v1/onboarding/attempts',
        payload: { claimSecret, retryToken },
      });
      const second = await studentApp.inject({
        method: 'POST',
        url: '/v1/onboarding/attempts',
        payload: { claimSecret, retryToken },
      });
      await studentApp.close();

      expect(
        (first.json() as { operation: { state: string } }).operation.state,
      ).toBe('operation_committed');
      expect(
        (second.json() as { operation: { state: string } }).operation.state,
      ).toBe('operation_replayed');

      const operationRows = await connection.db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM onboarding_operation
        WHERE principal_key = 'student-flow-2'
      `);
      expect(operationRows[0]?.count).toBe('1');
    });
  },
);

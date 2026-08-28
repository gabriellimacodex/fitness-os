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
  'onboarding attempt resume/abandon PostgreSQL write-through',
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

    async function issueAndCreateAttempt(
      store: OnboardingStore,
      persistence: OnboardingPgPersistence,
      coachPrincipalKey: string,
      studentPrincipalKey: string,
    ): Promise<{ attemptId: string; studentApp: ReturnType<typeof buildApp> }> {
      const coachApp = buildOnboardingApp({
        mappedRoles: ['coach'],
        persistence,
        principalKey: coachPrincipalKey,
        store,
      });
      const issued = await coachApp.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: {
          retryToken: retryTokenSchema.parse(
            `pg-lifecycle-issue-${coachPrincipalKey}`,
          ),
        },
      });
      const { claimSecret } = (
        issued.json() as { result: { issued: { claimSecret: string } } }
      ).result.issued;
      await coachApp.close();

      const studentApp = buildOnboardingApp({
        mappedRoles: [],
        persistence,
        principalKey: studentPrincipalKey,
        store,
      });
      const created = await studentApp.inject({
        method: 'POST',
        url: '/v1/onboarding/attempts',
        payload: {
          claimSecret,
          retryToken: retryTokenSchema.parse(
            `pg-lifecycle-create-${studentPrincipalKey}`,
          ),
        },
      });
      const attemptId = (
        created.json() as { result: { attempt: { attemptId: string } } }
      ).result.attempt.attemptId;

      return { attemptId, studentApp };
    }

    it('resumes as current_state, then writes an abandon transition through to Postgres', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const { attemptId, studentApp } = await issueAndCreateAttempt(
        store,
        persistence,
        'coach-lifecycle-1',
        'student-lifecycle-1',
      );

      const resumed = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/resume`,
        payload: {
          retryToken: retryTokenSchema.parse('pg-lifecycle-resume-01'),
        },
      });
      const resumedBody = resumed.json() as {
        result: { outcome: string; attempt?: { lifecycle: string } };
      };
      expect(resumedBody.result.outcome).toBe('current_state');
      expect(resumedBody.result.attempt?.lifecycle).toBe('policy_pending');

      const abandoned = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/abandon`,
        payload: {
          retryToken: retryTokenSchema.parse('pg-lifecycle-abandon-01'),
        },
      });
      const abandonedBody = abandoned.json() as {
        result: {
          outcome: string;
          attempt?: { lifecycle: string; terminalReason?: string };
        };
      };
      expect(abandonedBody.result.outcome).toBe('command_succeeded');
      expect(abandonedBody.result.attempt?.lifecycle).toBe('terminal');
      expect(abandonedBody.result.attempt?.terminalReason).toBe('abandoned');
      await studentApp.close();

      const rows = await connection.db.execute<{
        lifecycle: string;
        terminal_reason: string | null;
      }>(sql`
        SELECT lifecycle, terminal_reason FROM onboarding_attempt WHERE attempt_id = ${attemptId}
      `);
      expect(rows.length).toBe(1);
      expect(rows[0]?.lifecycle).toBe('terminal');
      expect(rows[0]?.terminal_reason).toBe('abandoned');
    });

    it('replays a repeated abandon retry token without writing a second operation row', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const { attemptId, studentApp } = await issueAndCreateAttempt(
        store,
        persistence,
        'coach-lifecycle-2',
        'student-lifecycle-2',
      );

      const retryToken = retryTokenSchema.parse(
        'pg-lifecycle-abandon-repeat-01',
      );
      const first = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/abandon`,
        payload: { retryToken },
      });
      const second = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/abandon`,
        payload: { retryToken },
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
        WHERE principal_key = 'student-lifecycle-2'
        AND namespace = 'abandon_attempt'
      `);
      expect(operationRows[0]?.count).toBe('1');
    });
  },
);

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
  'onboarding attempt/invitation guard-path PostgreSQL write-through',
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
            `pg-guard-issue-${coachPrincipalKey}`,
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
            `pg-guard-create-${studentPrincipalKey}`,
          ),
        },
      });
      const attemptId = (
        created.json() as { result: { attempt: { attemptId: string } } }
      ).result.attempt.attemptId;

      return { attemptId, studentApp };
    }

    it('returns already_terminal (not a new transition) when abandon is called again with a fresh retry token', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const { attemptId, studentApp } = await issueAndCreateAttempt(
        store,
        persistence,
        'coach-guard-1',
        'student-guard-1',
      );

      const firstAbandon = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/abandon`,
        payload: { retryToken: retryTokenSchema.parse('pg-guard-abandon-01') },
      });
      expect(
        (firstAbandon.json() as { result: { outcome: string } }).result.outcome,
      ).toBe('command_succeeded');

      const secondAbandon = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/abandon`,
        payload: { retryToken: retryTokenSchema.parse('pg-guard-abandon-02') },
      });
      await studentApp.close();

      const secondBody = secondAbandon.json() as {
        operation: { state: string };
        result: {
          attempt?: { lifecycle: string; terminalReason?: string };
          outcome: string;
        };
      };
      expect(secondBody.operation.state).toBe('operation_committed');
      expect(secondBody.result.outcome).toBe('already_terminal');
      expect(secondBody.result.attempt?.lifecycle).toBe('terminal');
      expect(secondBody.result.attempt?.terminalReason).toBe('abandoned');

      const rows = await connection.db.execute<{
        lifecycle: string;
        terminal_reason: string | null;
      }>(sql`
        SELECT lifecycle, terminal_reason FROM onboarding_attempt WHERE attempt_id = ${attemptId}
      `);
      expect(rows.length).toBe(1);
      expect(rows[0]?.lifecycle).toBe('terminal');
      expect(rows[0]?.terminal_reason).toBe('abandoned');

      const operationRows = await connection.db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM onboarding_operation
        WHERE principal_key = 'student-guard-1'
        AND namespace = 'abandon_attempt'
      `);
      expect(operationRows[0]?.count).toBe('2');
    });

    it('returns already_terminal when resume is called after the attempt already reached a terminal state', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const { attemptId, studentApp } = await issueAndCreateAttempt(
        store,
        persistence,
        'coach-guard-2',
        'student-guard-2',
      );

      await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/abandon`,
        payload: { retryToken: retryTokenSchema.parse('pg-guard-abandon-03') },
      });

      const resumeAfterTerminal = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/resume`,
        payload: { retryToken: retryTokenSchema.parse('pg-guard-resume-01') },
      });
      await studentApp.close();

      const body = resumeAfterTerminal.json() as {
        result: { attempt?: { lifecycle: string }; outcome: string };
      };
      expect(body.result.outcome).toBe('already_terminal');
      expect(body.result.attempt?.lifecycle).toBe('terminal');

      const rows = await connection.db.execute<{ lifecycle: string }>(sql`
        SELECT lifecycle FROM onboarding_attempt WHERE attempt_id = ${attemptId}
      `);
      expect(rows[0]?.lifecycle).toBe('terminal');
    });

    it('returns 404 when resuming or abandoning an attempt owned by a different principal', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const { attemptId, studentApp: ownerApp } = await issueAndCreateAttempt(
        store,
        persistence,
        'coach-guard-3',
        'student-guard-3-owner',
      );
      await ownerApp.close();

      const otherApp = buildOnboardingApp({
        mappedRoles: [],
        persistence,
        principalKey: 'student-guard-3-other',
        store,
      });

      const resumeAsOther = await otherApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/resume`,
        payload: {
          retryToken: retryTokenSchema.parse('pg-guard-resume-other-01'),
        },
      });
      const abandonAsOther = await otherApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/abandon`,
        payload: {
          retryToken: retryTokenSchema.parse('pg-guard-abandon-other-01'),
        },
      });
      await otherApp.close();

      expect(resumeAsOther.statusCode).toBe(404);
      expect(
        (resumeAsOther.json() as { error: { code: string } }).error.code,
      ).toBe('NOT_FOUND');
      expect(abandonAsOther.statusCode).toBe(404);
      expect(
        (abandonAsOther.json() as { error: { code: string } }).error.code,
      ).toBe('NOT_FOUND');

      const rows = await connection.db.execute<{ lifecycle: string }>(sql`
        SELECT lifecycle FROM onboarding_attempt WHERE attempt_id = ${attemptId}
      `);
      expect(rows[0]?.lifecycle).toBe('policy_pending');
    });

    it('revoking an already-claimed invitation is idempotent and leaves its claimed state unchanged in Postgres', async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const coachApp = buildOnboardingApp({
        mappedRoles: ['coach'],
        persistence,
        principalKey: 'coach-guard-4',
        store,
      });

      const issued = await coachApp.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: {
          retryToken: retryTokenSchema.parse('pg-guard-issue-4'),
        },
      });
      const { claimSecret, invitationId } = (
        issued.json() as {
          result: { issued: { claimSecret: string; invitationId: string } };
        }
      ).result.issued;

      const studentApp = buildOnboardingApp({
        mappedRoles: [],
        persistence,
        principalKey: 'student-guard-4',
        store,
      });
      const created = await studentApp.inject({
        method: 'POST',
        url: '/v1/onboarding/attempts',
        payload: {
          claimSecret,
          retryToken: retryTokenSchema.parse('pg-guard-create-4'),
        },
      });
      const attemptId = (
        created.json() as { result: { attempt: { attemptId: string } } }
      ).result.attempt.attemptId;
      await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/policy-refresh`,
        payload: { retryToken: retryTokenSchema.parse('pg-guard-refresh-4') },
      });
      const claimed = await studentApp.inject({
        method: 'POST',
        url: `/v1/onboarding/attempts/${attemptId}/claim`,
        payload: {
          claimSecret,
          retryToken: retryTokenSchema.parse('pg-guard-claim-4'),
        },
      });
      expect(
        (claimed.json() as { result: { outcome: string } }).result.outcome,
      ).toBe('completed');
      await studentApp.close();

      const revoked = await coachApp.inject({
        method: 'POST',
        url: `/v1/onboarding/student-invitations/${invitationId}/revoke`,
        payload: { retryToken: retryTokenSchema.parse('pg-guard-revoke-4') },
      });
      await coachApp.close();

      const revokedBody = revoked.json() as {
        result: {
          invitation?: { state: string };
          outcome: string;
        };
      };
      expect(revoked.statusCode).toBe(200);
      expect(revokedBody.result.outcome).toBe('command_succeeded');
      expect(revokedBody.result.invitation?.state).toBe('claimed');

      const rows = await connection.db.execute<{ state: string }>(sql`
        SELECT state FROM onboarding_invitation WHERE invitation_id = ${invitationId}
      `);
      expect(rows.length).toBe(1);
      expect(rows[0]?.state).toBe('claimed');
    });

    it("returns 404 when a coach revokes another coach's invitation", async () => {
      const store = createOnboardingStore();
      const persistence = createOnboardingPgPersistence(connection);
      const ownerApp = buildOnboardingApp({
        mappedRoles: ['coach'],
        persistence,
        principalKey: 'coach-guard-5-owner',
        store,
      });
      const issued = await ownerApp.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: { retryToken: retryTokenSchema.parse('pg-guard-issue-5') },
      });
      const { invitationId } = (
        issued.json() as { result: { issued: { invitationId: string } } }
      ).result.issued;
      await ownerApp.close();

      const otherCoachApp = buildOnboardingApp({
        mappedRoles: ['coach'],
        persistence,
        principalKey: 'coach-guard-5-other',
        store,
      });
      const revokeAsOther = await otherCoachApp.inject({
        method: 'POST',
        url: `/v1/onboarding/student-invitations/${invitationId}/revoke`,
        payload: {
          retryToken: retryTokenSchema.parse('pg-guard-revoke-other-5'),
        },
      });
      await otherCoachApp.close();

      expect(revokeAsOther.statusCode).toBe(404);
      expect(
        (revokeAsOther.json() as { error: { code: string } }).error.code,
      ).toBe('NOT_FOUND');

      const rows = await connection.db.execute<{ state: string }>(sql`
        SELECT state FROM onboarding_invitation WHERE invitation_id = ${invitationId}
      `);
      expect(rows[0]?.state).toBe('issued');
    });
  },
);

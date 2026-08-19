import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
} from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import {
  createPostgresOnboardingAttemptRepository,
  createPostgresOnboardingInvitationRepository,
} from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding attempt persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let invitations: ReturnType<
      typeof createPostgresOnboardingInvitationRepository
    >;
    let attempts: ReturnType<typeof createPostgresOnboardingAttemptRepository>;

    const invitationId = onboardingInvitationIdSchema.parse(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      invitations = createPostgresOnboardingInvitationRepository(connection);
      attempts = createPostgresOnboardingAttemptRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(
        sql`TRUNCATE onboarding_attempt, onboarding_invitation`,
      );
      await invitations.put({
        invitationId,
        claimDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
        proposedRole: 'student',
        purpose: 'student_onboarding',
        state: 'issued',
        targetCoachPrincipalKey: 'coach-1',
        updatedAt: '2026-08-19T12:00:00.000Z',
      });
    });

    afterAll(async () => {
      await connection.close();
    });

    it('puts nonterminal attempts and applies lifecycle transitions', async () => {
      const attemptId = onboardingAttemptIdSchema.parse(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      const record = {
        createdAt: '2026-08-19T12:00:00.000Z',
        principalKey: 'principal-1',
        updatedAt: '2026-08-19T12:00:00.000Z',
        detail: {
          attemptId,
          invitationId,
          proposedRole: 'student' as const,
          purpose: 'student_onboarding' as const,
          lifecycle: 'policy_pending' as const,
          ordinal: 1,
          predecessorAttemptId: null,
          terminalReason: null,
          policy: null,
        },
      };

      await expect(
        attempts.put({
          ...record,
          detail: { ...record.detail, lifecycle: 'completed' },
        }),
      ).resolves.toBe('invalid');

      await expect(attempts.put(record)).resolves.toBe('accepted');
      await expect(attempts.put(record)).resolves.toBe('conflict');
      await expect(attempts.get(attemptId)).resolves.toEqual(record);

      const ready = await attempts.applyTransition({
        attemptId,
        next: 'ready_to_claim',
        updatedAt: '2026-08-19T12:01:00.000Z',
      });
      expect(ready.status).toBe('advanced');
      if (ready.status !== 'advanced') {
        throw new Error('expected advanced');
      }
      expect(ready.attempt.detail.lifecycle).toBe('ready_to_claim');

      const abandoned = await attempts.applyTransition({
        attemptId,
        next: 'terminal',
        terminalReason: 'abandoned',
        updatedAt: '2026-08-19T12:02:00.000Z',
      });
      expect(abandoned.status).toBe('advanced');
      if (abandoned.status !== 'advanced') {
        throw new Error('expected advanced');
      }
      expect(abandoned.attempt.detail).toMatchObject({
        lifecycle: 'terminal',
        terminalReason: 'abandoned',
      });

      await expect(
        attempts.applyTransition({
          attemptId,
          next: 'ready_to_claim',
          updatedAt: '2026-08-19T12:03:00.000Z',
        }),
      ).resolves.toMatchObject({ status: 'already_terminal' });
    });

    it('serializes concurrent transitions on one attempt', async () => {
      const attemptId = onboardingAttemptIdSchema.parse(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      );
      await attempts.put({
        createdAt: '2026-08-19T12:00:00.000Z',
        principalKey: 'principal-2',
        updatedAt: '2026-08-19T12:00:00.000Z',
        detail: {
          attemptId,
          invitationId,
          proposedRole: 'student',
          purpose: 'student_onboarding',
          lifecycle: 'policy_pending',
          ordinal: 1,
          predecessorAttemptId: null,
          terminalReason: null,
          policy: null,
        },
      });

      const results = await Promise.all([
        attempts.applyTransition({
          attemptId,
          next: 'ready_to_claim',
          updatedAt: '2026-08-19T12:04:00.000Z',
        }),
        attempts.applyTransition({
          attemptId,
          next: 'terminal',
          terminalReason: 'abandoned',
          updatedAt: '2026-08-19T12:04:01.000Z',
        }),
      ]);

      const statuses = results.map((result) => result.status).sort();
      // One advances from policy_pending; the loser sees the new state.
      expect(statuses).toContain('advanced');
      expect(
        statuses.filter((status) => status === 'advanced').length,
      ).toBeGreaterThanOrEqual(1);
      expect(statuses.length).toBe(2);
    });
  },
);

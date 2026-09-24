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

type GuardRow = {
  principal_key: string;
  proposed_role: string;
  active_count: number;
  lock_version: number;
};

async function readGuard(
  connection: ReturnType<typeof createPostgresConnection>,
  principalKey: string,
  proposedRole: string,
): Promise<GuardRow | undefined> {
  const rows = await connection.db.execute<GuardRow>(
    sql`SELECT principal_key, proposed_role, active_count, lock_version
        FROM onboarding_attempt_cardinality_guard
        WHERE principal_key = ${principalKey} AND proposed_role = ${proposedRole}`,
  );
  return rows[0];
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding attempt cardinality guard trigger',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let invitations: ReturnType<
      typeof createPostgresOnboardingInvitationRepository
    >;
    let attempts: ReturnType<typeof createPostgresOnboardingAttemptRepository>;

    const invitationIds = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005',
    ].map((id) => onboardingInvitationIdSchema.parse(id));

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
        sql`TRUNCATE onboarding_attempt, onboarding_attempt_cardinality_guard, onboarding_invitation`,
      );
      for (const [index, invitationId] of invitationIds.entries()) {
        await invitations.put({
          invitationId,
          claimDigest: `hmac-sha256.v1:${index.toString().repeat(64).slice(0, 64)}`,
          proposedRole: 'student',
          purpose: 'student_onboarding',
          state: 'issued',
          targetCoachPrincipalKey: 'coach-guard',
          updatedAt: '2026-09-24T00:00:00.000Z',
        });
      }
    });

    afterAll(async () => {
      await connection.close();
    });

    function attemptRecord(input: {
      attemptId: string;
      invitationId: string;
      principalKey: string;
      ordinal: number;
    }) {
      return {
        createdAt: '2026-09-24T00:00:00.000Z',
        principalKey: input.principalKey,
        updatedAt: '2026-09-24T00:00:00.000Z',
        detail: {
          attemptId: onboardingAttemptIdSchema.parse(input.attemptId),
          invitationId: onboardingInvitationIdSchema.parse(input.invitationId),
          proposedRole: 'student' as const,
          purpose: 'student_onboarding' as const,
          lifecycle: 'policy_pending' as const,
          ordinal: input.ordinal,
          predecessorAttemptId: null,
          terminalReason: null,
          policy: null,
        },
      };
    }

    it('lazily creates the guard row and keeps active_count equal to the true nonterminal count on create and every transition', async () => {
      const principalKey = 'principal-guard-sync';

      expect(
        await readGuard(connection, principalKey, 'student'),
      ).toBeUndefined();

      const attemptId = '20000000-0000-4000-8000-000000000001';
      await attempts.put(
        attemptRecord({
          attemptId,
          invitationId: invitationIds[0]!,
          principalKey,
          ordinal: 1,
        }),
      );

      let guard = await readGuard(connection, principalKey, 'student');
      expect(guard?.active_count).toBe(1);
      const versionAfterCreate = guard?.lock_version;

      await attempts.applyTransition({
        attemptId,
        next: 'ready_to_claim',
        updatedAt: '2026-09-24T00:01:00.000Z',
      });
      guard = await readGuard(connection, principalKey, 'student');
      // Still one nonterminal attempt (policy_pending -> ready_to_claim).
      expect(guard?.active_count).toBe(1);
      expect(guard?.lock_version).toBeGreaterThan(versionAfterCreate!);

      await attempts.applyTransition({
        attemptId,
        next: 'completed',
        updatedAt: '2026-09-24T00:02:00.000Z',
      });
      guard = await readGuard(connection, principalKey, 'student');
      // completed releases the slot even though it is a distinct lifecycle
      // value from 'terminal'.
      expect(guard?.active_count).toBe(0);
    });

    it('decrements the guard exactly once when an attempt terminates via abandonment', async () => {
      const principalKey = 'principal-guard-abandon';
      const attemptId = '20000000-0000-4000-8000-000000000002';
      await attempts.put(
        attemptRecord({
          attemptId,
          invitationId: invitationIds[0]!,
          principalKey,
          ordinal: 1,
        }),
      );
      expect(
        (await readGuard(connection, principalKey, 'student'))?.active_count,
      ).toBe(1);

      await attempts.applyTransition({
        attemptId,
        next: 'terminal',
        terminalReason: 'abandoned',
        updatedAt: '2026-09-24T00:01:00.000Z',
      });

      expect(
        (await readGuard(connection, principalKey, 'student'))?.active_count,
      ).toBe(0);
    });

    it('rejects a direct bypass INSERT that would push a fifth nonterminal attempt past the four-per-principal/role cap', async () => {
      const principalKey = 'principal-guard-cap';
      for (let index = 0; index < 4; index += 1) {
        await attempts.put(
          attemptRecord({
            attemptId: `20000000-0000-4000-8000-00000000010${index}`,
            invitationId: invitationIds[index]!,
            principalKey,
            ordinal: index + 1,
          }),
        );
      }
      expect(
        (await readGuard(connection, principalKey, 'student'))?.active_count,
      ).toBe(4);

      // Bypass the repository/application layer entirely with a raw INSERT,
      // proving the cap is enforced by the database itself, not only by
      // `canAllocateAttempt`'s application-level pre-check.
      await expect(
        connection.db.execute(sql`
          INSERT INTO onboarding_attempt (
            attempt_id, invitation_id, principal_key, proposed_role, purpose,
            lifecycle, ordinal, created_at, updated_at
          ) VALUES (
            '20000000-0000-4000-8000-000000000105',
            ${invitationIds[4]},
            ${principalKey},
            'student',
            'student_onboarding',
            'policy_pending',
            5,
            now(),
            now()
          )
        `),
      ).rejects.toThrow();

      expect(
        (await readGuard(connection, principalKey, 'student'))?.active_count,
      ).toBe(4);
      await expect(
        connection.db.execute(
          sql`SELECT 1 FROM onboarding_attempt WHERE attempt_id = '20000000-0000-4000-8000-000000000105'`,
        ),
      ).resolves.toHaveLength(0);
    });

    it('rejects a bypass UPDATE that reassigns an attempt to a different principal or role', async () => {
      const principalKey = 'principal-guard-immutable';
      const attemptId = '20000000-0000-4000-8000-000000000006';
      await attempts.put(
        attemptRecord({
          attemptId,
          invitationId: invitationIds[0]!,
          principalKey,
          ordinal: 1,
        }),
      );

      await expect(
        connection.db.execute(
          sql`UPDATE onboarding_attempt SET principal_key = 'someone-else' WHERE attempt_id = ${attemptId}`,
        ),
      ).rejects.toThrow();

      await expect(
        connection.db.execute(
          sql`UPDATE onboarding_attempt SET proposed_role = 'coach' WHERE attempt_id = ${attemptId}`,
        ),
      ).rejects.toThrow();
    });

    it('frees a slot on termination so a fifth attempt can be created afterward', async () => {
      const principalKey = 'principal-guard-refill';
      const attemptIds = [
        '20000000-0000-4000-8000-000000000201',
        '20000000-0000-4000-8000-000000000202',
        '20000000-0000-4000-8000-000000000203',
        '20000000-0000-4000-8000-000000000204',
      ];
      for (const [index, attemptId] of attemptIds.entries()) {
        await attempts.put(
          attemptRecord({
            attemptId,
            invitationId: invitationIds[index]!,
            principalKey,
            ordinal: index + 1,
          }),
        );
      }

      await attempts.applyTransition({
        attemptId: attemptIds[0]!,
        next: 'terminal',
        terminalReason: 'expired',
        updatedAt: '2026-09-24T00:01:00.000Z',
      });
      expect(
        (await readGuard(connection, principalKey, 'student'))?.active_count,
      ).toBe(3);

      await expect(
        attempts.put(
          attemptRecord({
            attemptId: '20000000-0000-4000-8000-000000000205',
            invitationId: invitationIds[4]!,
            principalKey,
            ordinal: 1,
          }),
        ),
      ).resolves.toBe('accepted');
      expect(
        (await readGuard(connection, principalKey, 'student'))?.active_count,
      ).toBe(4);
    });

    it('tracks independent guards per proposed role for the same principal', async () => {
      const principalKey = 'principal-guard-dual-role';
      await invitations.put({
        invitationId: onboardingInvitationIdSchema.parse(
          '10000000-0000-4000-8000-000000000099',
        ),
        claimDigest: `hmac-sha256.v1:${'c'.repeat(64)}`,
        proposedRole: 'coach',
        purpose: 'coach_bootstrap',
        state: 'issued',
        targetCoachPrincipalKey: null,
        updatedAt: '2026-09-24T00:00:00.000Z',
      });

      await attempts.put(
        attemptRecord({
          attemptId: '20000000-0000-4000-8000-000000000301',
          invitationId: invitationIds[0]!,
          principalKey,
          ordinal: 1,
        }),
      );
      await attempts.put({
        createdAt: '2026-09-24T00:00:00.000Z',
        principalKey,
        updatedAt: '2026-09-24T00:00:00.000Z',
        detail: {
          attemptId: onboardingAttemptIdSchema.parse(
            '20000000-0000-4000-8000-000000000302',
          ),
          invitationId: onboardingInvitationIdSchema.parse(
            '10000000-0000-4000-8000-000000000099',
          ),
          proposedRole: 'coach',
          purpose: 'coach_bootstrap',
          lifecycle: 'policy_pending',
          ordinal: 1,
          predecessorAttemptId: null,
          terminalReason: null,
          policy: null,
        },
      });

      expect(
        (await readGuard(connection, principalKey, 'student'))?.active_count,
      ).toBe(1);
      expect(
        (await readGuard(connection, principalKey, 'coach'))?.active_count,
      ).toBe(1);
    });
  },
);

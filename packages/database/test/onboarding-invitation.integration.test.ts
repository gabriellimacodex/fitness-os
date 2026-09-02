import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { onboardingInvitationIdSchema } from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresOnboardingInvitationRepository } from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding invitation persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let invitations: ReturnType<
      typeof createPostgresOnboardingInvitationRepository
    >;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      invitations = createPostgresOnboardingInvitationRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(
        sql`TRUNCATE onboarding_attempt, onboarding_invitation`,
      );
    });

    afterAll(async () => {
      await connection.close();
    });

    it('puts, claims, and rejects concurrent claim races', async () => {
      const invitationId = onboardingInvitationIdSchema.parse(
        '11111111-1111-4111-8111-111111111111',
      );
      const record = {
        invitationId,
        claimDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
        proposedRole: 'student' as const,
        purpose: 'student_onboarding' as const,
        state: 'issued' as const,
        targetCoachPrincipalKey: 'coach-principal-1',
        updatedAt: '2026-08-19T12:00:00.000Z',
      };

      await expect(
        invitations.put({ ...record, state: 'claimed' }),
      ).resolves.toBe('invalid');
      await expect(invitations.get(invitationId)).resolves.toBeNull();

      await expect(invitations.put(record)).resolves.toBe('accepted');
      await expect(invitations.put(record)).resolves.toBe('conflict');
      await expect(invitations.get(invitationId)).resolves.toEqual(record);

      const listed = await invitations.listByTargetCoach('coach-principal-1');
      expect(listed).toEqual([record]);

      const claimed = await invitations.applyClaim({
        invitationId,
        updatedAt: '2026-08-19T12:01:00.000Z',
      });
      expect(claimed.status).toBe('advanced');
      if (claimed.status !== 'advanced') {
        throw new Error('expected advanced');
      }
      expect(claimed.invitation.state).toBe('claimed');

      await expect(
        invitations.applyClaim({
          invitationId,
          updatedAt: '2026-08-19T12:02:00.000Z',
        }),
      ).resolves.toMatchObject({ status: 'already_terminal' });

      await expect(
        invitations.applyRevoke({
          invitationId,
          updatedAt: '2026-08-19T12:03:00.000Z',
        }),
      ).resolves.toMatchObject({ status: 'already_terminal' });
    });

    it('reads a stored invitation by its claim digest and returns null for an unknown digest', async () => {
      const invitationId = onboardingInvitationIdSchema.parse(
        '33333333-3333-4333-8333-333333333333',
      );
      const record = {
        invitationId,
        claimDigest: `hmac-sha256.v1:${'c'.repeat(64)}`,
        proposedRole: 'student' as const,
        purpose: 'student_onboarding' as const,
        state: 'issued' as const,
        targetCoachPrincipalKey: 'coach-principal-3',
        updatedAt: '2026-08-19T12:00:00.000Z',
      };
      await expect(invitations.put(record)).resolves.toBe('accepted');

      await expect(
        invitations.getByClaimDigest(record.claimDigest),
      ).resolves.toEqual(record);
      await expect(
        invitations.getByClaimDigest(`hmac-sha256.v1:${'d'.repeat(64)}`),
      ).resolves.toBeNull();
    });

    it('revokes an issued invitation and rejects a later claim as already terminal', async () => {
      const invitationId = onboardingInvitationIdSchema.parse(
        '44444444-4444-4444-8444-444444444444',
      );
      await invitations.put({
        invitationId,
        claimDigest: `hmac-sha256.v1:${'e'.repeat(64)}`,
        proposedRole: 'coach',
        purpose: 'coach_bootstrap',
        state: 'issued',
        targetCoachPrincipalKey: null,
        updatedAt: '2026-08-19T12:00:00.000Z',
      });

      const revoked = await invitations.applyRevoke({
        invitationId,
        updatedAt: '2026-08-19T12:05:00.000Z',
      });
      expect(revoked.status).toBe('advanced');
      if (revoked.status !== 'advanced') {
        throw new Error('expected advanced');
      }
      expect(revoked.invitation.state).toBe('revoked');
      await expect(invitations.get(invitationId)).resolves.toMatchObject({
        state: 'revoked',
      });

      await expect(
        invitations.applyClaim({
          invitationId,
          updatedAt: '2026-08-19T12:06:00.000Z',
        }),
      ).resolves.toMatchObject({ status: 'already_terminal' });
      await expect(
        invitations.applyRevoke({
          invitationId,
          updatedAt: '2026-08-19T12:07:00.000Z',
        }),
      ).resolves.toMatchObject({ status: 'already_terminal' });
    });

    it('serializes concurrent claims so only one advances', async () => {
      const invitationId = onboardingInvitationIdSchema.parse(
        '22222222-2222-4222-8222-222222222222',
      );
      await invitations.put({
        invitationId,
        claimDigest: `hmac-sha256.v1:${'b'.repeat(64)}`,
        proposedRole: 'student',
        purpose: 'student_onboarding',
        state: 'issued',
        targetCoachPrincipalKey: 'coach-principal-2',
        updatedAt: '2026-08-19T12:00:00.000Z',
      });

      const results = await Promise.all([
        invitations.applyClaim({
          invitationId,
          updatedAt: '2026-08-19T12:04:00.000Z',
        }),
        invitations.applyClaim({
          invitationId,
          updatedAt: '2026-08-19T12:04:01.000Z',
        }),
      ]);

      const statuses = results.map((result) => result.status).sort();
      expect(statuses).toEqual(['advanced', 'already_terminal']);
      await expect(invitations.get(invitationId)).resolves.toMatchObject({
        state: 'claimed',
      });
    });
  },
);

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
      await connection.db.execute(sql`TRUNCATE onboarding_invitation`);
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

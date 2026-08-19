import { onboardingInvitationIdSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingInvitationRepository } from '../src/onboarding/synthetic-invitations.js';

describe('SyntheticOnboardingInvitationRepository', () => {
  it('puts issued invitations, claims once, and rejects non-issued puts', async () => {
    const repo = new SyntheticOnboardingInvitationRepository();
    const invitationId = onboardingInvitationIdSchema.parse(
      '11111111-1111-4111-8111-111111111111',
    );
    const record = {
      claimDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
      invitationId,
      proposedRole: 'student' as const,
      purpose: 'student_onboarding' as const,
      state: 'issued' as const,
      targetCoachPrincipalKey: 'coach-1',
      updatedAt: '2026-08-19T12:00:00.000Z',
    };

    await expect(repo.put({ ...record, state: 'claimed' })).resolves.toBe(
      'invalid',
    );
    await expect(repo.put(record)).resolves.toBe('accepted');
    await expect(repo.put(record)).resolves.toBe('conflict');
    await expect(repo.get(invitationId)).resolves.toEqual(record);
    await expect(repo.listByTargetCoach('coach-1')).resolves.toEqual([record]);

    const claimed = await repo.applyClaim({
      invitationId,
      updatedAt: '2026-08-19T12:01:00.000Z',
    });
    expect(claimed.status).toBe('advanced');
    if (claimed.status === 'advanced') {
      expect(claimed.invitation.state).toBe('claimed');
    }
    await expect(
      repo.applyClaim({
        invitationId,
        updatedAt: '2026-08-19T12:02:00.000Z',
      }),
    ).resolves.toMatchObject({ status: 'already_terminal' });
  });
});

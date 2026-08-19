import {
  attemptDetailSchema,
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
  principalRoleMappingIdSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingClaimRepository } from '../src/onboarding/claim-repository.js';

describe('SyntheticOnboardingClaimRepository', () => {
  it('commits a ready claim once and blocks productionMode', async () => {
    const repo = new SyntheticOnboardingClaimRepository();
    const invitation = {
      claimDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
      invitationId: onboardingInvitationIdSchema.parse(
        '11111111-1111-4111-8111-111111111111',
      ),
      proposedRole: 'student' as const,
      purpose: 'student_onboarding' as const,
      state: 'issued' as const,
      targetCoachPrincipalKey: 'coach-1',
      updatedAt: '2026-08-19T12:00:00.000Z',
    };
    const attempt = {
      createdAt: '2026-08-19T12:00:00.000Z',
      detail: attemptDetailSchema.parse({
        attemptId: onboardingAttemptIdSchema.parse(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
        invitationId: invitation.invitationId,
        lifecycle: 'ready_to_claim',
        ordinal: 1,
        policy: null,
        predecessorAttemptId: null,
        proposedRole: 'student',
        purpose: 'student_onboarding',
        terminalReason: null,
      }),
      principalKey: 'principal-1',
      updatedAt: '2026-08-19T12:00:00.000Z',
    };
    const mapping = {
      createdAt: '2026-08-19T12:00:00.000Z',
      mappingId: principalRoleMappingIdSchema.parse(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ),
      principalKey: 'principal-1',
      role: 'student' as const,
    };

    await expect(
      repo.commit({
        attempt,
        invitation,
        mapping,
        productionMode: true,
      }),
    ).resolves.toEqual({
      reason: 'synthetic_in_production',
      status: 'denied',
    });

    const committed = await repo.commit({
      attempt,
      invitation,
      mapping,
      productionMode: false,
    });
    expect(committed.status).toBe('committed');
    if (committed.status === 'committed') {
      expect(committed.invitation.state).toBe('claimed');
      expect(committed.attempt.detail.lifecycle).toBe('completed');
    }

    await expect(
      repo.commit({
        attempt,
        invitation,
        mapping,
        productionMode: false,
      }),
    ).resolves.toEqual({ reason: 'mapping_conflict', status: 'denied' });
  });
});

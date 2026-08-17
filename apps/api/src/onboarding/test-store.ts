import type { ProposedRole } from '@fitness-os/domain';
import type { InvitationClaimSecret } from '@fitness-os/schemas';

import {
  digestClaimSecret,
  newInvitationId,
  type OnboardingStore,
  type StoredInvitation,
} from './store.js';

export function seedInvitation(
  store: OnboardingStore,
  input: {
    claimSecret: InvitationClaimSecret;
    proposedRole?: ProposedRole;
    purpose?: StoredInvitation['purpose'];
    state?: StoredInvitation['state'];
    targetCoachPrincipalKey?: string | null;
  },
): StoredInvitation {
  const invitation: StoredInvitation = {
    claimDigest: digestClaimSecret(input.claimSecret, store.pepper),
    invitationId: newInvitationId(),
    proposedRole: input.proposedRole ?? 'student',
    purpose: input.purpose ?? 'student_onboarding',
    state: input.state ?? 'issued',
    targetCoachPrincipalKey: input.targetCoachPrincipalKey ?? null,
  };

  store.invitations.set(invitation.invitationId, invitation);
  return invitation;
}

export function seedIssuedInvitation(
  store: OnboardingStore,
  input: {
    claimSecret: InvitationClaimSecret;
    proposedRole?: ProposedRole;
    purpose?: StoredInvitation['purpose'];
    targetCoachPrincipalKey?: string | null;
  },
): StoredInvitation {
  return seedInvitation(store, input);
}

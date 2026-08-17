import { createHash, randomUUID } from 'node:crypto';

import {
  attemptDetailSchema,
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
  principalRoleMappingIdSchema,
  type AttemptDetail,
  type InvitationClaimSecret,
  type OnboardingAttemptId,
  type OnboardingInvitationId,
  type PrincipalRoleMappingId,
  type ProposedRole,
} from '@fitness-os/schemas';

export interface StoredInvitation {
  claimDigest: string;
  invitationId: OnboardingInvitationId;
  proposedRole: ProposedRole;
  purpose: 'coach_bootstrap' | 'student_onboarding';
  state: 'issued' | 'claimed' | 'revoked' | 'expired';
}

export interface StoredAttempt {
  detail: AttemptDetail;
  principalKey: string;
}

export interface OnboardingStore {
  attempts: Map<string, StoredAttempt>;
  invitations: Map<string, StoredInvitation>;
}

export function digestClaimSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function createOnboardingStore(): OnboardingStore {
  return {
    attempts: new Map(),
    invitations: new Map(),
  };
}

export function mappingIdFor(
  principalKey: string,
  role: ProposedRole,
): PrincipalRoleMappingId {
  const hex = createHash('sha256')
    .update(`prd07.mapping:${principalKey}:${role}`, 'utf8')
    .digest('hex');
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');

  return principalRoleMappingIdSchema.parse(uuid);
}

export function seedInvitation(
  store: OnboardingStore,
  input: {
    claimSecret: InvitationClaimSecret;
    proposedRole?: ProposedRole;
    purpose?: StoredInvitation['purpose'];
    state?: StoredInvitation['state'];
  },
): StoredInvitation {
  const invitation: StoredInvitation = {
    claimDigest: digestClaimSecret(input.claimSecret),
    invitationId: onboardingInvitationIdSchema.parse(randomUUID()),
    proposedRole: input.proposedRole ?? 'student',
    purpose: input.purpose ?? 'student_onboarding',
    state: input.state ?? 'issued',
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
  },
): StoredInvitation {
  return seedInvitation(store, input);
}

export function findInvitationBySecret(
  store: OnboardingStore,
  secret: string,
): StoredInvitation | undefined {
  const digest = digestClaimSecret(secret);

  for (const invitation of store.invitations.values()) {
    if (invitation.claimDigest === digest) {
      return invitation;
    }
  }

  return undefined;
}

export function createStoredAttempt(
  invitation: StoredInvitation,
  ordinal: number,
  principalKey: string,
): StoredAttempt {
  return {
    detail: attemptDetailSchema.parse({
      attemptId: onboardingAttemptIdSchema.parse(randomUUID()),
      invitationId: invitation.invitationId,
      lifecycle: 'policy_pending',
      ordinal,
      policy: null,
      predecessorAttemptId: null,
      proposedRole: invitation.proposedRole,
      purpose: invitation.purpose,
      terminalReason: null,
    }),
    principalKey,
  };
}

export function getAttemptForPrincipal(
  store: OnboardingStore,
  attemptId: OnboardingAttemptId,
  principalKey: string,
): AttemptDetail | undefined {
  const record = store.attempts.get(attemptId);

  if (record === undefined || record.principalKey !== principalKey) {
    return undefined;
  }

  return record.detail;
}

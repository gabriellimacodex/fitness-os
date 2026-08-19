import type {
  AttemptDetail,
  OnboardingInvitationId,
  OnboardingOperationId,
  PrincipalRoleMappingId,
} from '@fitness-os/schemas';

import type { ProposedRole } from './claim.js';
import type { InvitationState } from './invitation.js';

export type InvitationPurpose = 'coach_bootstrap' | 'student_onboarding';

export type OnboardingInvitationRecord = {
  claimDigest: string;
  invitationId: OnboardingInvitationId;
  proposedRole: ProposedRole;
  purpose: InvitationPurpose;
  state: InvitationState;
  targetCoachPrincipalKey: string | null;
  updatedAt: string;
};

export type OnboardingInvitationPutResult = 'accepted' | 'conflict' | 'invalid';

export type OnboardingInvitationTransitionResult =
  | { status: 'advanced'; invitation: OnboardingInvitationRecord }
  | { status: 'already_terminal'; invitation: OnboardingInvitationRecord }
  | { status: 'invalid'; reason: 'not_found' | 'illegal_transition' }
  | { status: 'conflict' };

/**
 * Issue, inspect, and transition invitations through closed outcomes.
 */
export interface OnboardingInvitationRepository {
  applyClaim(input: {
    invitationId: string;
    updatedAt: string;
  }): Promise<OnboardingInvitationTransitionResult>;
  applyRevoke(input: {
    invitationId: string;
    updatedAt: string;
  }): Promise<OnboardingInvitationTransitionResult>;
  get(invitationId: string): Promise<OnboardingInvitationRecord | null>;
  getByClaimDigest(
    claimDigest: string,
  ): Promise<OnboardingInvitationRecord | null>;
  listByTargetCoach(
    targetCoachPrincipalKey: string,
  ): Promise<readonly OnboardingInvitationRecord[]>;
  put(
    record: OnboardingInvitationRecord,
  ): Promise<OnboardingInvitationPutResult>;
}

export type OnboardingAttemptRecord = {
  createdAt: string;
  detail: AttemptDetail;
  principalKey: string;
  updatedAt: string;
};

export type OnboardingAttemptPutResult = 'accepted' | 'conflict' | 'invalid';

export type OnboardingAttemptTransitionResult =
  | { status: 'advanced'; attempt: OnboardingAttemptRecord }
  | { status: 'already_terminal'; attempt: OnboardingAttemptRecord }
  | { status: 'invalid'; reason: 'not_found' | 'illegal_transition' }
  | { status: 'conflict' };

/**
 * Create/select/read/transition attempts under exact-scope and fixed-cap rules
 * enforced by callers.
 */
export interface OnboardingAttemptRepository {
  applyTransition(input: {
    attemptId: string;
    next: AttemptDetail['lifecycle'];
    terminalReason?: AttemptDetail['terminalReason'];
    updatedAt: string;
  }): Promise<OnboardingAttemptTransitionResult>;
  get(attemptId: string): Promise<OnboardingAttemptRecord | null>;
  listByPrincipal(
    principalKey: string,
  ): Promise<readonly OnboardingAttemptRecord[]>;
  put(record: OnboardingAttemptRecord): Promise<OnboardingAttemptPutResult>;
}

export type OnboardingMutationNamespace =
  | 'create_attempt'
  | 'resume_attempt'
  | 'abandon_attempt'
  | 'refresh_policy'
  | 'claim_attempt'
  | 'issue_student_invitation'
  | 'revoke_student_invitation';

export type OnboardingOperationRecord = {
  bindingKey: string;
  createdAt: string;
  digest: string;
  namespace: OnboardingMutationNamespace;
  operationId: OnboardingOperationId;
  principalKey: string;
  result: unknown;
  retryDigest: string;
};

export type OnboardingOperationPutResult =
  | { status: 'accepted'; operation: OnboardingOperationRecord }
  | { status: 'replay'; operation: OnboardingOperationRecord }
  | { status: 'conflict'; operation: OnboardingOperationRecord };

/**
 * Bind scoped retry tokens, store typed results, and resolve idempotent replay.
 */
export interface OnboardingOperationRepository {
  getByBindingKey(
    bindingKey: string,
  ): Promise<OnboardingOperationRecord | null>;
  getByOperationId(
    operationId: string,
  ): Promise<OnboardingOperationRecord | null>;
  put(record: OnboardingOperationRecord): Promise<OnboardingOperationPutResult>;
}

export type PrincipalRoleMappingRecord = {
  createdAt: string;
  mappingId: PrincipalRoleMappingId;
  principalKey: string;
  role: ProposedRole;
};

export type PrincipalRoleMappingPutResult =
  | { status: 'accepted'; mapping: PrincipalRoleMappingRecord }
  | { status: 'replay'; mapping: PrincipalRoleMappingRecord }
  | { status: 'conflict'; mapping: PrincipalRoleMappingRecord };

/**
 * Read exact role mappings and enforce role uniqueness per principal.
 * Does not infer authorization from mapping presence alone.
 */
export interface PrincipalRoleMappingRepository {
  get(mappingId: string): Promise<PrincipalRoleMappingRecord | null>;
  listByPrincipal(
    principalKey: string,
  ): Promise<readonly PrincipalRoleMappingRecord[]>;
  put(
    record: PrincipalRoleMappingRecord,
  ): Promise<PrincipalRoleMappingPutResult>;
}

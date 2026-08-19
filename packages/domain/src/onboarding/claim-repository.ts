import type { OnboardingInvitationRecord } from './ports.js';
import type { OnboardingAttemptRecord } from './ports.js';
import type { PrincipalRoleMappingRecord } from './ports.js';

export type OnboardingClaimCommitInput = {
  attempt: OnboardingAttemptRecord;
  invitation: OnboardingInvitationRecord;
  mapping: PrincipalRoleMappingRecord;
  productionMode: boolean;
};

export type OnboardingClaimCommitResult =
  | {
      status: 'committed';
      attempt: OnboardingAttemptRecord;
      invitation: OnboardingInvitationRecord;
      mapping: PrincipalRoleMappingRecord;
    }
  | {
      status: 'denied';
      reason:
        | 'synthetic_in_production'
        | 'mapping_conflict'
        | 'invalid_or_unavailable';
    };

/**
 * Commit one narrow coach or student aggregate transaction including required
 * PRD 02 effects. Implementations must preserve PRD 02 lock order.
 */
export interface OnboardingClaimRepository {
  commit(
    input: OnboardingClaimCommitInput,
  ): Promise<OnboardingClaimCommitResult>;
}

/**
 * Synthetic claim repository for disposable compositions. Does not touch PRD 02
 * tables; records the claim outcomes in memory only.
 */
export class SyntheticOnboardingClaimRepository implements OnboardingClaimRepository {
  readonly #mappings = new Map<string, PrincipalRoleMappingRecord>();

  async commit(
    input: OnboardingClaimCommitInput,
  ): Promise<OnboardingClaimCommitResult> {
    if (input.productionMode) {
      return { reason: 'synthetic_in_production', status: 'denied' };
    }

    const key = `${input.mapping.principalKey}:${input.mapping.role}`;
    if (this.#mappings.has(key)) {
      return { reason: 'mapping_conflict', status: 'denied' };
    }
    if (input.invitation.state !== 'issued') {
      return { reason: 'invalid_or_unavailable', status: 'denied' };
    }
    if (input.attempt.detail.lifecycle !== 'ready_to_claim') {
      return { reason: 'invalid_or_unavailable', status: 'denied' };
    }

    const invitation = { ...input.invitation, state: 'claimed' as const };
    const attempt = {
      ...input.attempt,
      detail: {
        ...input.attempt.detail,
        lifecycle: 'completed' as const,
      },
    };
    this.#mappings.set(key, input.mapping);

    return {
      attempt,
      invitation,
      mapping: input.mapping,
      status: 'committed',
    };
  }
}

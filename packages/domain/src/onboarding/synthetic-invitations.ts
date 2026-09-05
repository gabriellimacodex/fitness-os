import { claimInvitation, revokeInvitation } from './invitation.js';
import type {
  OnboardingInvitationPutResult,
  OnboardingInvitationRecord,
  OnboardingInvitationRepository,
  OnboardingInvitationTransitionResult,
} from './ports.js';

export class SyntheticOnboardingInvitationRepository implements OnboardingInvitationRepository {
  readonly #byId = new Map<string, OnboardingInvitationRecord>();
  readonly #byDigest = new Map<string, string>();

  async get(invitationId: string): Promise<OnboardingInvitationRecord | null> {
    return this.#byId.get(invitationId) ?? null;
  }

  async getByClaimDigest(
    claimDigest: string,
  ): Promise<OnboardingInvitationRecord | null> {
    const id = this.#byDigest.get(claimDigest);
    return id === undefined ? null : (this.#byId.get(id) ?? null);
  }

  async listByTargetCoach(
    targetCoachPrincipalKey: string,
  ): Promise<readonly OnboardingInvitationRecord[]> {
    return [...this.#byId.values()].filter(
      (row) => row.targetCoachPrincipalKey === targetCoachPrincipalKey,
    );
  }

  async put(
    record: OnboardingInvitationRecord,
  ): Promise<OnboardingInvitationPutResult> {
    if (record.state !== 'issued') {
      return 'invalid';
    }
    if (
      this.#byId.has(record.invitationId) ||
      this.#byDigest.has(record.claimDigest)
    ) {
      return 'conflict';
    }
    this.#byId.set(record.invitationId, record);
    this.#byDigest.set(record.claimDigest, record.invitationId);
    return 'accepted';
  }

  async applyClaim(input: {
    invitationId: string;
    updatedAt: string;
  }): Promise<OnboardingInvitationTransitionResult> {
    return this.#transition(
      input.invitationId,
      input.updatedAt,
      claimInvitation,
    );
  }

  async applyRevoke(input: {
    invitationId: string;
    updatedAt: string;
  }): Promise<OnboardingInvitationTransitionResult> {
    return this.#transition(
      input.invitationId,
      input.updatedAt,
      revokeInvitation,
    );
  }

  #transition(
    invitationId: string,
    updatedAt: string,
    transition: typeof claimInvitation,
  ): OnboardingInvitationTransitionResult {
    const current = this.#byId.get(invitationId);
    if (current === undefined) {
      return { reason: 'not_found', status: 'invalid' };
    }
    const result = transition(current.state);
    if (result.status === 'already_terminal') {
      return { invitation: current, status: 'already_terminal' };
    }
    const next = { ...current, state: result.state, updatedAt };
    this.#byId.set(invitationId, next);
    return { invitation: next, status: 'advanced' };
  }
}

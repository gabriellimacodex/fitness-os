import { isNonterminal, transitionAttempt } from './attempt.js';
import type {
  OnboardingAttemptPutResult,
  OnboardingAttemptRecord,
  OnboardingAttemptRepository,
  OnboardingAttemptTransitionResult,
} from './ports.js';

export class SyntheticOnboardingAttemptRepository implements OnboardingAttemptRepository {
  readonly #byId = new Map<string, OnboardingAttemptRecord>();

  async get(attemptId: string): Promise<OnboardingAttemptRecord | null> {
    return this.#byId.get(attemptId) ?? null;
  }

  async listByPrincipal(
    principalKey: string,
  ): Promise<readonly OnboardingAttemptRecord[]> {
    return [...this.#byId.values()].filter(
      (row) => row.principalKey === principalKey,
    );
  }

  async put(
    record: OnboardingAttemptRecord,
  ): Promise<OnboardingAttemptPutResult> {
    if (!isNonterminal(record.detail.lifecycle)) {
      return 'invalid';
    }
    if (this.#byId.has(record.detail.attemptId)) {
      return 'conflict';
    }
    this.#byId.set(record.detail.attemptId, record);
    return 'accepted';
  }

  async applyTransition(input: {
    attemptId: string;
    next: OnboardingAttemptRecord['detail']['lifecycle'];
    terminalReason?: OnboardingAttemptRecord['detail']['terminalReason'];
    updatedAt: string;
  }): Promise<OnboardingAttemptTransitionResult> {
    const current = this.#byId.get(input.attemptId);
    if (current === undefined) {
      return { reason: 'not_found', status: 'invalid' };
    }
    const result = transitionAttempt(
      current.detail,
      input.next,
      input.terminalReason ?? null,
    );
    if (result.status === 'already_terminal') {
      return { attempt: current, status: 'already_terminal' };
    }
    if (result.status !== 'advanced') {
      return { reason: 'illegal_transition', status: 'invalid' };
    }
    const next = {
      ...current,
      detail: result.attempt,
      updatedAt: input.updatedAt,
    };
    this.#byId.set(input.attemptId, next);
    return { attempt: next, status: 'advanced' };
  }
}

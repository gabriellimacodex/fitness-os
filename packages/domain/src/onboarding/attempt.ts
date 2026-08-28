import {
  attemptLifecycleSchema,
  type AttemptDetail,
} from '@fitness-os/schemas';

export const ATTEMPT_ACTIVE_CAP = 4;

export type AttemptTransitionResult =
  | { status: 'advanced'; attempt: AttemptDetail }
  | { status: 'already_terminal'; attempt: AttemptDetail }
  | { status: 'invalid' };

const FORWARD: Record<
  AttemptDetail['lifecycle'],
  ReadonlySet<AttemptDetail['lifecycle']>
> = {
  policy_pending: new Set(['ready_to_claim', 'terminal']),
  ready_to_claim: new Set(['completed', 'terminal']),
  completed: new Set(),
  terminal: new Set(),
};

export function isNonterminal(lifecycle: AttemptDetail['lifecycle']): boolean {
  return lifecycle === 'policy_pending' || lifecycle === 'ready_to_claim';
}

export function transitionAttempt(
  attempt: AttemptDetail,
  next: AttemptDetail['lifecycle'],
  terminalReason: AttemptDetail['terminalReason'] = null,
): AttemptTransitionResult {
  attemptLifecycleSchema.parse(next);

  if (!isNonterminal(attempt.lifecycle)) {
    return { attempt, status: 'already_terminal' };
  }

  if (!FORWARD[attempt.lifecycle].has(next)) {
    return { status: 'invalid' };
  }

  if (next === 'terminal' && terminalReason === null) {
    return { status: 'invalid' };
  }

  if (next !== 'terminal' && terminalReason !== null) {
    return { status: 'invalid' };
  }

  return {
    attempt: {
      ...attempt,
      lifecycle: next,
      terminalReason,
    },
    status: 'advanced',
  };
}

export function selectAttempt(
  attempts: readonly AttemptDetail[],
  locator: string | undefined,
): {
  status:
    | 'attempt_selected'
    | 'selection_required'
    | 'no_active_attempt'
    | 'active_attempt_limit_reached';
  attempts: AttemptDetail[];
} {
  const active = attempts.filter((attempt) => isNonterminal(attempt.lifecycle));

  if (active.length > ATTEMPT_ACTIVE_CAP) {
    return { attempts: [...active], status: 'active_attempt_limit_reached' };
  }

  if (locator !== undefined) {
    const match = active.find((attempt) => attempt.attemptId === locator);
    return match === undefined
      ? { attempts: [...active], status: 'no_active_attempt' }
      : { attempts: [match], status: 'attempt_selected' };
  }

  if (active.length === 0) {
    return { attempts: [], status: 'no_active_attempt' };
  }

  if (active.length > 1) {
    return { attempts: [...active], status: 'selection_required' };
  }

  return { attempts: [active[0]!], status: 'attempt_selected' };
}

export function canAllocateAttempt(activeCountForRole: number): boolean {
  return activeCountForRole < ATTEMPT_ACTIVE_CAP;
}

export interface AttemptTimeoutBounds {
  absoluteTtlMs: number;
  inactivityTtlMs: number;
}

export type AttemptTimeoutStatus = 'active' | 'expired' | 'inactive';

/**
 * Deterministic evaluation of an attempt's server-configured absolute expiry
 * and inactivity bound, per PRD 07's attempt-cardinality business rule.
 * Every timestamp is supplied by the caller's own trusted clock — this
 * function reads no system clock and accepts no caller-chosen TTL override,
 * so the result is reproducible. Absolute expiry takes priority over
 * inactivity when both bounds are exceeded. The caller applies the result
 * through `transitionAttempt(attempt, 'terminal', reason)`, using
 * `'expired'` for `expired` and `'abandoned'` for `inactive` — PRD 07 has no
 * distinct terminal reason for server-triggered inactivity, only for the
 * abandonment outcome it produces.
 */
export function evaluateAttemptTimeout(input: {
  createdAtMs: number;
  lastActivityAtMs: number;
  nowUtcMs: number;
  bounds: AttemptTimeoutBounds;
}): AttemptTimeoutStatus {
  if (input.nowUtcMs - input.createdAtMs >= input.bounds.absoluteTtlMs) {
    return 'expired';
  }

  if (input.nowUtcMs - input.lastActivityAtMs >= input.bounds.inactivityTtlMs) {
    return 'inactive';
  }

  return 'active';
}

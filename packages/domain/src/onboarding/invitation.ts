export type InvitationState = 'issued' | 'claimed' | 'revoked' | 'expired';

export type InvitationMutationResult =
  | { status: 'advanced'; state: InvitationState }
  | { status: 'already_terminal'; state: InvitationState }
  | { status: 'invalid' };

const TERMINAL: ReadonlySet<InvitationState> = new Set([
  'claimed',
  'revoked',
  'expired',
]);

export function inspectInvitationState(
  state: InvitationState,
): 'issued' | 'invalid_or_unavailable' {
  return state === 'issued' ? 'issued' : 'invalid_or_unavailable';
}

export function claimInvitation(
  state: InvitationState,
): InvitationMutationResult {
  if (TERMINAL.has(state)) {
    return { state, status: 'already_terminal' };
  }

  if (state !== 'issued') {
    return { status: 'invalid' };
  }

  return { state: 'claimed', status: 'advanced' };
}

export function revokeInvitation(
  state: InvitationState,
): InvitationMutationResult {
  if (TERMINAL.has(state)) {
    return { state, status: 'already_terminal' };
  }

  return { state: 'revoked', status: 'advanced' };
}

/**
 * Server-controlled terminal transition for PRD 07's invitation
 * bounded-lifetime rule. Mirrors `revokeInvitation`'s shape: any non-terminal
 * state advances to `expired`, and an already-terminal state (including an
 * already-expired one) is reported as `already_terminal` rather than
 * re-transitioned, so a caller replaying the same expiry check never produces
 * a second transition.
 */
export function expireInvitation(
  state: InvitationState,
): InvitationMutationResult {
  if (TERMINAL.has(state)) {
    return { state, status: 'already_terminal' };
  }

  return { state: 'expired', status: 'advanced' };
}

export interface InvitationTimeoutBounds {
  absoluteTtlMs: number;
}

export type InvitationTimeoutStatus = 'active' | 'expired';

/**
 * Conservative default for PRD 07's invitation bounded-lifetime rule:
 * "Derive invitation expiry from server-controlled configuration and trusted
 * time... The exact production lifetime is a reviewed security
 * configuration, not legal text and not caller input." This default only
 * bounds the mechanism's own behavior when no server configuration overrides
 * it; it is not itself the reviewed production value.
 */
export const DEFAULT_INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Deterministic evaluation of an invitation's server-configured absolute
 * expiry, per PRD 07's "Derive invitation expiry from server-controlled
 * configuration and trusted time. The browser cannot set or extend it."
 * Mirrors `evaluateAttemptTimeout`'s contract: every timestamp is the
 * caller's own trusted-clock reading, the function reads no system clock and
 * accepts no caller-chosen TTL override beyond the explicit bound, so the
 * result is reproducible.
 *
 * Fails closed on malformed input rather than silently reporting `'active'`:
 * a non-finite timestamp (`NaN` included), a non-positive TTL, or a clock
 * that runs backward relative to `createdAtMs` throws instead of evaluating,
 * since this function's whole purpose is trusted-time expiry enforcement and
 * a silent "always active" fallback would defeat it.
 */
export function evaluateInvitationTimeout(input: {
  createdAtMs: number;
  nowUtcMs: number;
  bounds: InvitationTimeoutBounds;
}): InvitationTimeoutStatus {
  const { createdAtMs, nowUtcMs, bounds } = input;

  if (
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(nowUtcMs) ||
    !Number.isFinite(bounds.absoluteTtlMs)
  ) {
    throw new RangeError(
      'evaluateInvitationTimeout requires finite timestamps and bound.',
    );
  }

  if (bounds.absoluteTtlMs <= 0) {
    throw new RangeError(
      'evaluateInvitationTimeout requires a positive absoluteTtlMs.',
    );
  }

  if (nowUtcMs < createdAtMs) {
    throw new RangeError(
      'evaluateInvitationTimeout requires createdAtMs <= nowUtcMs.',
    );
  }

  return nowUtcMs - createdAtMs >= bounds.absoluteTtlMs ? 'expired' : 'active';
}

export interface ClaimThrottleWindow {
  maxFailuresPerWindow: number;
  windowMs: number;
}

/**
 * Conservative default for the claim-secret brute-force control. Exact
 * production thresholds are reviewed security configuration, not a value
 * this package or a caller may silently widen; this default only bounds the
 * mechanism's own behavior when no server configuration overrides it.
 */
export const DEFAULT_CLAIM_THROTTLE_WINDOW: ClaimThrottleWindow = {
  maxFailuresPerWindow: 5,
  windowMs: 15 * 60 * 1000,
};

export type ClaimThrottleStatus = 'allowed' | 'throttled';

/**
 * Deterministic evaluation of PRD 07's claim-secret brute-force control:
 * "Rate limiting, request-size limits, and bounded failed-claim controls
 * apply before expensive identity or database work" and the "Claim secret
 * brute force or rate breach" failure mode, which requires a generic
 * throttle/deny rather than revealing partial matches or account existence.
 *
 * This function reads no system clock and accepts no caller-chosen window
 * override beyond the explicit `window` argument — the caller's own trusted
 * clock and server-configured window are the only inputs, so the result is
 * reproducible. It counts only failure timestamps that fall strictly within
 * the trailing window ending at `nowUtcMs`.
 *
 * Fails closed on malformed input rather than silently reporting `'allowed'`:
 * a non-finite timestamp (`NaN` included), a non-positive/non-integer bound,
 * or a failure timestamp that runs ahead of `nowUtcMs` throws instead of
 * evaluating, since this function's whole purpose is brute-force containment
 * and a silent "always allowed" fallback would defeat it.
 */
export function evaluateClaimThrottle(input: {
  recentFailureTimestampsMs: readonly number[];
  nowUtcMs: number;
  window: ClaimThrottleWindow;
}): ClaimThrottleStatus {
  const { recentFailureTimestampsMs, nowUtcMs, window } = input;

  if (!Number.isFinite(nowUtcMs)) {
    throw new RangeError('evaluateClaimThrottle requires a finite nowUtcMs.');
  }

  if (
    !Number.isFinite(window.windowMs) ||
    window.windowMs <= 0 ||
    !Number.isInteger(window.maxFailuresPerWindow) ||
    window.maxFailuresPerWindow <= 0
  ) {
    throw new RangeError(
      'evaluateClaimThrottle requires a positive windowMs and a positive integer maxFailuresPerWindow.',
    );
  }

  for (const failureAtMs of recentFailureTimestampsMs) {
    if (!Number.isFinite(failureAtMs) || failureAtMs > nowUtcMs) {
      throw new RangeError(
        'evaluateClaimThrottle requires finite failure timestamps at or before nowUtcMs.',
      );
    }
  }

  const cutoffMs = nowUtcMs - window.windowMs;
  const countInWindow = recentFailureTimestampsMs.filter(
    (failureAtMs) => failureAtMs > cutoffMs,
  ).length;

  return countInWindow >= window.maxFailuresPerWindow ? 'throttled' : 'allowed';
}

/**
 * Server-side failure counter behind the throttle evaluation above. Keyed by
 * a caller-chosen opaque key (the authenticated principal, in PRD 07's
 * current authenticated-only invitation-secret surfaces); it stores no
 * claim secret, invitation, or outcome detail.
 */
export interface ClaimFailureTracker {
  /**
   * Failure timestamps recorded for `key` strictly after `sinceUtcMs`, in no
   * guaranteed order.
   */
  recentFailures(key: string, sinceUtcMs: number): Promise<readonly number[]>;
  recordFailure(key: string, atUtcMs: number): Promise<void>;
}

/**
 * In-memory synthetic failure tracker. Process-local and does not survive a
 * restart or span multiple replicas — a disposable mechanism-proof adapter,
 * not a production rate limiter. A production deployment behind multiple
 * processes needs a shared store; that selection is a separate reviewed
 * decision this PRD does not make.
 */
export class SyntheticClaimFailureTracker implements ClaimFailureTracker {
  private readonly failuresByKey = new Map<string, number[]>();

  async recentFailures(
    key: string,
    sinceUtcMs: number,
  ): Promise<readonly number[]> {
    const failures = this.failuresByKey.get(key) ?? [];
    return failures.filter((failureAtMs) => failureAtMs > sinceUtcMs);
  }

  async recordFailure(key: string, atUtcMs: number): Promise<void> {
    const failures = this.failuresByKey.get(key) ?? [];
    failures.push(atUtcMs);
    this.failuresByKey.set(key, failures);
  }
}

/**
 * Composes a `ClaimFailureTracker` with `evaluateClaimThrottle` for callers
 * that only need a single allowed/throttled answer for one key at one
 * instant. Callers that already hold the tracker's raw recent-failure list
 * may call `evaluateClaimThrottle` directly instead.
 */
export async function checkClaimThrottle(input: {
  tracker: ClaimFailureTracker;
  key: string;
  nowUtcMs: number;
  window?: ClaimThrottleWindow;
}): Promise<ClaimThrottleStatus> {
  const window = input.window ?? DEFAULT_CLAIM_THROTTLE_WINDOW;
  const recentFailureTimestampsMs = await input.tracker.recentFailures(
    input.key,
    input.nowUtcMs - window.windowMs,
  );

  return evaluateClaimThrottle({
    nowUtcMs: input.nowUtcMs,
    recentFailureTimestampsMs,
    window,
  });
}

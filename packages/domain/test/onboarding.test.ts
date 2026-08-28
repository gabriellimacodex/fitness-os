import { describe, expect, it } from 'vitest';

import {
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
} from '@fitness-os/schemas';

import {
  ATTEMPT_ACTIVE_CAP,
  canAllocateAttempt,
  checkClaimThrottle,
  DEFAULT_CLAIM_THROTTLE_WINDOW,
  evaluateClaimEligibility,
  evaluateClaimThrottle,
  inspectInvitationState,
  revokeInvitation,
  selectAttempt,
  SyntheticClaimFailureTracker,
  transitionAttempt,
} from '../src/onboarding/index.js';
import type { AttemptDetail } from '@fitness-os/schemas';

const attempt = (overrides: Partial<AttemptDetail> = {}): AttemptDetail => ({
  attemptId: onboardingAttemptIdSchema.parse(
    overrides.attemptId ?? '55555555-5555-4555-8555-555555555555',
  ),
  invitationId: onboardingInvitationIdSchema.parse(
    '66666666-6666-4666-8666-666666666666',
  ),
  proposedRole: 'student',
  purpose: 'student_onboarding',
  lifecycle: 'policy_pending',
  ordinal: 1,
  predecessorAttemptId: null,
  terminalReason: null,
  policy: null,
  ...overrides,
});

describe('attempt transitions', () => {
  it('allows only the forward edges', () => {
    const ready = transitionAttempt(attempt(), 'ready_to_claim');
    expect(ready.status).toBe('advanced');

    const backward = transitionAttempt(attempt(), 'completed');
    expect(backward.status).toBe('invalid');

    const completed = attempt({ lifecycle: 'completed' });
    expect(transitionAttempt(completed, 'policy_pending').status).toBe(
      'already_terminal',
    );
  });

  it('requires a terminal reason only when entering terminal', () => {
    expect(transitionAttempt(attempt(), 'terminal').status).toBe('invalid');
    expect(transitionAttempt(attempt(), 'terminal', 'abandoned').status).toBe(
      'advanced',
    );
  });
});

describe('attempt selection', () => {
  it('never silently picks among several active attempts', () => {
    const first = attempt();
    const second = attempt({
      attemptId: onboardingAttemptIdSchema.parse(
        '77777777-7777-4777-8777-777777777777',
      ),
      ordinal: 2,
    });

    expect(selectAttempt([first, second], undefined).status).toBe(
      'selection_required',
    );
    expect(selectAttempt([first, second], first.attemptId).status).toBe(
      'attempt_selected',
    );
  });

  it('enforces the fixed active cap', () => {
    expect(canAllocateAttempt(ATTEMPT_ACTIVE_CAP - 1)).toBe(true);
    expect(canAllocateAttempt(ATTEMPT_ACTIVE_CAP)).toBe(false);
  });
});

describe('claim eligibility', () => {
  it('hard-disables second-role and self-coach claims', () => {
    expect(
      evaluateClaimEligibility({
        alreadyMappedRoles: ['coach'],
        invitationPurpose: 'student_onboarding',
        proposedRole: 'student',
        targetCoachIsSelf: false,
      }),
    ).toEqual({ reason: 'second_role', status: 'hard_disabled' });

    expect(
      evaluateClaimEligibility({
        alreadyMappedRoles: [],
        invitationPurpose: 'student_onboarding',
        proposedRole: 'student',
        targetCoachIsSelf: true,
      }),
    ).toEqual({ reason: 'self_coach', status: 'hard_disabled' });

    expect(
      evaluateClaimEligibility({
        alreadyMappedRoles: [],
        invitationPurpose: 'student_onboarding',
        proposedRole: 'student',
        targetCoachIsSelf: false,
      }),
    ).toEqual({ status: 'allowed' });
  });
});

describe('invitation inspection', () => {
  it('collapses every non-issued state to the same unavailable result', () => {
    expect(inspectInvitationState('issued')).toBe('issued');
    expect(inspectInvitationState('revoked')).toBe('invalid_or_unavailable');
    expect(inspectInvitationState('expired')).toBe('invalid_or_unavailable');
    expect(revokeInvitation('issued')).toEqual({
      state: 'revoked',
      status: 'advanced',
    });
  });
});

describe('claim-secret brute-force throttle', () => {
  const window = { maxFailuresPerWindow: 3, windowMs: 1000 };

  it('allows while the trailing window has fewer failures than the cap', () => {
    expect(
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [9_500, 9_600],
        window,
      }),
    ).toBe('allowed');
  });

  it('throttles once the trailing window reaches the cap', () => {
    expect(
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [9_100, 9_500, 9_600],
        window,
      }),
    ).toBe('throttled');
  });

  it('ignores failures outside the trailing window', () => {
    expect(
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [8_000, 8_500, 8_900],
        window,
      }),
    ).toBe('allowed');
  });

  it('excludes the timestamp exactly at the window boundary', () => {
    expect(
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [9_000, 9_500, 9_600],
        window,
      }),
    ).toBe('allowed');
  });

  it('fails closed on a non-finite timestamp instead of reporting allowed', () => {
    expect(() =>
      evaluateClaimThrottle({
        nowUtcMs: Number.NaN,
        recentFailureTimestampsMs: [],
        window,
      }),
    ).toThrow(RangeError);

    expect(() =>
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [Number.POSITIVE_INFINITY],
        window,
      }),
    ).toThrow(RangeError);
  });

  it('fails closed on a non-positive or non-integer window bound', () => {
    expect(() =>
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [],
        window: { maxFailuresPerWindow: 0, windowMs: 1000 },
      }),
    ).toThrow(RangeError);

    expect(() =>
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [],
        window: { maxFailuresPerWindow: 1.5, windowMs: 1000 },
      }),
    ).toThrow(RangeError);

    expect(() =>
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [],
        window: { maxFailuresPerWindow: 3, windowMs: 0 },
      }),
    ).toThrow(RangeError);
  });

  it('fails closed on a failure timestamp that runs ahead of nowUtcMs', () => {
    expect(() =>
      evaluateClaimThrottle({
        nowUtcMs: 10_000,
        recentFailureTimestampsMs: [10_001],
        window,
      }),
    ).toThrow(RangeError);
  });

  it('DEFAULT_CLAIM_THROTTLE_WINDOW is a positive, sane default', () => {
    expect(DEFAULT_CLAIM_THROTTLE_WINDOW.maxFailuresPerWindow).toBeGreaterThan(
      0,
    );
    expect(DEFAULT_CLAIM_THROTTLE_WINDOW.windowMs).toBeGreaterThan(0);
  });
});

describe('SyntheticClaimFailureTracker + checkClaimThrottle', () => {
  it('tracks failures per key and throttles once the cap is reached', async () => {
    const tracker = new SyntheticClaimFailureTracker();
    const window = { maxFailuresPerWindow: 2, windowMs: 1000 };

    expect(
      await checkClaimThrottle({
        key: 'principal-a',
        nowUtcMs: 0,
        tracker,
        window,
      }),
    ).toBe('allowed');

    await tracker.recordFailure('principal-a', 100);
    expect(
      await checkClaimThrottle({
        key: 'principal-a',
        nowUtcMs: 200,
        tracker,
        window,
      }),
    ).toBe('allowed');

    await tracker.recordFailure('principal-a', 200);
    expect(
      await checkClaimThrottle({
        key: 'principal-a',
        nowUtcMs: 300,
        tracker,
        window,
      }),
    ).toBe('throttled');
  });

  it('keeps each key isolated', async () => {
    const tracker = new SyntheticClaimFailureTracker();
    const window = { maxFailuresPerWindow: 1, windowMs: 1000 };

    await tracker.recordFailure('principal-a', 0);
    expect(
      await checkClaimThrottle({
        key: 'principal-a',
        nowUtcMs: 100,
        tracker,
        window,
      }),
    ).toBe('throttled');
    expect(
      await checkClaimThrottle({
        key: 'principal-b',
        nowUtcMs: 100,
        tracker,
        window,
      }),
    ).toBe('allowed');
  });

  it('stops counting a failure once it falls outside the window', async () => {
    const tracker = new SyntheticClaimFailureTracker();
    const window = { maxFailuresPerWindow: 1, windowMs: 1000 };

    await tracker.recordFailure('principal-a', 0);
    expect(
      await checkClaimThrottle({
        key: 'principal-a',
        nowUtcMs: 1_500,
        tracker,
        window,
      }),
    ).toBe('allowed');
  });
});

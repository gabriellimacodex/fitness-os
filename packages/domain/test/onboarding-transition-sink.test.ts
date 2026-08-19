import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingTransitionSink } from '../src/onboarding/transition-sink.js';

describe('SyntheticOnboardingTransitionSink', () => {
  it('appends transition evidence and rejects exact duplicates', async () => {
    const sink = new SyntheticOnboardingTransitionSink();
    const record = {
      aggregate: 'attempt' as const,
      aggregateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nextState: 'ready_to_claim',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      previousState: 'policy_pending',
      reason: 'policy_ready',
      recordedAt: '2026-08-19T12:00:00.000Z',
    };
    await expect(sink.append(record)).resolves.toBe('accepted');
    await expect(sink.append(record)).resolves.toBe('conflict');
    expect(sink.list()).toEqual([record]);
  });
});

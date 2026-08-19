import { describe, expect, it } from 'vitest';

import {
  FixedTrustedClock,
  SystemTrustedClock,
} from '../src/onboarding/ports.js';

describe('TrustedClock', () => {
  it('returns a fixed instant from FixedTrustedClock', () => {
    const clock = new FixedTrustedClock('2026-08-19T12:00:00.000Z');
    expect(clock.nowUtcMs()).toBe('2026-08-19T12:00:00.000Z');
  });

  it('returns an ISO timestamp from SystemTrustedClock', () => {
    const value = new SystemTrustedClock().nowUtcMs();
    expect(Number.isNaN(Date.parse(value))).toBe(false);
  });
});

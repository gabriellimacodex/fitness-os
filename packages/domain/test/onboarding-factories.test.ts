import { describe, expect, it } from 'vitest';

import {
  CryptoOnboardingIdFactory,
  CryptoOnboardingSecretFactory,
} from '../src/onboarding/factories.js';

describe('onboarding factories', () => {
  it('mints distinct UUIDs for attempt, invitation, and operation', () => {
    const ids = new CryptoOnboardingIdFactory();
    const attemptId = ids.attemptId();
    const invitationId = ids.invitationId();
    const operationId = ids.operationId();
    expect(attemptId).not.toBe(invitationId);
    expect(invitationId).not.toBe(operationId);
    expect(attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('mints high-entropy claim secrets', () => {
    const secrets = new CryptoOnboardingSecretFactory();
    const left = secrets.claimSecret();
    const right = secrets.claimSecret();
    expect(left).not.toBe(right);
    expect(left.length).toBeGreaterThanOrEqual(32);
  });
});

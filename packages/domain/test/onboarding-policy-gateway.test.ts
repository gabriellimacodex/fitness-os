import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingPolicyGateway } from '../src/onboarding/policy-gateway.js';

describe('SyntheticOnboardingPolicyGateway', () => {
  it('returns a reference-only ready handoff in synthetic mode', async () => {
    const gateway = new SyntheticOnboardingPolicyGateway({
      integritySeed: 'test',
      packageVersion: 2,
    });
    const result = await gateway.refresh({
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      productionMode: false,
    });
    expect(result.status).toBe('started');
    if (result.status === 'started') {
      expect(result.handoff.status).toBe('ready');
      expect(result.handoff.packageVersion).toBe(2);
      expect(result.handoff.integrityDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(result.handoff)).not.toMatch(/legal|consent text/i);
    }
  });

  it('blocks synthetic gateway use in productionMode', async () => {
    const gateway = new SyntheticOnboardingPolicyGateway();
    await expect(
      gateway.refresh({
        attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        productionMode: true,
      }),
    ).resolves.toEqual({
      reason: 'synthetic_in_production',
      status: 'blocked',
    });
  });
});

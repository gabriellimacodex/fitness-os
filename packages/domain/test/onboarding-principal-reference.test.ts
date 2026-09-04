import { describe, expect, it } from 'vitest';

import { SyntheticPrincipalReferenceDeriver } from '../src/onboarding/principal-reference.js';

describe('SyntheticPrincipalReferenceDeriver', () => {
  it('derives a single candidate and denies productionMode', async () => {
    const deriver = new SyntheticPrincipalReferenceDeriver();
    await expect(
      deriver.derive({
        environment: 'disposable',
        issuer: 'synthetic.identity.v1',
        productionMode: true,
        subjectDigest: 'abc',
      }),
    ).resolves.toEqual({
      reason: 'synthetic_in_production',
      status: 'denied',
    });

    const derived = await deriver.derive({
      environment: 'disposable',
      issuer: 'synthetic.identity.v1',
      productionMode: false,
      subjectDigest: 'abc',
    });
    expect(derived.status).toBe('derived');
    if (derived.status === 'derived') {
      expect(derived.candidates).toHaveLength(1);
      expect(derived.candidates[0]?.derivationVersion).toBe('synthetic.v1');
      expect(derived.candidates[0]?.principalReferenceDigest).toContain(
        'synthetic.identity.v1',
      );
    }
  });

  it('denies a blank subject digest', async () => {
    const deriver = new SyntheticPrincipalReferenceDeriver();
    await expect(
      deriver.derive({
        environment: 'disposable',
        issuer: 'synthetic.identity.v1',
        productionMode: false,
        subjectDigest: '   ',
      }),
    ).resolves.toEqual({
      reason: 'missing_subject',
      status: 'denied',
    });
  });

  it('denies a blank issuer', async () => {
    const deriver = new SyntheticPrincipalReferenceDeriver();
    await expect(
      deriver.derive({
        environment: 'disposable',
        issuer: '   ',
        productionMode: false,
        subjectDigest: 'abc',
      }),
    ).resolves.toEqual({
      reason: 'unapproved_issuer',
      status: 'denied',
    });
  });
});

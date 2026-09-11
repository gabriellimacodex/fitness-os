import { describe, expect, it } from 'vitest';

import { SyntheticIdentitySessionPort } from '../src/onboarding/identity-session.js';

describe('SyntheticIdentitySessionPort', () => {
  it('resolves trusted synthetic principals outside productionMode', async () => {
    const port = new SyntheticIdentitySessionPort();
    await expect(
      port.resolve({
        mappedRoles: ['coach'],
        productionMode: false,
        synthetic: true,
        trustedPrincipalKey: 'principal-a',
      }),
    ).resolves.toEqual({
      context: {
        mappedRoles: ['coach'],
        principalKey: 'principal-a',
        synthetic: true,
      },
      status: 'resolved',
    });
  });

  it('defaults synthetic to true and mappedRoles to empty when omitted', async () => {
    const port = new SyntheticIdentitySessionPort();
    await expect(
      port.resolve({
        productionMode: false,
        trustedPrincipalKey: 'principal-b',
      }),
    ).resolves.toEqual({
      context: {
        mappedRoles: [],
        principalKey: 'principal-b',
        synthetic: true,
      },
      status: 'resolved',
    });
  });

  it('denies missing principals and synthetic-in-production', async () => {
    const port = new SyntheticIdentitySessionPort();
    await expect(
      port.resolve({
        productionMode: false,
        trustedPrincipalKey: null,
      }),
    ).resolves.toEqual({ reason: 'missing', status: 'denied' });
    await expect(
      port.resolve({
        productionMode: true,
        synthetic: true,
        trustedPrincipalKey: 'principal-a',
      }),
    ).resolves.toEqual({
      reason: 'synthetic_in_production',
      status: 'denied',
    });
    await expect(
      port.resolve({
        productionMode: true,
        synthetic: false,
        trustedPrincipalKey: 'principal-a',
      }),
    ).resolves.toEqual({
      reason: 'synthetic_in_production',
      status: 'denied',
    });
  });
});

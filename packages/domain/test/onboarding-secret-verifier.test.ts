import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { HmacInvitationSecretVerifier } from '../src/onboarding/secret-verifier.js';

describe('HmacInvitationSecretVerifier', () => {
  it('matches digests for the same secret and rejects mismatches', () => {
    const verifier = new HmacInvitationSecretVerifier(randomBytes(32));
    const digest = verifier.digest('synthetic-claim-secret-01');
    expect(verifier.verify('synthetic-claim-secret-01', digest)).toEqual({
      status: 'matched',
    });
    expect(verifier.verify('synthetic-claim-secret-02', digest)).toEqual({
      status: 'mismatch',
    });
    expect(digest.startsWith('hmac-sha256.v1:')).toBe(true);
  });
});

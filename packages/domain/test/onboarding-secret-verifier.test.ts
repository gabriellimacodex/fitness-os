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

  it('always emits a fixed-length digest for any input secret', () => {
    const verifier = new HmacInvitationSecretVerifier(randomBytes(32));
    const shortDigest = verifier.digest('a');
    const longDigest = verifier.digest(
      'a-considerably-longer-synthetic-claim-secret-value',
    );
    expect(shortDigest).toHaveLength(longDigest.length);
  });

  it('returns mismatch, without throwing, when the stored claimDigest is a different length than the expected digest', () => {
    // `timingSafeEqual` throws on a buffer-length mismatch, so `verify` must
    // guard against a claimDigest that is shorter, longer, or otherwise not
    // the fixed `hmac-sha256.v1:<64 hex>` shape this verifier always emits —
    // e.g. a corrupted or legacy-format stored digest — rather than letting
    // an unhandled exception surface out of invitation-claim verification.
    const verifier = new HmacInvitationSecretVerifier(randomBytes(32));
    const digest = verifier.digest('synthetic-claim-secret-01');

    expect(
      verifier.verify('synthetic-claim-secret-01', digest.slice(0, -1)),
    ).toEqual({ status: 'mismatch' });
    expect(verifier.verify('synthetic-claim-secret-01', `${digest}0`)).toEqual({
      status: 'mismatch',
    });
    expect(verifier.verify('synthetic-claim-secret-01', '')).toEqual({
      status: 'mismatch',
    });
  });

  it('rejects a same-length claimDigest string that never came from this verifier', () => {
    const verifier = new HmacInvitationSecretVerifier(randomBytes(32));
    const digest = verifier.digest('synthetic-claim-secret-01');
    const sameLengthGarbage = `hmac-sha256.v1:${'0'.repeat(64)}`;
    expect(sameLengthGarbage).toHaveLength(digest.length);

    expect(
      verifier.verify('synthetic-claim-secret-01', sameLengthGarbage),
    ).toEqual({ status: 'mismatch' });
  });
});

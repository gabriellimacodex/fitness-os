import { createHmac, timingSafeEqual } from 'node:crypto';

export type InvitationSecretVerification =
  { status: 'matched' } | { status: 'mismatch' };

/**
 * Generate/verify versioned high-entropy claim material; return only
 * verifier-safe classifications (never echo secrets).
 */
export interface InvitationSecretVerifier {
  digest(secret: string): string;
  verify(secret: string, claimDigest: string): InvitationSecretVerification;
}

export class HmacInvitationSecretVerifier implements InvitationSecretVerifier {
  constructor(private readonly pepper: Buffer) {}

  digest(secret: string): string {
    const mac = createHmac('sha256', this.pepper)
      .update(secret, 'utf8')
      .digest('hex');
    return `hmac-sha256.v1:${mac}`;
  }

  verify(secret: string, claimDigest: string): InvitationSecretVerification {
    const expected = this.digest(secret);
    const left = Buffer.from(expected);
    const right = Buffer.from(claimDigest);
    if (left.length !== right.length) {
      timingSafeEqual(left, left);
      return { status: 'mismatch' };
    }
    return timingSafeEqual(left, right)
      ? { status: 'matched' }
      : { status: 'mismatch' };
  }
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type LedgerKeyStatus = 'active' | 'retired';

export interface LedgerKey {
  keyId: string;
  secret: Buffer;
  status: LedgerKeyStatus;
}

export interface SignedLedgerResult {
  digest: string;
  keyId: string;
}

export interface LedgerKeyRing {
  keys: readonly LedgerKey[];
}

export type LedgerKeyRingFailure =
  | 'missing_active_key'
  | 'duplicate_key_id'
  | 'missing_ledger_key'
  | 'invalid_signature';

export function ledgerKeyRingEpoch(ring: LedgerKeyRing): string {
  const payload = ring.keys
    .map((key) => `${key.keyId}:${key.status}`)
    .join('\n');

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function activeLedgerKey(
  ring: LedgerKeyRing,
): LedgerKey | LedgerKeyRingFailure {
  const active = ring.keys.filter((key) => key.status === 'active');

  if (active.length !== 1) {
    return 'missing_active_key';
  }

  const identifiers = new Set<string>();

  for (const key of ring.keys) {
    if (identifiers.has(key.keyId)) {
      return 'duplicate_key_id';
    }

    identifiers.add(key.keyId);
  }

  return active[0]!;
}

export function signLedgerResult(
  ring: LedgerKeyRing,
  canonicalResult: string,
): SignedLedgerResult | LedgerKeyRingFailure {
  const active = activeLedgerKey(ring);

  if (typeof active === 'string') {
    return active;
  }

  return {
    digest: createHmac('sha256', active.secret)
      .update(canonicalResult, 'utf8')
      .digest('hex'),
    keyId: active.keyId,
  };
}

export function verifyLedgerResult(
  ring: LedgerKeyRing,
  canonicalResult: string,
  signed: SignedLedgerResult,
): true | LedgerKeyRingFailure {
  const key = ring.keys.find((entry) => entry.keyId === signed.keyId);

  if (key === undefined) {
    return 'missing_ledger_key';
  }

  const expected = createHmac('sha256', key.secret)
    .update(canonicalResult, 'utf8')
    .digest();
  const provided = Buffer.from(signed.digest, 'hex');

  if (provided.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return 'invalid_signature';
  }

  return timingSafeEqual(provided, expected) ? true : 'invalid_signature';
}

export function replicasShareEpoch(
  left: LedgerKeyRing,
  right: LedgerKeyRing,
): boolean {
  return ledgerKeyRingEpoch(left) === ledgerKeyRingEpoch(right);
}

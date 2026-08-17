import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  activeLedgerKey,
  ledgerKeyRingEpoch,
  replicasShareEpoch,
  signLedgerResult,
  verifyLedgerResult,
  type LedgerKeyRing,
} from '../src/catalog/ledger-keyring.js';

function key(
  keyId: string,
  status: 'active' | 'retired',
  secret = randomBytes(32),
) {
  return { keyId, secret, status };
}

function signedResult(ring: LedgerKeyRing, canonicalResult: string) {
  const signed = signLedgerResult(ring, canonicalResult);

  if (typeof signed === 'string') {
    throw new Error(signed);
  }

  return signed;
}

describe('ledger key ring', () => {
  it('signs with the active key and still verifies a retired key', () => {
    const retired = key('ledger.v1', 'retired');
    const active = key('ledger.v2', 'active');
    const current: LedgerKeyRing = { keys: [retired, active] };
    const historical: LedgerKeyRing = {
      keys: [{ ...retired, status: 'active' }],
    };
    const previous = signedResult(historical, '{"ok":true}');
    const next = signedResult(current, '{"ok":true}');

    expect(next.keyId).toBe('ledger.v2');
    expect(verifyLedgerResult(current, '{"ok":true}', next)).toBe(true);
    expect(verifyLedgerResult(current, '{"ok":true}', previous)).toBe(true);
    expect(
      verifyLedgerResult(current, '{"ok":true}', {
        digest: next.digest,
        keyId: 'ledger.v1',
      }),
    ).toBe('invalid_signature');
  });

  it('does not treat the cursor secret as a ledger key', () => {
    const ledger = key('ledger.v1', 'active');
    const signed = signedResult({ keys: [ledger] }, 'result');

    expect(
      verifyLedgerResult(
        { keys: [{ ...ledger, secret: randomBytes(32) }] },
        'result',
        signed,
      ),
    ).toBe('invalid_signature');
  });

  it('fails closed when the cited key is absent', () => {
    const ring: LedgerKeyRing = { keys: [key('ledger.v2', 'active')] };

    expect(
      verifyLedgerResult(ring, 'result', {
        digest: 'aa'.repeat(32),
        keyId: 'ledger.v1',
      }),
    ).toBe('missing_ledger_key');
    expect(activeLedgerKey({ keys: [] })).toBe('missing_active_key');
    expect(
      activeLedgerKey({
        keys: [key('ledger.v1', 'active'), key('ledger.v1', 'retired')],
      }),
    ).toBe('duplicate_key_id');
  });

  it('compares replica epochs without exchanging secrets', () => {
    const left: LedgerKeyRing = {
      keys: [key('ledger.v1', 'retired'), key('ledger.v2', 'active')],
    };
    const right: LedgerKeyRing = {
      keys: [key('ledger.v1', 'retired'), key('ledger.v2', 'active')],
    };
    const drifted: LedgerKeyRing = {
      keys: [key('ledger.v2', 'active')],
    };

    expect(replicasShareEpoch(left, right)).toBe(true);
    expect(replicasShareEpoch(left, drifted)).toBe(false);
    expect(ledgerKeyRingEpoch(left)).toBe(ledgerKeyRingEpoch(right));
    expect(ledgerKeyRingEpoch(left)).not.toContain(
      left.keys[0]!.secret.toString('hex'),
    );
  });
});

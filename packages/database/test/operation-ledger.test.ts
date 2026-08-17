import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  canonicalizeLedgerJson,
  catalogOperationKey,
  signLedgerResult,
  verifyLedgerResult,
  type LedgerKeyRing,
} from '../src/catalog/index.js';

describe('catalog operation key and Option A signing', () => {
  it('namespaces operation UUIDs without accepting a cursor secret role', () => {
    const operationId = '55555555-5555-4555-8555-555555555555';
    expect(catalogOperationKey('exercise.publish', operationId)).toBe(
      `exercise.publish:${operationId}`,
    );
    expect(
      catalogOperationKey('manifest.ingest', operationId.toUpperCase()),
    ).toBe(`manifest.ingest:${operationId}`);
  });

  it('binds a committed result to a ledger key id, not a presentation secret', () => {
    const ledgerSecret = randomBytes(32);
    const cursorSecret = randomBytes(32);
    const ring: LedgerKeyRing = {
      keys: [{ keyId: 'ledger.v1', secret: ledgerSecret, status: 'active' }],
    };
    const payload = canonicalizeLedgerJson({
      revision: 1,
      exerciseId: randomUUID(),
    });
    const signed = signLedgerResult(ring, payload);

    expect(typeof signed).not.toBe('string');
    if (typeof signed === 'string') {
      throw new Error(signed);
    }

    expect(signed.keyId).toBe('ledger.v1');
    expect(signed.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.digest).not.toBe(
      createHash('sha256').update(payload).digest('hex'),
    );

    const cursorRing: LedgerKeyRing = {
      keys: [{ keyId: 'ledger.v1', secret: cursorSecret, status: 'active' }],
    };
    const withCursor = signLedgerResult(cursorRing, payload);
    if (typeof withCursor === 'string') {
      throw new Error(withCursor);
    }

    expect(withCursor.digest).not.toBe(signed.digest);
  });

  it('verifies equivalent payloads regardless of object key insertion order', () => {
    const ring: LedgerKeyRing = {
      keys: [{ keyId: 'ledger.v1', secret: randomBytes(32), status: 'active' }],
    };
    const left = { revision: 1, nested: { b: 2, a: 1 }, exerciseId: 'x' };
    const right = { exerciseId: 'x', nested: { a: 1, b: 2 }, revision: 1 };
    const signed = signLedgerResult(ring, canonicalizeLedgerJson(left));

    expect(typeof signed).not.toBe('string');
    if (typeof signed === 'string') {
      throw new Error(signed);
    }

    expect(
      verifyLedgerResult(ring, canonicalizeLedgerJson(right), signed),
    ).toBe(true);
    expect(canonicalizeLedgerJson(left)).toBe(canonicalizeLedgerJson(right));
  });
});

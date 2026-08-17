import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  catalogOperationKey,
  signLedgerResult,
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
    const payload = JSON.stringify({ exerciseId: randomUUID(), revision: 1 });
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
});

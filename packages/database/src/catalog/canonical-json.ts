import { createHash } from 'node:crypto';

/** Order-stable JSON for ledger result integrity (nfc strings, sorted object keys). */
export function canonicalizeLedgerJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function digestLedgerJson(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizeLedgerJson(value), 'utf8')
    .digest('hex');
}

function normalize(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Ledger JSON rejects non-finite numbers');
    }

    return value;
  }

  if (typeof value === 'string') {
    return value.normalize('NFC');
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key.normalize('NFC'), normalize(entry)] as const)
      .sort(([left], [right]) =>
        Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')),
      );
    const normalized: Record<string, unknown> = {};

    for (const [key, entry] of entries) {
      normalized[key] = entry;
    }

    return normalized;
  }

  throw new Error('Ledger JSON rejects non-JSON values');
}

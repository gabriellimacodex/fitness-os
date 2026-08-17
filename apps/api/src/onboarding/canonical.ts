import { createHash } from 'node:crypto';

export function canonicalizeUtf8JsonV1(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function digestUtf8JsonSha256V1(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizeUtf8JsonV1(value), 'utf8')
    .digest('hex');
}

function normalize(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Canonical JSON rejects non-finite numbers');
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
    let previous: string | undefined;

    for (const [key, entry] of entries) {
      if (key === previous) {
        throw new Error('Canonical JSON rejects duplicate normalized keys');
      }

      previous = key;
      normalized[key] = entry;
    }

    return normalized;
  }

  throw new Error('Canonical JSON rejects non-JSON values');
}

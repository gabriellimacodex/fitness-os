import { describe, expect, it } from 'vitest';

import { canonicalizeUtf8JsonV1, digestUtf8JsonSha256V1 } from './canonical.js';

describe('utf8-json-sha256.v1', () => {
  it('is independent of object insertion order', () => {
    const left = canonicalizeUtf8JsonV1({
      namespace: 'create_attempt',
      invitationRef: 'abc',
      authority: 'principal-a',
    });
    const right = canonicalizeUtf8JsonV1({
      authority: 'principal-a',
      invitationRef: 'abc',
      namespace: 'create_attempt',
    });

    expect(left).toBe(right);
    expect(digestUtf8JsonSha256V1({ b: 1, a: 2 })).toBe(
      digestUtf8JsonSha256V1({ a: 2, b: 1 }),
    );
  });

  it('normalizes strings to NFC before hashing', () => {
    const composed = 'café';
    const decomposed = 'cafe\u0301';

    expect(composed.normalize('NFC')).toBe(decomposed.normalize('NFC'));
    expect(digestUtf8JsonSha256V1({ value: composed })).toBe(
      digestUtf8JsonSha256V1({ value: decomposed }),
    );
  });

  it('rejects non-plain-object values instead of silently normalizing them to {}', () => {
    // A `Date`/`Map`/`Set`/`RegExp` has no own enumerable properties, so
    // `Object.entries` over one yields `[]`. Without a prototype check,
    // `normalize` would silently treat every one of these as `{}`, making
    // two semantically different inputs digest identically.
    expect(() => canonicalizeUtf8JsonV1(new Date('2026-01-01'))).toThrow(
      'Canonical JSON rejects non-JSON values',
    );
    expect(() => canonicalizeUtf8JsonV1(new Map([['a', 1]]))).toThrow(
      'Canonical JSON rejects non-JSON values',
    );
    expect(() => canonicalizeUtf8JsonV1(new Set([1, 2]))).toThrow(
      'Canonical JSON rejects non-JSON values',
    );
    expect(() => canonicalizeUtf8JsonV1(/abc/)).toThrow(
      'Canonical JSON rejects non-JSON values',
    );
    expect(() =>
      canonicalizeUtf8JsonV1({ nested: new Date('2026-01-01') }),
    ).toThrow('Canonical JSON rejects non-JSON values');

    // A plain object literal and a null-prototype object are both still
    // accepted -- this is not a blanket rejection of every non-Array object.
    expect(canonicalizeUtf8JsonV1({ a: 1 })).toBe('{"a":1}');
    const nullProto: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    nullProto.a = 1;
    expect(canonicalizeUtf8JsonV1(nullProto)).toBe('{"a":1}');
  });
});

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
});

import { describe, expect, it } from 'vitest';

import { getApiBaseUrl } from './api-base-url';

describe('getApiBaseUrl', () => {
  it('defaults to the local Fastify origin', () => {
    expect(getApiBaseUrl(undefined)).toBe('http://127.0.0.1:3001');
  });

  it('rejects a relative or non-HTTP origin', () => {
    expect(() => getApiBaseUrl('/api')).toThrow(
      'API base URL must be an absolute HTTP(S) URL.',
    );
    expect(() => getApiBaseUrl('ftp://example.com')).toThrow(
      'API base URL must be an absolute HTTP(S) URL.',
    );
  });
});

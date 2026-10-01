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

  it('strips a trailing slash from a configured origin', () => {
    expect(getApiBaseUrl('https://api.example.com/')).toBe(
      'https://api.example.com',
    );
  });

  it('preserves a configured non-root path and port without a trailing slash', () => {
    expect(getApiBaseUrl('https://api.example.com:8443/v1/')).toBe(
      'https://api.example.com:8443/v1',
    );
  });

  it('leaves an already-normalized origin unchanged', () => {
    expect(getApiBaseUrl('http://api.example.com')).toBe(
      'http://api.example.com',
    );
  });
});

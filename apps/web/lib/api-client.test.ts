import { describe, expect, it, vi } from 'vitest';

import {
  ApiClientError,
  ApiProtocolError,
  createApiClient,
} from './api-client';

describe('createApiClient', () => {
  it('rejects a relative base URL', () => {
    expect(() => createApiClient({ baseUrl: '/api' })).toThrow(
      'API base URL must be an absolute HTTP(S) URL.',
    );
  });

  it('fetches and validates the health response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ status: 'ok' }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com/platform',
      fetch,
    });

    await expect(client.health()).resolves.toEqual({ status: 'ok' });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.example.com/platform/health'),
      {
        headers: { accept: 'application/json' },
        method: 'GET',
      },
    );
  });

  it('fetches and validates a ready response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ status: 'ready' }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(client.readiness()).resolves.toEqual({ status: 'ready' });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.example.com/ready'),
      {
        headers: { accept: 'application/json' },
        method: 'GET',
      },
    );
  });

  it('throws a typed API error for a valid non-success response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Route not found',
            requestId: 'req-42',
          },
        },
        { status: 404 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client.health().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route not found',
      name: 'ApiClientError',
      requestId: 'req-42',
      safeMessage: 'Route not found',
      status: 404,
    });
  });

  it('throws a content-safe protocol error for a malformed success response', async () => {
    const rawContent = 'private-provider-detail';
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ status: rawContent }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client.health().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(String(error)).not.toContain(rawContent);
  });

  it('throws a content-safe protocol error for a malformed failure response', async () => {
    const rawContent = 'internal-database-detail';
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { error: { code: 'UNKNOWN_CODE', message: rawContent } },
        { status: 500 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client.health().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(String(error)).not.toContain(rawContent);
  });

  it('throws a content-safe protocol error when the response is not JSON', async () => {
    const rawContent = 'private upstream response';
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(rawContent, { status: 200 }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client.health().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(String(error)).not.toContain(rawContent);
  });

  it('throws a typed API error for an unexpected readiness failure', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Request could not be completed',
            requestId: 'req-ready-1',
          },
        },
        { status: 500 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client.readiness().catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: 'req-ready-1',
      status: 500,
    });
    expect(error).toBeInstanceOf(ApiClientError);
  });

  it('returns the validated not-ready contract for expected unavailability', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ status: 'not_ready' }, { status: 503 }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(client.readiness()).resolves.toEqual({ status: 'not_ready' });
  });

  it('throws a protocol error for a malformed ready response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ status: 'unknown-readiness-state' }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(client.readiness()).rejects.toBeInstanceOf(ApiProtocolError);
  });
});

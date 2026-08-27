import {
  apiErrorResponseSchema,
  movementListResponseSchema,
} from '@fitness-os/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

describe('GET /movements', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the preview catalog through the frozen schema', async () => {
    const response = await app.inject({ method: 'GET', url: '/movements' });
    const body = movementListResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.items.map((item) => item.movementId)).toEqual([
      'bodyweight-squat',
      'hip-hinge',
    ]);
  });

  it('rejects any query key with the shared bad-request envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/movements?search=squat',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('sets no-store on unexpected movement failures', async () => {
    app.addHook('preHandler', async (request) => {
      if ((request.url.split('?')[0] ?? '') === '/movements') {
        throw new Error('private catalog failure');
      }
    });

    const response = await app.inject({ method: 'GET', url: '/movements' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('private catalog failure');
  });
});

describe('GET /movements/:movementId', () => {
  it('returns 400 for a malformed identifier', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/movements/AB',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    await app.close();
  });

  it('rejects any query key on the detail route', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/movements/missing-movement?preview=1',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.error.code).toBe('BAD_REQUEST');
    await app.close();
  });

  it('returns 404 for an unknown or withdrawn identifier', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/movements/missing-movement',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('withdrawn');
    await app.close();
  });

  it('does not reflect a client-supplied request identifier', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/movements/missing-movement',
      headers: { 'x-request-id': 'client-controlled' },
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.headers['x-request-id']).not.toBe('client-controlled');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    await app.close();
  });
});

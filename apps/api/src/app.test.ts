import {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@fitness-os/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

describe('GET /health', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the technical health response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = healthResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  it('publishes only the server-generated request identifier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'client-controlled' },
    });

    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-request-id']).not.toBe('client-controlled');
  });
});

describe('GET /ready', () => {
  it('returns ready when the injected check returns true', async () => {
    const app = buildApp({}, { readinessCheck: () => true });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(readinessResponseSchema.parse(response.json())).toEqual({
      status: 'ready',
    });
    await app.close();
  });

  it('returns not ready when the injected check returns false', async () => {
    const app = buildApp({}, { readinessCheck: () => false });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(readinessResponseSchema.parse(response.json())).toEqual({
      status: 'not_ready',
    });
    await app.close();
  });

  it('contains readiness exceptions behind the not-ready contract', async () => {
    const app = buildApp(
      { logger: false },
      {
        readinessCheck: () => {
          throw new Error('private dependency detail');
        },
      },
    );

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private dependency detail');
    expect(readinessResponseSchema.parse(response.json())).toEqual({
      status: 'not_ready',
    });
    await app.close();
  });
});

describe('public errors', () => {
  it('returns the shared not-found envelope with request correlation', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/missing' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    await app.close();
  });

  it('contains unexpected exceptions behind the internal-error envelope', async () => {
    const app = buildApp({ logger: false });
    app.get('/explode', async () => {
      throw new Error('private failure detail');
    });

    const response = await app.inject({ method: 'GET', url: '/explode' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('private failure detail');
    await app.close();
  });

  it('maps Fastify validation failures to the bad-request envelope', async () => {
    const app = buildApp({ logger: false });
    app.get(
      '/validated',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['value'],
            properties: { value: { type: 'string' } },
          },
        },
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({ method: 'GET', url: '/validated' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    await app.close();
  });
});

describe('CORS policy', () => {
  it('permits an explicitly configured browser origin without credentials', async () => {
    const app = buildApp({}, { corsAllowedOrigins: ['https://coach.example'] });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://coach.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://coach.example',
    );
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    await app.close();
  });

  it('does not grant browser access to an unlisted origin', async () => {
    const app = buildApp({}, { corsAllowedOrigins: ['https://coach.example'] });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://attacker.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});

import {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@fitness-os/schemas';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('enforces server-generated identifiers even when Fastify options request client IDs', async () => {
    const appWithUnsafeOption = buildApp({
      genReqId: () => 'caller-controlled',
      requestIdHeader: 'x-request-id',
    });

    const response = await appWithUnsafeOption.inject({
      method: 'GET',
      url: '/missing',
      headers: { 'x-request-id': 'client-controlled' },
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-request-id']).not.toBe('client-controlled');
    expect(response.headers['x-request-id']).not.toBe('caller-controlled');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    await appWithUnsafeOption.close();
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

  it('treats every non-literal-true runtime result as not ready', async () => {
    const invalidCheck = (() => 'yes') as unknown as () => boolean;
    const app = buildApp({}, { readinessCheck: invalidCheck });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
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

  it('does not mistake an unrelated validation-shaped exception for client input', async () => {
    const errorLog = vi.fn();
    const logger: FastifyBaseLogger = {
      level: 'error',
      child: () => logger,
      debug: vi.fn(),
      error: errorLog,
      fatal: vi.fn(),
      info: vi.fn(),
      silent: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
    };
    const app = buildApp({ loggerInstance: logger });
    app.get('/validation-shaped-explosion', async () => {
      throw Object.assign(new Error('private failure detail'), {
        code: 'FST_ERR_VALIDATION',
        statusCode: 400,
        validation: [],
        validationContext: 'body',
      });
    });

    const response = await app.inject({
      method: 'GET',
      url: '/validation-shaped-explosion',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('private failure detail');
    expect(errorLog).toHaveBeenCalled();
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

  it('preserves validation provenance when a route requests its own formatter', async () => {
    const app = buildApp({ logger: false });
    app.get(
      '/route-formatted-validation',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['value'],
            properties: { value: { type: 'string' } },
          },
        },
        schemaErrorFormatter: () => new Error('route validation detail'),
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/route-formatted-validation',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(response.body).not.toContain('route validation detail');
    await app.close();
  });

  it('maps malformed URLs to the bad-request envelope with correlation', async () => {
    const app = buildApp({ logger: false });

    const response = await app.inject({ method: 'GET', url: '/%' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('maps overlong route parameters to the no-store bad-request envelope', async () => {
    const app = buildApp({ logger: false });
    app.get('/bounded/:value', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: `/bounded/${'a'.repeat(101)}`,
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it.each([
    {
      name: 'malformed JSON',
      options: { logger: false },
      payload: '{"broken":',
    },
    {
      name: 'the configured body limit',
      options: { logger: false, bodyLimit: 4 },
      payload: '{"value":"too large"}',
    },
  ])('maps $name to the bad-request envelope', async ({ options, payload }) => {
    const app = buildApp(options);
    app.post('/body', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/body',
      headers: { 'content-type': 'application/json' },
      payload,
    });
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

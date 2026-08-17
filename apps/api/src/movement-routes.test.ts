import {
  apiErrorResponseSchema,
  movementDetailResponseSchema,
  movementDetailSchema,
  movementListResponseSchema,
} from '@fitness-os/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const squat = movementDetailSchema.parse({
  movementId: 'bodyweight-squat',
  contentVersion: 1,
  name: 'Bodyweight Squat',
  summary: 'A controlled squat using body weight and a stable stance.',
  setup: ['Stand with feet about hip-width apart.'],
  steps: ['Lower with control.', 'Return to standing.'],
  cues: ['Keep the movement slow and even.'],
  commonMistakes: ['Dropping quickly without control.'],
  safetyNotes: [
    'Stop if you feel pain, dizziness, or loss of control and seek qualified help as appropriate.',
  ],
});

describe('GET /movements', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns an empty published list through the frozen schema', async () => {
    const response = await app.inject({ method: 'GET', url: '/movements' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(movementListResponseSchema.parse(response.json())).toEqual({
      items: [],
    });
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
    expect(response.headers['x-request-id']).not.toBe('client-controlled');
  });
});

describe('GET /movements/:movementId', () => {
  it('returns a published detail from the injected catalog', async () => {
    const app = buildApp(
      {},
      {
        movementCatalog: {
          getMovementById(movementId) {
            return movementId === squat.movementId
              ? { status: 'found', value: squat }
              : { status: 'not_found' };
          },
          listMovements() {
            return [
              {
                contentVersion: squat.contentVersion,
                movementId: squat.movementId,
                name: squat.name,
                summary: squat.summary,
              },
            ];
          },
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: `/movements/${squat.movementId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(movementDetailResponseSchema.parse(response.json())).toEqual(squat);
    await app.close();
  });

  it('returns 400 for a malformed identifier', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/movements/AB',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    await app.close();
  });

  it('returns 404 for an unknown or withdrawn identifier', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/movements/bodyweight-squat',
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
      url: '/movements/bodyweight-squat',
      headers: { 'x-request-id': 'client-controlled' },
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.headers['x-request-id']).not.toBe('client-controlled');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    await app.close();
  });
});

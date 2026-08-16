import { healthResponseSchema } from '@fitness-os/schemas';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

describe('GET /health', () => {
  const app = buildApp();

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
});

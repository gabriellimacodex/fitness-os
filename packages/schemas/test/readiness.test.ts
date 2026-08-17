import { describe, expect, it } from 'vitest';

import { readinessResponseSchema } from '../src/index.js';

describe('readinessResponseSchema', () => {
  it('accepts the ready response variant', () => {
    expect(readinessResponseSchema.parse({ status: 'ready' })).toEqual({
      status: 'ready',
    });
  });

  it('accepts the not-ready response variant', () => {
    expect(readinessResponseSchema.parse({ status: 'not_ready' })).toEqual({
      status: 'not_ready',
    });
  });

  it('rejects internal readiness details', () => {
    expect(
      readinessResponseSchema.safeParse({
        status: 'not_ready',
        dependency: 'internal',
      }).success,
    ).toBe(false);
  });
});

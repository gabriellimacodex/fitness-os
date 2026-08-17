import { describe, expect, it } from 'vitest';

import { apiErrorCodeSchema, apiErrorResponseSchema } from '../src/index.js';

describe('apiErrorCodeSchema', () => {
  it('accepts the stable public error codes', () => {
    const codes = [
      'BAD_REQUEST',
      'NOT_FOUND',
      'INTERNAL_ERROR',
      'SERVICE_UNAVAILABLE',
    ] as const;

    expect(codes.map((code) => apiErrorCodeSchema.parse(code))).toEqual(codes);
  });
});

describe('apiErrorResponseSchema', () => {
  it('accepts the public error envelope', () => {
    const response = {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: 'request-123',
      },
    };

    expect(apiErrorResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects an empty public message', () => {
    expect(
      apiErrorResponseSchema.safeParse({
        error: {
          code: 'INTERNAL_ERROR',
          message: '',
          requestId: 'request-123',
        },
      }).success,
    ).toBe(false);
  });

  it('rejects an empty request identifier', () => {
    expect(
      apiErrorResponseSchema.safeParse({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid request',
          requestId: '',
        },
      }).success,
    ).toBe(false);
  });

  it('rejects internal fields outside the public envelope', () => {
    expect(
      apiErrorResponseSchema.safeParse({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error',
          requestId: 'request-123',
        },
        stack: 'internal stack',
      }).success,
    ).toBe(false);
  });

  it('rejects internal fields inside the public error object', () => {
    expect(
      apiErrorResponseSchema.safeParse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service unavailable',
          requestId: 'request-123',
          details: { dependency: 'internal' },
        },
      }).success,
    ).toBe(false);
  });
});

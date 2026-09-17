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

  it('fetches and validates a movement list with no-store', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ items: [] }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(client.movements()).resolves.toEqual({ items: [] });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.example.com/movements'),
      expect.objectContaining({
        cache: 'no-store',
        method: 'GET',
      }),
    );
  });

  it('fetches and validates a non-empty movement list', async () => {
    const summary = {
      movementId: 'bodyweight-squat',
      contentVersion: 1,
      name: 'Bodyweight Squat',
      summary: 'A controlled squat using body weight and a stable stance.',
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ items: [summary] }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(client.movements()).resolves.toEqual({ items: [summary] });
  });

  it('encodes a movement identifier as one URL segment', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
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
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await client.movement('bodyweight-squat');
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.example.com/movements/bodyweight-squat'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('does not echo raw content from a malformed movement payload', async () => {
    const rawContent = 'private-catalog-detail';
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ items: rawContent }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client.movements().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(String(error)).not.toContain(rawContent);
  });

  it('does not reuse a prior successful movement after a later 404', async () => {
    const detail = {
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
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(detail))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Resource not found',
              requestId: 'req-withdraw',
            },
          },
          { status: 404 },
        ),
      );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(client.movement('bodyweight-squat')).resolves.toMatchObject({
      movementId: 'bodyweight-squat',
    });
    await expect(client.movement('bodyweight-squat')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts a movement read after 3,000 ms and does not return a prior result', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const pending = client.movements();
    const expectation =
      expect(pending).rejects.toBeInstanceOf(ApiProtocolError);

    await vi.advanceTimersByTimeAsync(3_000);
    await expectation;
    vi.useRealTimers();
  });

  it('inspects an invitation with a validated claim secret and no-store', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        operation: {
          canonicalizationVersion: 'utf8-json-sha256.v1',
          digest: 'a'.repeat(64),
          namespace: 'inspect_invitation',
          operationId: '11111111-1111-4111-8111-111111111111',
          state: 'operation_committed',
        },
        result: {
          command: 'inspect_invitation',
          inspection: {
            proposedRole: 'student',
            purpose: 'student_onboarding',
            state: 'issued',
          },
          outcome: 'command_succeeded',
        },
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com/platform',
      fetch,
    });

    const response = await client.onboardingInspectInvitation('a'.repeat(24));

    expect(response.result).toMatchObject({
      command: 'inspect_invitation',
      outcome: 'command_succeeded',
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL(
        'https://api.example.com/platform/v1/onboarding/invitations/inspect',
      ),
      {
        body: JSON.stringify({ claimSecret: 'a'.repeat(24) }),
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
  });

  it('rejects an invalid claim secret before making a request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(
      client.onboardingInspectInvitation('too-short'),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws a typed API error when an invitation inspection is unauthenticated', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            requestId: 'req-inspect-1',
          },
        },
        { status: 401 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client
      .onboardingInspectInvitation('a'.repeat(24))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'UNAUTHENTICATED',
      requestId: 'req-inspect-1',
      status: 401,
    });
  });

  it('does not echo raw content from a malformed inspect-invitation payload', async () => {
    const rawContent = 'private-invitation-detail';
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ result: rawContent }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client
      .onboardingInspectInvitation('a'.repeat(24))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(String(error)).not.toContain(rawContent);
  });

  it('refreshes policy status with a validated retry token and no-store', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        operation: {
          canonicalizationVersion: 'utf8-json-sha256.v1',
          digest: 'a'.repeat(64),
          namespace: 'refresh_policy',
          operationId: '11111111-1111-4111-8111-111111111111',
          state: 'operation_committed',
        },
        result: {
          attempt: {
            attemptId: '22222222-2222-4222-8222-222222222222',
            invitationId: '33333333-3333-4333-8333-333333333333',
            lifecycle: 'ready_to_claim',
            ordinal: 1,
            policy: null,
            predecessorAttemptId: null,
            proposedRole: 'student',
            purpose: 'student_onboarding',
            terminalReason: null,
          },
          command: 'attempt',
          outcome: 'command_succeeded',
        },
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com/platform',
      fetch,
    });

    const response = await client.onboardingRefreshPolicy(
      '44444444-4444-4444-8444-444444444444',
      'b'.repeat(16),
    );

    expect(response.result).toMatchObject({
      outcome: 'command_succeeded',
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL(
        'https://api.example.com/platform/v1/onboarding/attempts/44444444-4444-4444-8444-444444444444/policy-refresh',
      ),
      {
        body: JSON.stringify({ retryToken: 'b'.repeat(16) }),
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
  });

  it('encodes the attempt identifier as one URL segment when refreshing policy status', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        operation: {
          canonicalizationVersion: 'utf8-json-sha256.v1',
          digest: 'a'.repeat(64),
          namespace: 'refresh_policy',
          operationId: '11111111-1111-4111-8111-111111111111',
          state: 'operation_committed',
        },
        result: {
          attempt: {
            attemptId: '22222222-2222-4222-8222-222222222222',
            invitationId: '33333333-3333-4333-8333-333333333333',
            lifecycle: 'ready_to_claim',
            ordinal: 1,
            policy: null,
            predecessorAttemptId: null,
            proposedRole: 'coach',
            purpose: 'coach_bootstrap',
            terminalReason: null,
          },
          command: 'attempt',
          outcome: 'command_succeeded',
        },
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await client.onboardingRefreshPolicy('attempt/with-slash', 'b'.repeat(16));

    expect(fetch).toHaveBeenCalledWith(
      new URL(
        'https://api.example.com/v1/onboarding/attempts/attempt%2Fwith-slash/policy-refresh',
      ),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects an invalid retry token before refreshing policy status', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    await expect(
      client.onboardingRefreshPolicy(
        '44444444-4444-4444-8444-444444444444',
        'too-short',
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws a typed API error when refreshing policy status is unauthenticated', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            requestId: 'req-refresh-policy-1',
          },
        },
        { status: 401 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client
      .onboardingRefreshPolicy(
        '44444444-4444-4444-8444-444444444444',
        'b'.repeat(16),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'UNAUTHENTICATED',
      requestId: 'req-refresh-policy-1',
      status: 401,
    });
  });

  it('does not echo raw content from a malformed policy-refresh payload', async () => {
    const rawContent = 'private-attempt-detail';
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ result: rawContent }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch,
    });

    const error = await client
      .onboardingRefreshPolicy(
        '44444444-4444-4444-8444-444444444444',
        'b'.repeat(16),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(String(error)).not.toContain(rawContent);
  });
});

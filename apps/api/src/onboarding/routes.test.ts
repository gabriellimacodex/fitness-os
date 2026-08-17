import {
  apiErrorResponseSchema,
  attemptDetailSchema,
  currentOnboardingResponseSchema,
  invitationClaimSecretSchema,
  onboardingAttemptIdSchema,
  onboardingOperationResponseSchema,
  retryTokenSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import {
  createOnboardingStore,
  createStoredAttempt,
  mappingIdFor,
  seedInvitation,
  seedIssuedInvitation,
} from './store.js';

const CLAIM_SECRET = invitationClaimSecretSchema.parse(
  'synthetic-claim-secret-01',
);
const OTHER_SECRET = invitationClaimSecretSchema.parse(
  'synthetic-claim-secret-02',
);
const RETRY_TOKEN = retryTokenSchema.parse('synthetic-retry-01');

function buildSyntheticApp(input?: {
  mappedRoles?: readonly ('student' | 'coach')[];
  principalKey?: string;
  store?: ReturnType<typeof createOnboardingStore>;
}) {
  const store = input?.store ?? createOnboardingStore();
  const principalKey = input?.principalKey ?? 'principal-a';
  const mappedRoles = input?.mappedRoles ?? [];
  const app = buildApp(
    { logger: false },
    {
      onboarding: {
        resolveContext: () => ({
          mappedRoles,
          principalKey,
          synthetic: true,
        }),
        store,
      },
    },
  );

  return { app, principalKey, store };
}

describe('onboarding routes without trusted context', () => {
  it('returns 401 for every protected route when no context is injected', async () => {
    const app = buildApp({ logger: false });

    const current = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/current',
    });
    const inspect = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/invitations/inspect',
      payload: { claimSecret: CLAIM_SECRET },
    });
    const create = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const detail = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/attempts/55555555-5555-4555-8555-555555555555',
    });

    for (const response of [current, inspect, create, detail]) {
      const body = apiErrorResponseSchema.parse(response.json());

      expect(response.statusCode).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.requestId).toBe(response.headers['x-request-id']);
      expect(response.body).not.toContain(CLAIM_SECRET);
    }

    await app.close();
  });

  it('does not expose a public synthetic login surface', async () => {
    const app = buildApp({ logger: false });

    for (const url of [
      '/v1/onboarding/login',
      '/v1/auth/synthetic',
      '/login/synthetic',
    ]) {
      const response = await app.inject({ method: 'POST', url });
      const body = apiErrorResponseSchema.parse(response.json());

      expect(response.statusCode).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    }

    await app.close();
  });
});

describe('GET /v1/onboarding/current', () => {
  it('returns stable mappings and principal-scoped attempts', async () => {
    const store = createOnboardingStore();
    const invitation = seedIssuedInvitation(store, {
      claimSecret: CLAIM_SECRET,
    });
    const own = createStoredAttempt(invitation, 1, 'principal-a');
    const foreignInvitation = seedIssuedInvitation(store, {
      claimSecret: OTHER_SECRET,
    });
    const foreign = createStoredAttempt(foreignInvitation, 1, 'principal-b');
    store.attempts.set(own.detail.attemptId, own);
    store.attempts.set(foreign.detail.attemptId, foreign);

    const { app, principalKey } = buildSyntheticApp({
      mappedRoles: ['student'],
      store,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/current',
    });
    const second = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/current',
    });
    const body = currentOnboardingResponseSchema.parse(first.json());

    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(body.mappings).toEqual([
      {
        mappingId: mappingIdFor(principalKey, 'student'),
        role: 'student',
      },
    ]);
    expect(body.attempts).toEqual([
      {
        attemptId: own.detail.attemptId,
        lifecycle: 'policy_pending',
        ordinal: 1,
        proposedRole: 'student',
        purpose: 'student_onboarding',
      },
    ]);
    expect(body.nextCursor).toBeNull();
    expect(second.json()).toEqual(first.json());
    expect(JSON.stringify(body)).not.toContain(foreign.detail.attemptId);

    await app.close();
  });

  it('rejects unknown query keys', async () => {
    const { app } = buildSyntheticApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/current?role=student',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    await app.close();
  });
});

describe('POST /v1/onboarding/invitations/inspect', () => {
  it('returns issued inspection without echoing the claim secret', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, {
      claimSecret: CLAIM_SECRET,
      proposedRole: 'student',
      purpose: 'student_onboarding',
    });
    const { app } = buildSyntheticApp({ store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/invitations/inspect',
      payload: { claimSecret: CLAIM_SECRET },
    });
    const body = onboardingOperationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.operation.namespace).toBe('inspect_invitation');
    expect(body.operation.state).toBe('operation_committed');
    expect(body.result).toEqual({
      command: 'inspect_invitation',
      inspection: {
        proposedRole: 'student',
        purpose: 'student_onboarding',
        state: 'issued',
      },
      outcome: 'command_succeeded',
    });
    expect(response.body).not.toContain(CLAIM_SECRET);
    expect(JSON.stringify(body.operation)).not.toContain(CLAIM_SECRET);

    await app.close();
  });

  it('collapses missing and non-issued invitations to the same safe outcome', async () => {
    const store = createOnboardingStore();
    seedInvitation(store, {
      claimSecret: CLAIM_SECRET,
      state: 'revoked',
    });
    const { app } = buildSyntheticApp({ store });

    const missing = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/invitations/inspect',
      payload: { claimSecret: OTHER_SECRET },
    });
    const revoked = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/invitations/inspect',
      payload: { claimSecret: CLAIM_SECRET },
    });

    expect(missing.statusCode).toBe(200);
    expect(revoked.statusCode).toBe(200);
    expect(
      onboardingOperationResponseSchema.parse(missing.json()).result,
    ).toEqual({ outcome: 'invalid_or_unavailable' });
    expect(
      onboardingOperationResponseSchema.parse(revoked.json()).result,
    ).toEqual({ outcome: 'invalid_or_unavailable' });
    expect(missing.body).not.toContain(OTHER_SECRET);
    expect(revoked.body).not.toContain(CLAIM_SECRET);
    expect(revoked.body).not.toContain('revoked');

    await app.close();
  });
});

describe('POST /v1/onboarding/attempts', () => {
  it('creates a principal-scoped attempt from an issued invitation', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    const { app } = buildSyntheticApp({ store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const body = onboardingOperationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(body.result?.outcome).toBe('command_succeeded');
    expect(body.result).toMatchObject({
      command: 'attempt',
      outcome: 'command_succeeded',
    });
    expect(response.body).not.toContain(CLAIM_SECRET);

    if (body.result?.outcome !== 'command_succeeded') {
      throw new Error('expected command_succeeded');
    }

    if (!('attempt' in body.result)) {
      throw new Error('expected attempt result');
    }

    const attempt = attemptDetailSchema.parse(body.result.attempt);
    expect(attempt.lifecycle).toBe('policy_pending');
    expect(attempt.ordinal).toBe(1);
    expect(store.attempts.get(attempt.attemptId)?.principalKey).toBe(
      'principal-a',
    );

    await app.close();
  });

  it('replays the same nonterminal attempt for the same invitation scope', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    const { app } = buildSyntheticApp({ store });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: {
        claimSecret: CLAIM_SECRET,
        retryToken: retryTokenSchema.parse('synthetic-retry-02'),
      },
    });
    const firstBody = onboardingOperationResponseSchema.parse(first.json());
    const secondBody = onboardingOperationResponseSchema.parse(second.json());

    expect(firstBody.result).toMatchObject({ outcome: 'command_succeeded' });
    expect(secondBody.result).toMatchObject({ outcome: 'command_succeeded' });

    if (
      firstBody.result &&
      'attempt' in firstBody.result &&
      secondBody.result &&
      'attempt' in secondBody.result
    ) {
      expect(secondBody.result.attempt.attemptId).toBe(
        firstBody.result.attempt.attemptId,
      );
    }

    expect(store.attempts.size).toBe(1);
    await app.close();
  });

  it('returns 403 when a second role would be acquired', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, {
      claimSecret: CLAIM_SECRET,
      proposedRole: 'coach',
      purpose: 'coach_bootstrap',
    });
    const { app } = buildSyntheticApp({
      mappedRoles: ['student'],
      store,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(store.attempts.size).toBe(0);
    expect(response.body).not.toContain(CLAIM_SECRET);
    expect(response.body).not.toContain('second_role');

    await app.close();
  });

  it('collapses an unavailable invitation instead of revealing it', async () => {
    const store = createOnboardingStore();
    seedInvitation(store, {
      claimSecret: CLAIM_SECRET,
      state: 'expired',
    });
    const { app } = buildSyntheticApp({ store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const body = onboardingOperationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(body.result).toEqual({ outcome: 'invalid_or_unavailable' });
    expect(store.attempts.size).toBe(0);
    expect(response.body).not.toContain(CLAIM_SECRET);
    expect(response.body).not.toContain('expired');

    await app.close();
  });

  it('enforces the active attempt cap per principal and role', async () => {
    const store = createOnboardingStore();
    const secrets = [
      'synthetic-claim-secret-a1',
      'synthetic-claim-secret-a2',
      'synthetic-claim-secret-a3',
      'synthetic-claim-secret-a4',
      'synthetic-claim-secret-a5',
    ].map((value) => invitationClaimSecretSchema.parse(value));

    for (const [index, secret] of secrets.entries()) {
      const invitation = seedIssuedInvitation(store, { claimSecret: secret });
      if (index < 4) {
        const record = createStoredAttempt(
          invitation,
          index + 1,
          'principal-a',
        );
        store.attempts.set(record.detail.attemptId, record);
      }
    }

    const { app } = buildSyntheticApp({ store });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: secrets[4], retryToken: RETRY_TOKEN },
    });
    const body = onboardingOperationResponseSchema.parse(response.json());

    expect(body.result).toMatchObject({
      outcome: 'active_attempt_limit_reached',
    });
    expect(store.attempts.size).toBe(4);

    await app.close();
  });
});

describe('GET /v1/onboarding/attempts/:attemptId', () => {
  it('returns the caller attempt and hides another principal', async () => {
    const store = createOnboardingStore();
    const invitation = seedIssuedInvitation(store, {
      claimSecret: CLAIM_SECRET,
    });
    const own = createStoredAttempt(invitation, 1, 'principal-a');
    const foreignInvitation = seedIssuedInvitation(store, {
      claimSecret: OTHER_SECRET,
    });
    const foreign = createStoredAttempt(foreignInvitation, 1, 'principal-b');
    store.attempts.set(own.detail.attemptId, own);
    store.attempts.set(foreign.detail.attemptId, foreign);

    const { app } = buildSyntheticApp({ store });

    const found = await app.inject({
      method: 'GET',
      url: `/v1/onboarding/attempts/${own.detail.attemptId}`,
    });
    const hidden = await app.inject({
      method: 'GET',
      url: `/v1/onboarding/attempts/${foreign.detail.attemptId}`,
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/attempts/55555555-5555-4555-8555-555555555555',
    });

    expect(found.statusCode).toBe(200);
    expect(attemptDetailSchema.parse(found.json())).toEqual(own.detail);
    expect(hidden.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(apiErrorResponseSchema.parse(hidden.json()).error.code).toBe(
      'NOT_FOUND',
    );
    expect(hidden.body).not.toContain(foreign.detail.invitationId);

    await app.close();
  });

  it('rejects a malformed attempt identifier', async () => {
    const { app } = buildSyntheticApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/attempts/not-a-uuid',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(onboardingAttemptIdSchema.safeParse('not-a-uuid').success).toBe(
      false,
    );
    await app.close();
  });
});

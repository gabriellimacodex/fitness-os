import {
  apiErrorResponseSchema,
  attemptDetailSchema,
  currentOnboardingResponseSchema,
  invitationClaimSecretSchema,
  onboardingAttemptIdSchema,
  onboardingOperationResponseSchema,
  retryTokenSchema,
  studentInvitationListResponseSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import {
  createOnboardingStore,
  createStoredAttempt,
  mappingIdFor,
} from './store.js';
import { seedInvitation, seedIssuedInvitation } from './test-store.js';

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
      allowSyntheticOnboarding: true,
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

function secretAt(index: number) {
  return invitationClaimSecretSchema.parse(
    `synthetic-claim-secret-${String(index).padStart(2, '0')}`,
  );
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
    const resume = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts/55555555-5555-4555-8555-555555555555/resume',
      payload: { retryToken: RETRY_TOKEN },
    });
    const abandon = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts/55555555-5555-4555-8555-555555555555/abandon',
      payload: { retryToken: RETRY_TOKEN },
    });
    const listInvitations = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/student-invitations',
    });
    const issueInvitation = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: { retryToken: RETRY_TOKEN },
    });
    const revokeInvitation = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations/66666666-6666-4666-8666-666666666666/revoke',
      payload: { retryToken: RETRY_TOKEN },
    });

    for (const response of [
      current,
      inspect,
      create,
      detail,
      resume,
      abandon,
      listInvitations,
      issueInvitation,
      revokeInvitation,
    ]) {
      const body = apiErrorResponseSchema.parse(response.json());

      expect(response.statusCode).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.requestId).toBe(response.headers['x-request-id']);
      expect(response.body).not.toContain(CLAIM_SECRET);
    }

    await app.close();
  });

  it('exposes synthetic readiness only behind the explicit onboarding seam', async () => {
    const denied = buildApp({ logger: false });
    const missing = await denied.inject({
      method: 'GET',
      url: '/v1/onboarding/synthetic/readiness',
    });
    expect(missing.statusCode).toBe(404);
    await denied.close();

    const { app } = buildSyntheticApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/synthetic/readiness',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      mechanismReady: true,
      productionReady: false,
      diagnosticCodes: ['legal_privacy_decision_required'],
    });
    await app.close();
  });

  it('denies when IdentitySessionPort rejects the binder context', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          identitySession: {
            resolve: async () => ({
              reason: 'synthetic_in_production' as const,
              status: 'denied' as const,
            }),
          },
          resolveContext: () => ({
            mappedRoles: [],
            principalKey: 'principal-a',
            synthetic: true,
          }),
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/current',
    });
    expect(response.statusCode).toBe(401);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'UNAUTHENTICATED',
    );
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

  it('rejects production composition of the synthetic onboarding seam', () => {
    expect(() =>
      buildApp(
        { logger: false },
        {
          onboarding: {
            resolveContext: () => ({
              mappedRoles: [],
              principalKey: 'principal-a',
              synthetic: true,
            }),
          },
        },
      ),
    ).toThrow(
      'Synthetic onboarding composition requires an explicit test seam',
    );
  });
});

describe('GET /v1/onboarding/current', () => {
  it('returns stable mappings and principal-scoped nonterminal attempts', async () => {
    const store = createOnboardingStore();
    const invitation = seedIssuedInvitation(store, {
      claimSecret: CLAIM_SECRET,
    });
    const own = createStoredAttempt(
      invitation,
      1,
      'principal-a',
      '2026-08-17T00:00:01.000Z',
    );
    const foreignInvitation = seedIssuedInvitation(store, {
      claimSecret: OTHER_SECRET,
    });
    const foreign = createStoredAttempt(
      foreignInvitation,
      1,
      'principal-b',
      '2026-08-17T00:00:02.000Z',
    );
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

  it('pages nonterminal attempts and does not drop later roles', async () => {
    const store = createOnboardingStore();
    const records = [];

    for (let index = 0; index < 6; index += 1) {
      const invitation = seedIssuedInvitation(store, {
        claimSecret: secretAt(index + 1),
        proposedRole: index < 4 ? 'student' : 'coach',
        purpose: index < 4 ? 'student_onboarding' : 'coach_bootstrap',
      });
      const record = createStoredAttempt(
        invitation,
        (index % 4) + 1,
        'principal-a',
        `2026-08-17T00:00:0${index}.000Z`,
      );
      store.attempts.set(record.detail.attemptId, record);
      records.push(record);
    }

    const { app } = buildSyntheticApp({ store });
    const first = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/current',
    });
    const firstBody = currentOnboardingResponseSchema.parse(first.json());

    expect(first.statusCode).toBe(200);
    expect(firstBody.attempts.map((attempt) => attempt.attemptId)).toEqual(
      records.slice(0, 4).map((record) => record.detail.attemptId),
    );
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: 'GET',
      url: `/v1/onboarding/current?cursor=${firstBody.nextCursor}`,
    });
    const secondBody = currentOnboardingResponseSchema.parse(second.json());

    expect(secondBody.attempts.map((attempt) => attempt.attemptId)).toEqual(
      records.slice(4).map((record) => record.detail.attemptId),
    );
    expect(secondBody.attempts.map((attempt) => attempt.proposedRole)).toEqual([
      'coach',
      'coach',
    ]);
    expect(secondBody.nextCursor).toBeNull();

    const tampered = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/current?cursor=aaaaaaaa',
    });
    expect(tampered.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(tampered.json()).error.code).toBe(
      'BAD_REQUEST',
    );

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
    expect(response.headers['cache-control']).toBe('no-store');
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

  it('collapses missing, claimed, and revoked invitations to the same safe outcome', async () => {
    const store = createOnboardingStore();
    seedInvitation(store, {
      claimSecret: CLAIM_SECRET,
      state: 'revoked',
    });
    seedInvitation(store, {
      claimSecret: invitationClaimSecretSchema.parse(
        'synthetic-claim-secret-03',
      ),
      state: 'claimed',
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
    const claimed = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/invitations/inspect',
      payload: {
        claimSecret: invitationClaimSecretSchema.parse(
          'synthetic-claim-secret-03',
        ),
      },
    });

    for (const response of [missing, revoked, claimed]) {
      expect(response.statusCode).toBe(200);
      expect(
        onboardingOperationResponseSchema.parse(response.json()).result,
      ).toEqual({ outcome: 'invalid_or_unavailable' });
    }

    expect(missing.body).not.toContain(OTHER_SECRET);
    expect(revoked.body).not.toContain(CLAIM_SECRET);
    expect(revoked.body).not.toContain('revoked');
    expect(claimed.body).not.toContain('claimed');

    await app.close();
  });

  it('rejects extra inspect fields', async () => {
    const { app } = buildSyntheticApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/invitations/inspect',
      payload: { claimSecret: CLAIM_SECRET, role: 'student' },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );
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
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.operation.state).toBe('operation_committed');
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

  it('replays the same retry token and rejects a changed invitation', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    seedIssuedInvitation(store, { claimSecret: OTHER_SECRET });
    const { app } = buildSyntheticApp({ store });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const mismatch = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: OTHER_SECRET, retryToken: RETRY_TOKEN },
    });
    const firstBody = onboardingOperationResponseSchema.parse(first.json());
    const replayBody = onboardingOperationResponseSchema.parse(replay.json());
    const mismatchBody = onboardingOperationResponseSchema.parse(
      mismatch.json(),
    );

    expect(firstBody.operation.state).toBe('operation_committed');
    expect(replayBody.operation.state).toBe('operation_replayed');
    expect(replayBody.operation.operationId).toBe(
      firstBody.operation.operationId,
    );
    expect(replayBody.operation.digest).toBe(firstBody.operation.digest);
    expect(replayBody.result).toEqual(firstBody.result);
    expect(mismatchBody.operation.state).toBe('operation_input_mismatch');
    expect(mismatchBody.operation.operationId).toBe(
      firstBody.operation.operationId,
    );
    expect(mismatchBody.result).toBeNull();
    expect(store.attempts.size).toBe(1);

    await app.close();
  });

  it('returns mapping_conflict when the same role is already mapped', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    const { app } = buildSyntheticApp({
      mappedRoles: ['student'],
      store,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const body = onboardingOperationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(body.result).toEqual({ outcome: 'mapping_conflict' });
    expect(store.attempts.size).toBe(0);
    expect(response.body).not.toContain(CLAIM_SECRET);

    await app.close();
  });

  it('collapses second-role and self-coach denials to unavailable', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, {
      claimSecret: CLAIM_SECRET,
      proposedRole: 'coach',
      purpose: 'coach_bootstrap',
    });
    seedIssuedInvitation(store, {
      claimSecret: OTHER_SECRET,
      purpose: 'student_onboarding',
      targetCoachPrincipalKey: 'principal-a',
    });
    const secondRoleApp = buildSyntheticApp({
      mappedRoles: ['student'],
      store,
    });
    const selfCoachApp = buildSyntheticApp({
      principalKey: 'principal-a',
      store,
    });

    const secondRole = await secondRoleApp.app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const selfCoach = await selfCoachApp.app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: {
        claimSecret: OTHER_SECRET,
        retryToken: retryTokenSchema.parse('synthetic-retry-02'),
      },
    });

    expect(
      onboardingOperationResponseSchema.parse(secondRole.json()).result,
    ).toEqual({ outcome: 'invalid_or_unavailable' });
    expect(
      onboardingOperationResponseSchema.parse(selfCoach.json()).result,
    ).toEqual({ outcome: 'invalid_or_unavailable' });
    expect(store.attempts.size).toBe(0);
    expect(secondRole.body).not.toContain('second_role');
    expect(selfCoach.body).not.toContain('self_coach');

    await secondRoleApp.app.close();
    await selfCoachApp.app.close();
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
    const secrets = [1, 2, 3, 4, 5].map((index) => secretAt(index));

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

  it('rejects extra create-attempt fields', async () => {
    const { app } = buildSyntheticApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: {
        claimSecret: CLAIM_SECRET,
        retryToken: RETRY_TOKEN,
        role: 'student',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );
    await app.close();
  });

  it('sets no-store on unexpected onboarding failures', async () => {
    const { app } = buildSyntheticApp();
    app.addHook('preHandler', async (request) => {
      if ((request.url.split('?')[0] ?? '') === '/v1/onboarding/attempts') {
        throw new Error('private onboarding failure');
      }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('private onboarding failure');
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
    expect(found.headers['cache-control']).toBe('no-store');
    expect(attemptDetailSchema.parse(found.json())).toEqual(own.detail);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.headers['cache-control']).toBe('no-store');
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
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(onboardingAttemptIdSchema.safeParse('not-a-uuid').success).toBe(
      false,
    );
    await app.close();
  });
});

describe('student invitation list/issue/revoke', () => {
  it('issues, lists, and revokes coach-owned student invitations without leaking foreign ones', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, {
      claimSecret: OTHER_SECRET,
      purpose: 'student_onboarding',
      targetCoachPrincipalKey: 'other-coach',
    });
    const { app } = buildSyntheticApp({
      mappedRoles: ['coach'],
      store,
    });

    const forbiddenStudent = buildSyntheticApp({
      mappedRoles: ['student'],
      principalKey: 'student-principal',
      store,
    });
    const denied = await forbiddenStudent.app.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-issue-denied'),
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(apiErrorResponseSchema.parse(denied.json()).error.code).toBe(
      'FORBIDDEN',
    );
    await forbiddenStudent.app.close();

    const issued = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-issue'),
      },
    });
    const issuedBody = onboardingOperationResponseSchema.parse(issued.json());
    expect(issuedBody.result).toMatchObject({
      outcome: 'command_succeeded',
      command: 'issue_student_invitation',
      issued: { purpose: 'student_onboarding', state: 'issued' },
    });
    if (
      !issuedBody.result ||
      issuedBody.result.outcome !== 'command_succeeded' ||
      !('issued' in issuedBody.result)
    ) {
      throw new Error('expected issued invitation');
    }
    const invitationId = issuedBody.result.issued.invitationId;
    const claimSecret = issuedBody.result.issued.claimSecret;

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-issue'),
      },
    });
    expect(replay.json()).toMatchObject({
      operation: { state: 'operation_replayed' },
      result: {
        issued: { invitationId, claimSecret },
      },
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/student-invitations',
    });
    const listBody = studentInvitationListResponseSchema.parse(listed.json());
    expect(listBody.items).toEqual([
      {
        invitationId,
        purpose: 'student_onboarding',
        state: 'issued',
      },
    ]);
    expect(listed.body).not.toContain(claimSecret);
    expect(listed.body).not.toContain(OTHER_SECRET);

    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/student-invitations/${invitationId}/revoke`,
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-revoke'),
      },
    });
    expect(revoked.json()).toMatchObject({
      result: {
        outcome: 'command_succeeded',
        command: 'revoke_student_invitation',
        invitation: {
          invitationId,
          purpose: 'student_onboarding',
          state: 'revoked',
        },
      },
    });
    expect(revoked.body).not.toContain(claimSecret);

    const foreignRevoke = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations/66666666-6666-4666-8666-666666666666/revoke',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-revoke-foreign'),
      },
    });
    expect(foreignRevoke.statusCode).toBe(404);

    await app.close();
  });
});

describe('resume and abandon', () => {
  it('resumes a nonterminal attempt as current_state and abandons to terminal', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    const { app } = buildSyntheticApp({ store });

    const created = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const createdBody = onboardingOperationResponseSchema.parse(created.json());
    if (
      !createdBody.result ||
      createdBody.result.outcome !== 'command_succeeded' ||
      !('attempt' in createdBody.result)
    ) {
      throw new Error('expected attempt');
    }
    const attemptId = createdBody.result.attempt.attemptId;
    const lifecycle = createdBody.result.attempt.lifecycle;

    const resumed = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/resume`,
      payload: { retryToken: retryTokenSchema.parse('synthetic-retry-resume') },
    });
    const resumedBody = onboardingOperationResponseSchema.parse(resumed.json());
    expect(resumedBody.result).toMatchObject({
      outcome: 'current_state',
      attempt: { attemptId, lifecycle },
    });

    const replay = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/resume`,
      payload: { retryToken: retryTokenSchema.parse('synthetic-retry-resume') },
    });
    expect(replay.json()).toMatchObject({
      operation: { state: 'operation_replayed' },
      result: { outcome: 'current_state' },
    });

    const abandoned = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/abandon`,
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-abandon'),
      },
    });
    const abandonedBody = onboardingOperationResponseSchema.parse(
      abandoned.json(),
    );
    expect(abandonedBody.result).toMatchObject({
      outcome: 'command_succeeded',
      attempt: {
        attemptId,
        lifecycle: 'terminal',
        terminalReason: 'abandoned',
      },
    });

    const secondAbandon = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/abandon`,
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-abandon-2'),
      },
    });
    expect(secondAbandon.json()).toMatchObject({
      result: {
        outcome: 'already_terminal',
        attempt: { lifecycle: 'terminal', terminalReason: 'abandoned' },
      },
    });

    await app.close();
  });
});

describe('policy-refresh and claim', () => {
  it('refreshes synthetic policy then completes a claim', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    const { app } = buildSyntheticApp({ store });

    const created = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const createdBody = onboardingOperationResponseSchema.parse(created.json());
    expect(createdBody.result).toMatchObject({ outcome: 'command_succeeded' });
    if (
      !createdBody.result ||
      createdBody.result.outcome !== 'command_succeeded' ||
      !('attempt' in createdBody.result)
    ) {
      throw new Error('expected attempt');
    }
    const attemptId = createdBody.result.attempt.attemptId;

    const refreshed = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/policy-refresh`,
      payload: { retryToken: retryTokenSchema.parse('synthetic-retry-policy') },
    });
    const refreshedBody = onboardingOperationResponseSchema.parse(
      refreshed.json(),
    );
    expect(refreshedBody.result).toMatchObject({
      outcome: 'command_succeeded',
      attempt: { lifecycle: 'ready_to_claim' },
    });

    const claimed = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/claim`,
      payload: {
        claimSecret: CLAIM_SECRET,
        retryToken: retryTokenSchema.parse('synthetic-retry-claim'),
      },
    });
    const claimedBody = onboardingOperationResponseSchema.parse(claimed.json());
    expect(claimedBody.result).toMatchObject({
      outcome: 'completed',
      role: 'student',
    });
    expect(claimed.body).not.toContain(CLAIM_SECRET);

    await app.close();
  });

  it('denies claim when OnboardingClaimRepository rejects the commit', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          claimRepository: {
            commit: async () => ({
              reason: 'mapping_conflict' as const,
              status: 'denied' as const,
            }),
          },
          resolveContext: () => ({
            mappedRoles: [],
            principalKey: 'principal-a',
            synthetic: true,
          }),
          store,
        },
      },
    );

    const created = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const createdBody = onboardingOperationResponseSchema.parse(created.json());
    if (
      !createdBody.result ||
      createdBody.result.outcome !== 'command_succeeded' ||
      !('attempt' in createdBody.result)
    ) {
      throw new Error('expected attempt');
    }
    const attemptId = createdBody.result.attempt.attemptId;

    await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/policy-refresh`,
      payload: { retryToken: retryTokenSchema.parse('synthetic-retry-policy') },
    });

    const claimed = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/claim`,
      payload: {
        claimSecret: CLAIM_SECRET,
        retryToken: retryTokenSchema.parse('synthetic-retry-claim-deny'),
      },
    });
    const claimedBody = onboardingOperationResponseSchema.parse(claimed.json());
    expect(claimedBody.result).toMatchObject({
      outcome: 'invalid_or_unavailable',
    });
    expect(store.mappings.get('principal-a') ?? []).toEqual([]);

    await app.close();
  });

  it('records claim transitions through OnboardingTransitionSink', async () => {
    const store = createOnboardingStore();
    seedIssuedInvitation(store, { claimSecret: CLAIM_SECRET });
    const appended: Array<{
      aggregate: string;
      nextState: string;
      previousState: string;
    }> = [];
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          resolveContext: () => ({
            mappedRoles: [],
            principalKey: 'principal-a',
            synthetic: true,
          }),
          store,
          transitionSink: {
            append: async (record) => {
              appended.push({
                aggregate: record.aggregate,
                nextState: record.nextState,
                previousState: record.previousState,
              });
              return 'accepted';
            },
          },
        },
      },
    );

    const created = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: { claimSecret: CLAIM_SECRET, retryToken: RETRY_TOKEN },
    });
    const createdBody = onboardingOperationResponseSchema.parse(created.json());
    if (
      !createdBody.result ||
      createdBody.result.outcome !== 'command_succeeded' ||
      !('attempt' in createdBody.result)
    ) {
      throw new Error('expected attempt');
    }
    const attemptId = createdBody.result.attempt.attemptId;

    await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/policy-refresh`,
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-policy-sink'),
      },
    });

    const claimed = await app.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/claim`,
      payload: {
        claimSecret: CLAIM_SECRET,
        retryToken: retryTokenSchema.parse('synthetic-retry-claim-sink'),
      },
    });
    expect(
      onboardingOperationResponseSchema.parse(claimed.json()).result,
    ).toMatchObject({ outcome: 'completed', role: 'student' });
    expect(appended).toEqual(
      expect.arrayContaining([
        {
          aggregate: 'invitation',
          nextState: 'claimed',
          previousState: 'issued',
        },
        {
          aggregate: 'attempt',
          nextState: 'completed',
          previousState: 'ready_to_claim',
        },
        {
          aggregate: 'role_mapping',
          nextState: 'student',
          previousState: 'unmapped',
        },
      ]),
    );

    await app.close();
  });
});

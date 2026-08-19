import { SyntheticPrincipalRoleMappingRepository } from '@fitness-os/domain';
import { retryTokenSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import type { OnboardingPgPersistence } from './pg-persistence.js';
import { createOnboardingStore, mappingIdFor } from './store.js';

function createRecordingPersistence(): OnboardingPgPersistence & {
  invitationPuts: unknown[];
  mappingPuts: unknown[];
  operationPuts: unknown[];
} {
  const invitationPuts: unknown[] = [];
  const mappingPuts: unknown[] = [];
  const operationPuts: unknown[] = [];

  return {
    invitationPuts,
    mappingPuts,
    operationPuts,
    nowUtcMs: () => '2026-08-19T15:00:00.000Z',
    invitations: {
      get: async () => null,
      getByClaimDigest: async () => null,
      listByTargetCoach: async () => [],
      put: async (record) => {
        invitationPuts.push(record);
        return 'accepted' as const;
      },
      applyClaim: async () => ({ status: 'conflict' as const }),
      applyRevoke: async () => ({ status: 'conflict' as const }),
    },
    attempts: {
      get: async () => null,
      listByPrincipal: async () => [],
      put: async () => 'accepted' as const,
      applyTransition: async () => ({ status: 'conflict' as const }),
    },
    mappings: {
      get: async () => null,
      listByPrincipal: async () => [],
      put: async (record) => {
        mappingPuts.push(record);
        return { mapping: record, status: 'accepted' as const };
      },
    },
    operations: {
      getByBindingKey: async () => null,
      getByOperationId: async () => null,
      put: async (record) => {
        operationPuts.push(record);
        return { operation: record, status: 'accepted' as const };
      },
    },
  };
}

describe('onboarding PG write-through seam', () => {
  it('persists invitation and operation through the synthetic API path', async () => {
    const store = createOnboardingStore();
    const persistence = createRecordingPersistence();

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          persistence: persistence as OnboardingPgPersistence,
          resolveContext: () => ({
            mappedRoles: ['coach'],
            principalKey: 'coach-wire-1',
            synthetic: true,
          }),
          store,
        },
      },
    );

    const issued = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-wire-issue'),
      },
    });

    expect(issued.statusCode).toBe(200);
    expect(persistence.invitationPuts).toHaveLength(1);
    expect(persistence.invitationPuts[0]).toMatchObject({
      purpose: 'student_onboarding',
      state: 'issued',
      targetCoachPrincipalKey: 'coach-wire-1',
      updatedAt: '2026-08-19T15:00:00.000Z',
    });
    expect(persistence.operationPuts).toHaveLength(1);
    expect(persistence.operationPuts[0]).toMatchObject({
      namespace: 'issue_student_invitation',
      principalKey: 'coach-wire-1',
    });

    await app.close();
  });

  it('persists role mapping on claim completion write-through', async () => {
    const store = createOnboardingStore();
    const persistence = createRecordingPersistence();
    const principalKey = 'student-wire-1';
    const role = 'student' as const;

    // Seed an issued invitation + ready attempt via coach issue + student flow
    // through the same recording persistence.
    const coachApp = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          persistence: persistence as OnboardingPgPersistence,
          resolveContext: () => ({
            mappedRoles: ['coach'],
            principalKey: 'coach-wire-claim',
            synthetic: true,
          }),
          store,
        },
      },
    );

    const issued = await coachApp.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-wire-claim-issue'),
      },
    });
    expect(issued.statusCode).toBe(200);
    const issuedBody = issued.json() as {
      result: { issued: { claimSecret: string } };
    };
    const claimSecret = issuedBody.result.issued.claimSecret;
    await coachApp.close();

    const studentApp = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          persistence: persistence as OnboardingPgPersistence,
          resolveContext: () => ({
            mappedRoles: [],
            principalKey,
            synthetic: true,
          }),
          store,
        },
      },
    );

    const created = await studentApp.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: {
        claimSecret,
        retryToken: retryTokenSchema.parse('synthetic-retry-wire-create'),
      },
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as {
      result: { attempt: { attemptId: string } };
    };
    const attemptId = createdBody.result.attempt.attemptId;

    const refreshed = await studentApp.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/policy-refresh`,
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-wire-policy'),
      },
    });
    expect(refreshed.statusCode).toBe(200);

    persistence.mappingPuts.length = 0;

    const claimed = await studentApp.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/claim`,
      payload: {
        claimSecret,
        retryToken: retryTokenSchema.parse('synthetic-retry-wire-claim'),
      },
    });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json()).toMatchObject({
      result: {
        outcome: 'completed',
        role,
        mappingId: mappingIdFor(principalKey, role),
      },
    });
    expect(persistence.mappingPuts).toHaveLength(1);
    expect(persistence.mappingPuts[0]).toMatchObject({
      createdAt: '2026-08-19T15:00:00.000Z',
      mappingId: mappingIdFor(principalKey, role),
      principalKey,
      role,
    });

    await studentApp.close();
  });

  it('hydrates durable mappings before create-attempt conflict checks', async () => {
    const store = createOnboardingStore();
    const principalKey = 'student-hydrate-1';
    const role = 'student' as const;
    const mappingId = mappingIdFor(principalKey, role);

    const persistence = createRecordingPersistence();
    persistence.mappings.listByPrincipal = async () => [
      {
        createdAt: '2026-08-19T14:00:00.000Z',
        mappingId,
        principalKey,
        role,
      },
    ];

    // Seed a fresh invitation into the empty in-memory store via coach issue.
    const coachApp = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          persistence: persistence as OnboardingPgPersistence,
          resolveContext: () => ({
            mappedRoles: ['coach'],
            principalKey: 'coach-hydrate-1',
            synthetic: true,
          }),
          store,
        },
      },
    );
    const issued = await coachApp.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-hydrate-issue'),
      },
    });
    expect(issued.statusCode).toBe(200);
    const claimSecret = (
      issued.json() as { result: { issued: { claimSecret: string } } }
    ).result.issued.claimSecret;
    await coachApp.close();

    // New empty store (restart simulation) with same persistence + invitation.
    const coldStore = createOnboardingStore();
    coldStore.pepper = store.pepper;
    for (const [id, invitation] of store.invitations) {
      coldStore.invitations.set(id, invitation);
    }

    const studentApp = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          persistence: persistence as OnboardingPgPersistence,
          resolveContext: () => ({
            mappedRoles: [],
            principalKey,
            synthetic: true,
          }),
          store: coldStore,
        },
      },
    );

    const created = await studentApp.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: {
        claimSecret,
        retryToken: retryTokenSchema.parse('synthetic-retry-hydrate-create'),
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      result: { outcome: 'mapping_conflict' },
    });

    await studentApp.close();
  });

  it('persists claim mapping through SyntheticPrincipalRoleMappingRepository', async () => {
    const store = createOnboardingStore();
    const mappings = new SyntheticPrincipalRoleMappingRepository();
    const persistence = createRecordingPersistence();
    persistence.mappings = mappings;

    const coachApp = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          persistence: persistence as OnboardingPgPersistence,
          resolveContext: () => ({
            mappedRoles: ['coach'],
            principalKey: 'coach-synthetic-map',
            synthetic: true,
          }),
          store,
        },
      },
    );
    const issued = await coachApp.inject({
      method: 'POST',
      url: '/v1/onboarding/student-invitations',
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-domain-map-issue'),
      },
    });
    expect(issued.statusCode).toBe(200);
    const claimSecret = (
      issued.json() as { result: { issued: { claimSecret: string } } }
    ).result.issued.claimSecret;
    await coachApp.close();

    const principalKey = 'student-synthetic-map';
    const studentApp = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          persistence: persistence as OnboardingPgPersistence,
          resolveContext: () => ({
            mappedRoles: [],
            principalKey,
            synthetic: true,
          }),
          store,
        },
      },
    );
    const created = await studentApp.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: {
        claimSecret,
        retryToken: retryTokenSchema.parse('synthetic-retry-domain-map-create'),
      },
    });
    expect(created.statusCode).toBe(200);
    const attemptId = (
      created.json() as { result: { attempt: { attemptId: string } } }
    ).result.attempt.attemptId;
    const refreshed = await studentApp.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/policy-refresh`,
      payload: {
        retryToken: retryTokenSchema.parse('synthetic-retry-domain-map-policy'),
      },
    });
    expect(refreshed.statusCode).toBe(200);
    const claimed = await studentApp.inject({
      method: 'POST',
      url: `/v1/onboarding/attempts/${attemptId}/claim`,
      payload: {
        claimSecret,
        retryToken: retryTokenSchema.parse('synthetic-retry-domain-map-claim'),
      },
    });
    expect(claimed.statusCode).toBe(200);
    const listed = await mappings.listByPrincipal(principalKey);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      principalKey,
      role: 'student',
      mappingId: mappingIdFor(principalKey, 'student'),
    });
    await studentApp.close();
  });
});

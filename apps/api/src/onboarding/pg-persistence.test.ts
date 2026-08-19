import { retryTokenSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import type { OnboardingPgPersistence } from './pg-persistence.js';
import { createOnboardingStore } from './store.js';

function createRecordingPersistence(): OnboardingPgPersistence & {
  invitationPuts: unknown[];
  operationPuts: unknown[];
} {
  const invitationPuts: unknown[] = [];
  const operationPuts: unknown[] = [];

  return {
    invitationPuts,
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
});

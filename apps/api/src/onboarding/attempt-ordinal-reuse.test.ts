import {
  invitationClaimSecretSchema,
  onboardingOperationResponseSchema,
  retryTokenSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createOnboardingStore, createStoredAttempt } from './store.js';
import { seedIssuedInvitation } from './test-store.js';

function secretAt(index: number) {
  return invitationClaimSecretSchema.parse(
    `synthetic-claim-secret-ordinal-${String(index).padStart(2, '0')}`,
  );
}

function retryTokenAt(index: number) {
  return retryTokenSchema.parse(`synthetic-retry-ordinal-${String(index)}`);
}

/**
 * Regression coverage for the `nextOrdinalForRole` ordinal-exhaustion bug:
 * before its fix, a principal/role whose four prior attempts had already
 * gone terminal (abandoned, expired, or otherwise superseded) could never
 * create another attempt — `createStoredAttempt` would throw when
 * `attemptDetailSchema.parse` rejected an ordinal above `ATTEMPT_ACTIVE_CAP`
 * (4), and that thrown error surfaced to the caller as a raw, undiagnosable
 * 500 `INTERNAL_ERROR` instead of a normal successful creation — even though
 * zero attempts were actually active for that principal/role.
 */
describe('attempt creation after prior attempts for the same principal/role have terminated', () => {
  it('succeeds normally instead of a 500 once four prior attempts for the same principal/role are already terminal', async () => {
    const store = createOnboardingStore();
    const principalKey = 'principal-ordinal-reuse';

    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      const priorInvitation = seedIssuedInvitation(store, {
        claimSecret: secretAt(ordinal),
      });
      const attempt = createStoredAttempt(
        priorInvitation,
        ordinal,
        principalKey,
      );
      attempt.detail = {
        ...attempt.detail,
        lifecycle: 'terminal',
        terminalReason: 'expired',
      };
      store.attempts.set(attempt.detail.attemptId, attempt);
    }

    const fifthInvitation = seedIssuedInvitation(store, {
      claimSecret: secretAt(5),
    });

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticOnboarding: true,
        onboarding: {
          resolveContext: () => ({
            mappedRoles: [],
            principalKey,
            synthetic: true,
          }),
          store,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/attempts',
      payload: {
        claimSecret: secretAt(5),
        retryToken: retryTokenAt(1),
      },
    });

    expect(response.statusCode).toBe(200);
    const body = onboardingOperationResponseSchema.parse(response.json());
    expect(body.operation.state).toBe('operation_committed');
    if (
      !body.result ||
      body.result.outcome !== 'command_succeeded' ||
      !('attempt' in body.result)
    ) {
      throw new Error('expected a successfully created attempt');
    }
    expect(body.result.attempt.invitationId).toBe(fifthInvitation.invitationId);
    expect(body.result.attempt.ordinal).toBeGreaterThanOrEqual(1);
    expect(body.result.attempt.ordinal).toBeLessThanOrEqual(4);

    await app.close();
  });
});

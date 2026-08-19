import { onboardingOperationIdSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingOperationRepository } from '../src/onboarding/synthetic-operations.js';

describe('SyntheticOnboardingOperationRepository', () => {
  it('accepts, replays identical digests, and conflicts on mismatch', async () => {
    const repo = new SyntheticOnboardingOperationRepository();
    const operationId = onboardingOperationIdSchema.parse(
      '11111111-1111-4111-8111-111111111111',
    );
    const record = {
      bindingKey: 'principal-1:create_attempt:hmac-sha256.v1:' + 'a'.repeat(64),
      createdAt: '2026-08-19T12:00:00.000Z',
      digest: 'b'.repeat(64),
      namespace: 'create_attempt' as const,
      operationId,
      principalKey: 'principal-1',
      result: { status: 'ok' },
      retryDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
    };

    await expect(repo.put(record)).resolves.toEqual({
      operation: record,
      status: 'accepted',
    });
    await expect(
      repo.put({
        ...record,
        operationId: onboardingOperationIdSchema.parse(
          '22222222-2222-4222-8222-222222222222',
        ),
        result: { status: 'ignored-on-replay' },
      }),
    ).resolves.toEqual({ operation: record, status: 'replay' });
    await expect(
      repo.put({
        ...record,
        digest: 'c'.repeat(64),
        operationId: onboardingOperationIdSchema.parse(
          '33333333-3333-4333-8333-333333333333',
        ),
      }),
    ).resolves.toMatchObject({
      operation: { digest: record.digest },
      status: 'conflict',
    });
  });
});

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

  it('resolves a stored operation by operation ID and returns null when absent', async () => {
    const repo = new SyntheticOnboardingOperationRepository();
    const operationId = onboardingOperationIdSchema.parse(
      '44444444-4444-4444-8444-444444444444',
    );
    const record = {
      bindingKey: 'principal-2:create_attempt:hmac-sha256.v1:' + 'd'.repeat(64),
      createdAt: '2026-08-19T12:00:00.000Z',
      digest: 'e'.repeat(64),
      namespace: 'create_attempt' as const,
      operationId,
      principalKey: 'principal-2',
      result: { status: 'ok' },
      retryDigest: `hmac-sha256.v1:${'d'.repeat(64)}`,
    };

    await expect(repo.getByOperationId(operationId)).resolves.toBeNull();

    await expect(repo.put(record)).resolves.toEqual({
      operation: record,
      status: 'accepted',
    });

    await expect(repo.getByOperationId(operationId)).resolves.toEqual(record);
    await expect(
      repo.getByOperationId(
        onboardingOperationIdSchema.parse(
          '55555555-5555-4555-8555-555555555555',
        ),
      ),
    ).resolves.toBeNull();
  });

  it('replays or conflicts by operation ID when the binding key does not match but the operation ID was already used', async () => {
    const repo = new SyntheticOnboardingOperationRepository();
    const original = {
      bindingKey: 'principal-3:create_attempt:hmac-sha256.v1:' + 'f'.repeat(64),
      createdAt: '2026-08-19T12:00:00.000Z',
      digest: 'a'.repeat(64),
      namespace: 'create_attempt' as const,
      operationId: onboardingOperationIdSchema.parse(
        '66666666-6666-4666-8666-666666666666',
      ),
      principalKey: 'principal-3',
      result: { status: 'ok' },
      retryDigest: `hmac-sha256.v1:${'f'.repeat(64)}`,
    };

    await expect(repo.put(original)).resolves.toEqual({
      operation: original,
      status: 'accepted',
    });

    // Falsification: a distinct bindingKey rules out the byBinding-conflict
    // branch above, so a same-digest match here can only come from the
    // byId replay branch.
    await expect(
      repo.put({
        ...original,
        bindingKey:
          'principal-3:create_attempt:hmac-sha256.v1:' + 'g'.repeat(64),
      }),
    ).resolves.toEqual({ operation: original, status: 'replay' });

    // Same distinct bindingKey, but a different digest — only the byId
    // conflict branch can produce this result.
    await expect(
      repo.put({
        ...original,
        bindingKey:
          'principal-3:create_attempt:hmac-sha256.v1:' + 'h'.repeat(64),
        digest: 'b'.repeat(64),
      }),
    ).resolves.toMatchObject({
      operation: { digest: original.digest },
      status: 'conflict',
    });
  });
});

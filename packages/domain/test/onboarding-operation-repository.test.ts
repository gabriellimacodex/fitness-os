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

  it('reads stored and unknown records directly by binding key and operation ID', async () => {
    const repo = new SyntheticOnboardingOperationRepository();
    const operationId = onboardingOperationIdSchema.parse(
      '44444444-4444-4444-8444-444444444444',
    );
    const record = {
      bindingKey: 'principal-2:create_attempt:hmac-sha256.v1:' + 'a'.repeat(64),
      createdAt: '2026-08-19T12:00:00.000Z',
      digest: 'd'.repeat(64),
      namespace: 'create_attempt' as const,
      operationId,
      principalKey: 'principal-2',
      result: { status: 'ok' },
      retryDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
    };

    await expect(repo.getByBindingKey(record.bindingKey)).resolves.toBeNull();
    await expect(repo.getByOperationId(operationId)).resolves.toBeNull();

    await expect(repo.put(record)).resolves.toEqual({
      operation: record,
      status: 'accepted',
    });

    await expect(repo.getByBindingKey(record.bindingKey)).resolves.toEqual(
      record,
    );
    await expect(repo.getByOperationId(operationId)).resolves.toEqual(record);
    await expect(
      repo.getByBindingKey('unknown-binding-key'),
    ).resolves.toBeNull();
    await expect(
      repo.getByOperationId(
        onboardingOperationIdSchema.parse(
          '55555555-5555-4555-8555-555555555555',
        ),
      ),
    ).resolves.toBeNull();
  });

  it('resolves a retry under a new authority-alias binding key by the shared operation ID', async () => {
    const repo = new SyntheticOnboardingOperationRepository();
    const operationId = onboardingOperationIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    );
    const record = {
      bindingKey:
        'protected-ref-1:create_attempt:hmac-sha256.v1:' + 'a'.repeat(64),
      createdAt: '2026-08-19T12:00:00.000Z',
      digest: 'e'.repeat(64),
      namespace: 'create_attempt' as const,
      operationId,
      principalKey: 'principal-3',
      result: { status: 'ok' },
      retryDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
    };

    await expect(repo.put(record)).resolves.toEqual({
      operation: record,
      status: 'accepted',
    });

    // The same operation is replayed under the post-binding principal alias's
    // binding key, which was never stored in `#byBinding`. Only the shared
    // `operationId` resolves it, proving token uniqueness spans both aliases.
    await expect(
      repo.put({
        ...record,
        bindingKey:
          'principal-3:create_attempt:hmac-sha256.v1:' + 'a'.repeat(64),
      }),
    ).resolves.toEqual({ operation: record, status: 'replay' });

    await expect(
      repo.put({
        ...record,
        bindingKey:
          'principal-3:create_attempt:hmac-sha256.v1:' + 'b'.repeat(64),
        digest: 'f'.repeat(64),
      }),
    ).resolves.toMatchObject({
      operation: { digest: record.digest },
      status: 'conflict',
    });
  });
});

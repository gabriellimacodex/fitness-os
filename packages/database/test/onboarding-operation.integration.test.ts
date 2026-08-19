import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { onboardingOperationIdSchema } from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresOnboardingOperationRepository } from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding operation persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let operations: ReturnType<
      typeof createPostgresOnboardingOperationRepository
    >;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      operations = createPostgresOnboardingOperationRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE onboarding_operation`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('accepts, replays identical digests, and conflicts on digest mismatch', async () => {
      const operationId = onboardingOperationIdSchema.parse(
        '11111111-1111-4111-8111-111111111111',
      );
      const record = {
        bindingKey:
          'principal-1:create_attempt:hmac-sha256.v1:' + 'a'.repeat(64),
        createdAt: '2026-08-19T12:00:00.000Z',
        digest: 'b'.repeat(64),
        namespace: 'create_attempt' as const,
        operationId,
        principalKey: 'principal-1',
        result: {
          status: 'ok',
          attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
        retryDigest: `hmac-sha256.v1:${'a'.repeat(64)}`,
      };

      await expect(operations.put(record)).resolves.toEqual({
        operation: record,
        status: 'accepted',
      });

      const replay = await operations.put({
        ...record,
        operationId: onboardingOperationIdSchema.parse(
          '22222222-2222-4222-8222-222222222222',
        ),
        result: { status: 'different-payload-ignored-on-replay' },
      });
      expect(replay.status).toBe('replay');
      expect(replay.operation.operationId).toBe(operationId);
      expect(replay.operation.digest).toBe(record.digest);

      const conflict = await operations.put({
        ...record,
        digest: 'c'.repeat(64),
        operationId: onboardingOperationIdSchema.parse(
          '33333333-3333-4333-8333-333333333333',
        ),
      });
      expect(conflict.status).toBe('conflict');
      expect(conflict.operation.digest).toBe(record.digest);

      await expect(
        operations.getByBindingKey(record.bindingKey),
      ).resolves.toEqual(record);
      await expect(operations.getByOperationId(operationId)).resolves.toEqual(
        record,
      );
    });
  },
);

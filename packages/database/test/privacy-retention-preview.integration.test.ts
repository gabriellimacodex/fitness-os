import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { planRetentionPreview } from '@fitness-os/domain';
import {
  privacyOperationIdSchema,
  privacyPolicyVersionIdSchema,
} from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresPrivacyRetentionPreviewRepository } from '../src/privacy/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 21 disposable retention preview persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let repository: ReturnType<
      typeof createPostgresPrivacyRetentionPreviewRepository
    >;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      repository = createPostgresPrivacyRetentionPreviewRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE privacy_retention_preview`);
    });

    afterAll(async () => {
      await connection.close();
    });

    function plannedRecord(policyVersionId: string) {
      const plan = planRetentionPreview({
        policyVersionId: privacyPolicyVersionIdSchema.parse(policyVersionId),
        policySynthetic: true,
        inventoryVersionDigest: '3'.repeat(64),
        processorDescriptorDigests: ['c'.repeat(64), 'b'.repeat(64)],
        watermark: '2026-08-18T00:00:00.000Z',
        approvedExceptionIds: [],
        productionMode: false,
      });
      if (plan.status !== 'planned') {
        throw new Error('expected planned');
      }
      return {
        ...plan.preview,
        status: 'planned' as const,
        createdAt: '2026-08-18T00:00:01.000Z',
        executedAt: null,
      };
    }

    it('accepts a preview once and rejects an exact repeat as conflict', async () => {
      const record = plannedRecord('11111111-1111-4111-8111-111111111111');

      await expect(repository.put(record)).resolves.toBe('accepted');
      await expect(repository.put(record)).resolves.toBe('conflict');
      await expect(
        repository.getBySelectionDigest(record.selectionDigest),
      ).resolves.toEqual(record);
    });

    it('returns null for an unknown selectionDigest', async () => {
      await expect(
        repository.getBySelectionDigest('0'.repeat(64)),
      ).resolves.toBeNull();
    });

    it('round-trips array fields and a null executedAt', async () => {
      const record = plannedRecord('22222222-2222-4222-8222-222222222222');
      await repository.put(record);

      const fetched = await repository.getBySelectionDigest(
        record.selectionDigest,
      );
      expect(fetched?.processorDescriptorDigests).toEqual([
        'b'.repeat(64),
        'c'.repeat(64),
      ]);
      expect(fetched?.executedAt).toBeNull();
      expect(fetched?.status).toBe('planned');
    });

    it('marks a preview executed once and replays only the same operation', async () => {
      const record = plannedRecord('33333333-3333-4333-8333-333333333333');
      const operationId = privacyOperationIdSchema.parse(
        '44444444-4444-4444-8444-444444444444',
      );
      await repository.put(record);

      await expect(
        repository.markExecuted({
          selectionDigest: record.selectionDigest,
          operationId,
          executedAt: '2026-08-18T00:00:02.000Z',
        }),
      ).resolves.toBe('executed');
      await expect(
        repository.markExecuted({
          selectionDigest: record.selectionDigest,
          operationId,
          executedAt: '2026-08-18T00:00:03.000Z',
        }),
      ).resolves.toBe('idempotent_replay');
      await expect(
        repository.markExecuted({
          selectionDigest: record.selectionDigest,
          operationId: privacyOperationIdSchema.parse(
            '55555555-5555-4555-8555-555555555555',
          ),
          executedAt: '2026-08-18T00:00:04.000Z',
        }),
      ).resolves.toBe('conflict');
      await expect(
        repository.getBySelectionDigest(record.selectionDigest),
      ).resolves.toMatchObject({
        status: 'executed',
        executedAt: '2026-08-18T00:00:02.000Z',
      });
    });

    it('allows only one of two concurrent execution operations', async () => {
      const record = plannedRecord('66666666-6666-4666-8666-666666666666');
      const operationIds = [
        privacyOperationIdSchema.parse('77777777-7777-4777-8777-777777777777'),
        privacyOperationIdSchema.parse('88888888-8888-4888-8888-888888888888'),
      ] as const;
      await repository.put(record);

      const results = await Promise.all(
        operationIds.map((operationId) =>
          repository.markExecuted({
            selectionDigest: record.selectionDigest,
            operationId,
            executedAt: '2026-08-18T00:00:02.000Z',
          }),
        ),
      );

      expect([...results].sort()).toEqual(['conflict', 'executed']);
      const winningOperationId = operationIds[results.indexOf('executed')]!;
      await expect(
        repository.markExecuted({
          selectionDigest: record.selectionDigest,
          operationId: winningOperationId,
          executedAt: '2026-08-18T00:00:03.000Z',
        }),
      ).resolves.toBe('idempotent_replay');
    });
  },
);

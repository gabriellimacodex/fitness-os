import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  digestRetentionExecutionInput,
  planRetentionPreview,
} from '@fitness-os/domain';
import {
  privacyOperationIdSchema,
  privacyPolicyVersionIdSchema,
} from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresPrivacyRetentionPreviewRepository } from '../src/privacy/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

function migrationStatements(filename: string): string[] {
  return readFileSync(
    new URL(`../drizzle/${filename}`, import.meta.url),
    'utf8',
  )
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

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
      const inputDigest = digestRetentionExecutionInput({
        previewTtlMs: 60 * 60 * 1000,
        requestedSelectionDigest: record.selectionDigest,
      });
      await repository.put(record);

      await expect(
        repository.markExecuted({
          selectionDigest: record.selectionDigest,
          inputDigest,
          operationId,
          executedAt: '2026-08-18T00:00:02.000Z',
        }),
      ).resolves.toBe('executed');
      await expect(
        repository.markExecuted({
          selectionDigest: record.selectionDigest,
          inputDigest,
          operationId,
          executedAt: '2026-08-18T00:00:03.000Z',
        }),
      ).resolves.toBe('idempotent_replay');
      await expect(
        repository.markExecuted({
          selectionDigest: record.selectionDigest,
          inputDigest,
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
            inputDigest: digestRetentionExecutionInput({
              previewTtlMs: 60 * 60 * 1000,
              requestedSelectionDigest: record.selectionDigest,
            }),
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
          inputDigest: digestRetentionExecutionInput({
            previewTtlMs: 60 * 60 * 1000,
            requestedSelectionDigest: record.selectionDigest,
          }),
          operationId: winningOperationId,
          executedAt: '2026-08-18T00:00:03.000Z',
        }),
      ).resolves.toBe('idempotent_replay');
    });

    it('allows one preview per operation under concurrent cross-input reuse', async () => {
      const records = [
        plannedRecord('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        plannedRecord('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      ] as const;
      const operationId = privacyOperationIdSchema.parse(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      await Promise.all(records.map((record) => repository.put(record)));

      const results = await Promise.all(
        records.map((record) =>
          repository.markExecuted({
            selectionDigest: record.selectionDigest,
            inputDigest: digestRetentionExecutionInput({
              previewTtlMs: 60 * 60 * 1000,
              requestedSelectionDigest: record.selectionDigest,
            }),
            operationId,
            executedAt: '2026-08-18T00:00:02.000Z',
          }),
        ),
      );

      expect([...results].sort()).toEqual(['conflict', 'executed']);
    });

    it('upgrades a legacy executed preview without inventing operation attribution', async () => {
      const schemaName = 'prd21_retention_preview_upgrade';
      await connection.db.execute(
        sql.raw(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`),
      );

      try {
        await connection.db.transaction(async (tx) => {
          await tx.execute(sql.raw(`CREATE SCHEMA ${schemaName}`));
          await tx.execute(
            sql.raw(`SET LOCAL search_path TO ${schemaName}, public`),
          );
          for (const filename of [
            '0017_prd21_privacy_retention_preview.sql',
            '0018_prd21_privacy_retention_rule.sql',
            '0019_prd21_privacy_retention_rule_guard.sql',
          ]) {
            for (const statement of migrationStatements(filename)) {
              await tx.execute(sql.raw(statement));
            }
          }

          await tx.execute(sql`
            INSERT INTO privacy_retention_preview (
              selection_digest,
              policy_version_id,
              inventory_version_digest,
              processor_descriptor_digests,
              watermark,
              approved_exception_ids,
              status,
              created_at,
              executed_at
            ) VALUES (
              ${'9'.repeat(64)},
              '99999999-9999-4999-8999-999999999999',
              ${'8'.repeat(64)},
              ${JSON.stringify(['7'.repeat(64)])}::jsonb,
              '2026-08-18T00:00:00.000Z',
              '[]'::jsonb,
              'executed',
              '2026-08-18T00:00:01.000Z',
              '2026-08-18T00:00:02.000Z'
            )
          `);

          for (const filename of [
            '0020_prd21_retention_preview_execution.sql',
            '0021_prd21_retention_preview_execution_guard.sql',
            '0022_prd21_retention_execution_input_binding.sql',
          ]) {
            for (const statement of migrationStatements(filename)) {
              await tx.execute(sql.raw(statement));
            }
          }

          const legacy = await tx.execute<{
            execution_input_digest: string | null;
            execution_operation_id: string | null;
          }>(sql`
            SELECT execution_input_digest, execution_operation_id
            FROM privacy_retention_preview
            WHERE selection_digest = ${'9'.repeat(64)}
          `);
          const constraints = await tx.execute<{
            conname: string;
            convalidated: boolean;
          }>(sql`
            SELECT conname, convalidated
            FROM pg_constraint
            WHERE conrelid = 'privacy_retention_preview'::regclass
              AND conname IN (
                'privacy_retention_preview_status_operation_pair_check',
                'privacy_retention_preview_status_input_digest_pair_check'
              )
            ORDER BY conname
          `);

          expect(legacy[0]?.execution_input_digest).toBeNull();
          expect(legacy[0]?.execution_operation_id).toBeNull();
          expect(constraints).toHaveLength(2);
          expect(constraints.every(({ convalidated }) => !convalidated)).toBe(
            true,
          );
        });

        await expect(
          connection.db.transaction(async (tx) => {
            await tx.execute(
              sql.raw(`SET LOCAL search_path TO ${schemaName}, public`),
            );
            await tx.execute(sql`
              INSERT INTO privacy_retention_preview (
                selection_digest,
                policy_version_id,
                inventory_version_digest,
                processor_descriptor_digests,
                watermark,
                approved_exception_ids,
                status,
                created_at,
                executed_at,
                execution_operation_id
              ) VALUES (
                ${'6'.repeat(64)},
                '66666666-6666-4666-8666-666666666666',
                ${'5'.repeat(64)},
                ${JSON.stringify(['4'.repeat(64)])}::jsonb,
                '2026-08-18T00:00:00.000Z',
                '[]'::jsonb,
                'executed',
                '2026-08-18T00:00:01.000Z',
                '2026-08-18T00:00:02.000Z',
                NULL
              )
            `);
          }),
        ).rejects.toThrow();
      } finally {
        await connection.db.execute(
          sql.raw(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`),
        );
      }
    });
  },
);

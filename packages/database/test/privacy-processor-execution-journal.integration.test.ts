import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  privacyPolicyPackageReferenceSchema,
  privacyProcessorExecutionJournalRecordSchema,
  privacySubjectRequestReferenceSchema,
} from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import {
  createPostgresPrivacyPolicyPackageRepository,
  createPostgresPrivacyProcessorExecutionJournal,
  createPostgresPrivacySubjectRequestRepository,
} from '../src/privacy/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const policy = privacyPolicyPackageReferenceSchema.parse({
  packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  canonicalizationVersion: 'privacy-governance.canonical.v1',
  contentDigest: 'a'.repeat(64),
  synthetic: true,
});
const request = privacySubjectRequestReferenceSchema.parse({
  requestId: '66666666-6666-4666-8666-666666666666',
  requestType: 'export',
  state: 'received',
  subjectScopeId: '22222222-2222-4222-8222-222222222222',
  verification: null,
  policyVersionId: policy.versionId,
  inventoryVersionDigest: '1'.repeat(64),
  correlationId: '55555555-5555-4555-8555-555555555555',
  updatedAt: '2026-08-18T12:00:00.000Z',
});
const reservation = privacyProcessorExecutionJournalRecordSchema.parse({
  operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  requestId: request.requestId,
  processorId: '99999999-9999-4999-8999-999999999999',
  capability: 'export',
  correlationId: request.correlationId,
  bindingDigest: '1'.repeat(64),
  state: 'reserved',
  outcome: null,
  reservedAt: '2026-08-18T12:03:00.000Z',
  completedAt: null,
  synthetic: true,
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 21 processor execution journal persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(
        sql`TRUNCATE privacy_processor_execution_journal, privacy_subject_request_transition, privacy_subject_request, privacy_policy_package_version CASCADE`,
      );
      await createPostgresPrivacyPolicyPackageRepository(connection).put(
        policy,
      );
      await createPostgresPrivacySubjectRequestRepository(
        connection,
      ).createReceived(request, request.updatedAt);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('persists completion and returns an exact replay after repository restart', async () => {
      const first = createPostgresPrivacyProcessorExecutionJournal(connection);
      await expect(first.reserve(reservation)).resolves.toEqual({
        status: 'reserved',
      });
      const completed = privacyProcessorExecutionJournalRecordSchema.parse({
        ...reservation,
        state: 'completed',
        outcome: 'completed',
        completedAt: '2026-08-18T12:04:00.000Z',
      });
      await expect(first.complete(completed)).resolves.toBe('accepted');

      const afterRestart =
        createPostgresPrivacyProcessorExecutionJournal(connection);
      await expect(afterRestart.reserve(reservation)).resolves.toEqual({
        status: 'completed',
        record: completed,
      });
    });

    it('holds an unfinished reservation for reconciliation and rejects changed binding', async () => {
      const first = createPostgresPrivacyProcessorExecutionJournal(connection);
      await expect(first.reserve(reservation)).resolves.toEqual({
        status: 'reserved',
      });

      const afterRestart =
        createPostgresPrivacyProcessorExecutionJournal(connection);
      await expect(afterRestart.reserve(reservation)).resolves.toEqual({
        status: 'reconciliation_required',
      });
      await expect(
        afterRestart.reserve({ ...reservation, bindingDigest: '2'.repeat(64) }),
      ).resolves.toEqual({ status: 'conflict' });
      await expect(
        afterRestart.getByOperationId(reservation.operationId),
      ).resolves.toMatchObject({ state: 'reconciliation_required' });
    });

    it('allows one concurrent reservation winner and holds the loser for reconciliation', async () => {
      const first = createPostgresPrivacyProcessorExecutionJournal(connection);
      const second = createPostgresPrivacyProcessorExecutionJournal(connection);

      const results = await Promise.all([
        first.reserve(reservation),
        second.reserve(reservation),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        'reconciliation_required',
        'reserved',
      ]);
      await expect(
        first.getByOperationId(reservation.operationId),
      ).resolves.toMatchObject({ state: 'reconciliation_required' });
    });

    it('rejects ad hoc binding mutation and deletion', async () => {
      const journal =
        createPostgresPrivacyProcessorExecutionJournal(connection);
      await journal.reserve(reservation);

      await expect(
        connection.db.execute(sql`
          UPDATE privacy_processor_execution_journal
          SET binding_digest = ${'2'.repeat(64)}
          WHERE operation_id = ${reservation.operationId}::uuid
        `),
      ).rejects.toBeTruthy();
      await expect(
        connection.db.execute(sql`
          DELETE FROM privacy_processor_execution_journal
          WHERE operation_id = ${reservation.operationId}::uuid
        `),
      ).rejects.toBeTruthy();

      const privileges = await connection.db.execute<{
        can_delete: boolean;
        can_update: boolean;
      }>(sql`
        SELECT
          has_table_privilege(
            'fitness_os_privacy_ordinary',
            'privacy_processor_execution_journal',
            'DELETE'
          ) AS can_delete,
          has_table_privilege(
            'fitness_os_privacy_ordinary',
            'privacy_processor_execution_journal',
            'UPDATE'
          ) AS can_update
      `);
      expect(privileges).toEqual([{ can_delete: false, can_update: false }]);
    });

    it('rejects a forged completed or reconciliation row on initial insert', async () => {
      const assertInitialStateRejected = async (
        state: 'completed' | 'reconciliation_required',
      ) => {
        const outcome = state === 'completed' ? 'completed' : null;
        const completedAt =
          state === 'completed' ? '2026-08-18T12:04:00.000Z' : null;
        await expect(
          connection.db.transaction(async (transaction) => {
            await transaction.execute(
              sql`SET LOCAL ROLE fitness_os_privacy_ordinary`,
            );
            await transaction.execute(sql`
              INSERT INTO privacy_processor_execution_journal (
                operation_id,
                request_id,
                processor_id,
                capability,
                correlation_id,
                binding_digest,
                state,
                outcome,
                reserved_at,
                completed_at,
                synthetic
              ) VALUES (
                ${state === 'completed' ? '21212121-2121-4121-8121-212121212121' : '23232323-2323-4323-8323-232323232323'}::uuid,
                ${reservation.requestId}::uuid,
                ${reservation.processorId}::uuid,
                ${reservation.capability},
                ${reservation.correlationId}::uuid,
                ${reservation.bindingDigest},
                ${state},
                ${outcome},
                ${reservation.reservedAt}::timestamptz,
                ${completedAt}::timestamptz,
                true
              )
            `);
          }),
        ).rejects.toBeTruthy();
      };

      await assertInitialStateRejected('completed');
      await assertInitialStateRejected('reconciliation_required');
    });
  },
);

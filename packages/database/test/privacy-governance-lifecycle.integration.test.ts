import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  privacyGovernanceLifecycleProofReferenceSchema,
  privacyLifecycleProofIdSchema,
  privacyOperationIdSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorIdSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
} from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import {
  createPostgresPrivacyGovernanceLifecycleLedger,
  createPostgresPrivacyPolicyPackageRepository,
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
  requestId: privacySubjectRequestIdSchema.parse(
    '66666666-6666-4666-8666-666666666666',
  ),
  requestType: 'deletion',
  state: 'received',
  subjectScopeId: '22222222-2222-4222-8222-222222222222',
  verification: null,
  policyVersionId: policy.versionId,
  inventoryVersionDigest: '1'.repeat(64),
  correlationId: '55555555-5555-4555-8555-555555555555',
  updatedAt: '2026-08-27T12:00:00.000Z',
});

const processorId = privacyProcessorIdSchema.parse(
  '99999999-9999-4999-8999-999999999999',
);

const proof = privacyGovernanceLifecycleProofReferenceSchema.parse({
  requestId: request.requestId,
  processorId,
  operationId: privacyOperationIdSchema.parse(
    'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
  ),
  result: {
    outcome: 'completed',
    proofId: privacyLifecycleProofIdSchema.parse(
      'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
    ),
  },
  recordedAt: '2026-08-27T12:05:00.000Z',
  synthetic: true,
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 21 privacy governance-lifecycle proof persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let ledger: ReturnType<
      typeof createPostgresPrivacyGovernanceLifecycleLedger
    >;
    let policies: ReturnType<
      typeof createPostgresPrivacyPolicyPackageRepository
    >;
    let subjectRequests: ReturnType<
      typeof createPostgresPrivacySubjectRequestRepository
    >;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      ledger = createPostgresPrivacyGovernanceLifecycleLedger(connection);
      policies = createPostgresPrivacyPolicyPackageRepository(connection);
      subjectRequests =
        createPostgresPrivacySubjectRequestRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(
        sql`TRUNCATE privacy_governance_lifecycle_proof, privacy_subject_request_transition, privacy_subject_request, privacy_policy_package_version CASCADE`,
      );
      await policies.put(policy);
      await subjectRequests.createReceived(request, '2026-08-27T12:00:00.000Z');
    });

    afterAll(async () => {
      await connection.close();
    });

    it('appends a proof once and rejects an exact operationId replay as conflict', async () => {
      await expect(ledger.append(proof)).resolves.toBe('accepted');
      await expect(ledger.append(proof)).resolves.toBe('conflict');
      await expect(ledger.getByOperationId(proof.operationId)).resolves.toEqual(
        proof,
      );
    });

    it('round-trips a denied outcome with no proofId', async () => {
      const denied = privacyGovernanceLifecycleProofReferenceSchema.parse({
        ...proof,
        operationId: privacyOperationIdSchema.parse(
          'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3',
        ),
        result: { outcome: 'denied' },
      });

      await expect(ledger.append(denied)).resolves.toBe('accepted');
      await expect(
        ledger.getByOperationId(denied.operationId),
      ).resolves.toEqual(denied);
    });

    it('returns null for an unknown operationId', async () => {
      await expect(
        ledger.getByOperationId(
          privacyOperationIdSchema.parse(
            '77777777-7777-4777-8777-777777777777',
          ),
        ),
      ).resolves.toBeNull();
    });

    it('rejects a proof referencing an unknown request', async () => {
      const orphan = privacyGovernanceLifecycleProofReferenceSchema.parse({
        ...proof,
        operationId: privacyOperationIdSchema.parse(
          'f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4',
        ),
        requestId: privacySubjectRequestIdSchema.parse(
          '88888888-8888-4888-8888-888888888888',
        ),
      });

      await expect(ledger.append(orphan)).rejects.toBeTruthy();
    });

    it('rejects ad hoc UPDATE/DELETE on the append-only governance-lifecycle-proof table', async () => {
      await expect(ledger.append(proof)).resolves.toBe('accepted');

      const assertAppendOnlyRejected = async (
        statement: ReturnType<typeof sql>,
      ) => {
        try {
          await connection.db.execute(statement);
          throw new Error('expected append-only rejection');
        } catch (error) {
          const text = [
            error instanceof Error ? error.message : String(error),
            JSON.stringify(error),
          ].join('\n');
          expect(text).toMatch(
            /42501|privacy_reject_append_only_mutation|fitness_os_privacy_append_only/,
          );
        }
      };

      await assertAppendOnlyRejected(
        sql`UPDATE privacy_governance_lifecycle_proof SET outcome = 'denied' WHERE operation_id = ${proof.operationId}::uuid`,
      );
      await assertAppendOnlyRejected(
        sql`DELETE FROM privacy_governance_lifecycle_proof WHERE operation_id = ${proof.operationId}::uuid`,
      );

      const insertPriv = await connection.db.execute<{
        has_insert: boolean;
      }>(sql`
        SELECT has_table_privilege(
          'fitness_os_privacy_ordinary',
          'privacy_governance_lifecycle_proof',
          'INSERT'
        ) AS has_insert
      `);
      expect(insertPriv[0]?.has_insert).toBe(true);

      const updatePriv = await connection.db.execute<{
        has_update: boolean;
      }>(sql`
        SELECT has_table_privilege(
          'fitness_os_privacy_ordinary',
          'privacy_governance_lifecycle_proof',
          'UPDATE'
        ) AS has_update
      `);
      expect(updatePriv[0]?.has_update).toBe(false);
    });
  },
);

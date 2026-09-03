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
  createPostgresPrivacyGovernanceLifecycleBindingVerifier,
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

const sealedOperationId = privacyOperationIdSchema.parse(
  'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
);

const proof = privacyGovernanceLifecycleProofReferenceSchema.parse({
  requestId: request.requestId,
  processorId,
  operationId: sealedOperationId,
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
  'PRD 21 PostgreSQL-backed governance-lifecycle binding verifier',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let ledger: ReturnType<
      typeof createPostgresPrivacyGovernanceLifecycleLedger
    >;
    let verifier: ReturnType<
      typeof createPostgresPrivacyGovernanceLifecycleBindingVerifier
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
      verifier =
        createPostgresPrivacyGovernanceLifecycleBindingVerifier(connection);
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

    it('verifies a presented binding that exactly matches a sealed ledger row', async () => {
      await expect(ledger.append(proof)).resolves.toBe('accepted');

      await expect(
        verifier.verify({
          requestId: proof.requestId,
          processorId: proof.processorId,
          operationId: proof.operationId,
          result: proof.result,
        }),
      ).resolves.toEqual({
        status: 'verified',
        binding: {
          requestId: proof.requestId,
          processorId: proof.processorId,
          operationId: proof.operationId,
          result: proof.result,
        },
      });
    });

    it('rejects an operationId with no sealed ledger row as invalid, not unavailable', async () => {
      await expect(
        verifier.verify({
          requestId: proof.requestId,
          processorId: proof.processorId,
          operationId: privacyOperationIdSchema.parse(
            '77777777-7777-4777-8777-777777777777',
          ),
          result: proof.result,
        }),
      ).resolves.toEqual({ status: 'invalid' });
    });

    it('rejects a presented binding whose proofId does not match the sealed row', async () => {
      await expect(ledger.append(proof)).resolves.toBe('accepted');

      await expect(
        verifier.verify({
          requestId: proof.requestId,
          processorId: proof.processorId,
          operationId: proof.operationId,
          result: {
            outcome: 'completed',
            proofId: privacyLifecycleProofIdSchema.parse(
              'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5',
            ),
          },
        }),
      ).resolves.toEqual({ status: 'invalid' });
    });

    it('rejects a presented binding whose outcome does not match the sealed row', async () => {
      await expect(ledger.append(proof)).resolves.toBe('accepted');

      await expect(
        verifier.verify({
          requestId: proof.requestId,
          processorId: proof.processorId,
          operationId: proof.operationId,
          result: { outcome: 'denied' },
        }),
      ).resolves.toEqual({ status: 'invalid' });
    });

    it('verifies a sealed denied outcome, which carries no proofId to compare', async () => {
      const deniedOperationId = privacyOperationIdSchema.parse(
        'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3',
      );
      const denied = privacyGovernanceLifecycleProofReferenceSchema.parse({
        ...proof,
        operationId: deniedOperationId,
        result: { outcome: 'denied' },
      });
      await expect(ledger.append(denied)).resolves.toBe('accepted');

      await expect(
        verifier.verify({
          requestId: denied.requestId,
          processorId: denied.processorId,
          operationId: deniedOperationId,
          result: { outcome: 'denied' },
        }),
      ).resolves.toEqual({
        status: 'verified',
        binding: {
          requestId: denied.requestId,
          processorId: denied.processorId,
          operationId: deniedOperationId,
          result: { outcome: 'denied' },
        },
      });
    });

    it('rejects a presented binding referencing a different requestId or processorId than the sealed row', async () => {
      await expect(ledger.append(proof)).resolves.toBe('accepted');

      await expect(
        verifier.verify({
          requestId: privacySubjectRequestIdSchema.parse(
            '88888888-8888-4888-8888-888888888888',
          ),
          processorId: proof.processorId,
          operationId: proof.operationId,
          result: proof.result,
        }),
      ).resolves.toEqual({ status: 'invalid' });

      await expect(
        verifier.verify({
          requestId: proof.requestId,
          processorId: privacyProcessorIdSchema.parse(
            'ffffffff-ffff-4fff-8fff-ffffffffffff',
          ),
          operationId: proof.operationId,
          result: proof.result,
        }),
      ).resolves.toEqual({ status: 'invalid' });
    });
  },
);

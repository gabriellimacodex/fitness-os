import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  createSyntheticPrivacyDataUsePorts,
  evaluateDataUse,
} from '@fitness-os/domain';
import {
  privacyActorContextReferenceSchema,
  privacyAuditEventIdSchema,
  privacyAuditEventReferenceSchema,
  privacyCorrelationIdSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyOperationIdSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
  privacySubjectScopeIdSchema,
  privacyWithdrawalIdSchema,
  privacyWithdrawalReferenceSchema,
} from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import {
  checkPrivacyCoreDatabaseReadiness,
  createPostgresPrivacyAuditSink,
  createPostgresPrivacyAuthorizationEvidenceLedger,
  createPostgresPrivacyPolicyPackageRepository,
  createPostgresPrivacyPurposeRegistry,
  createPostgresPrivacyRuntimeProcessorRegistry,
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

const purpose = privacyPurposeVersionReferenceSchema.parse({
  purposeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  purposeVersionId: '33333333-3333-4333-8333-333333333333',
  policyVersionId: policy.versionId,
  allowedOperationKinds: ['data_use_evaluation'],
  allowedCategoryIds: ['44444444-4444-4444-8444-444444444444'],
  evidenceRequired: true,
  activationState: 'active',
  contentDigest: 'b'.repeat(64),
});

const processor = privacyProcessorDescriptorReferenceSchema.parse({
  processorId: '99999999-9999-4999-8999-999999999999',
  inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  descriptorDigest: 'c'.repeat(64),
  inventoryVersionDigest: 'd'.repeat(64),
  allowedPurposeIds: [purpose.purposeId],
  allowedCategoryIds: purpose.allowedCategoryIds,
  capabilities: ['access', 'inventory'],
  supportsSubjectLookup: true,
  codeOwner: 'packages.domain.privacy',
  synthetic: true,
});

const actor = privacyActorContextReferenceSchema.parse({
  issuer: 'synthetic.identity.v1',
  version: 1,
  principalReferenceDigest: 'e'.repeat(64),
  authorityClaims: ['data_use_evaluate'],
  synthetic: true,
});

const evidence = privacyEvidenceReferenceSchema.parse({
  evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  purposeId: purpose.purposeId,
  policyVersionId: policy.versionId,
  contentDigest: 'f'.repeat(64),
  recordedAt: '2026-08-18T11:00:00.000Z',
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 21 privacy core persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let evidenceLedger: ReturnType<
      typeof createPostgresPrivacyAuthorizationEvidenceLedger
    >;
    let auditSink: ReturnType<typeof createPostgresPrivacyAuditSink>;
    let policies: ReturnType<
      typeof createPostgresPrivacyPolicyPackageRepository
    >;
    let purposes: ReturnType<typeof createPostgresPrivacyPurposeRegistry>;
    let processors: ReturnType<
      typeof createPostgresPrivacyRuntimeProcessorRegistry
    >;
    let subjectRequests: ReturnType<
      typeof createPostgresPrivacySubjectRequestRepository
    >;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      evidenceLedger =
        createPostgresPrivacyAuthorizationEvidenceLedger(connection);
      auditSink = createPostgresPrivacyAuditSink(connection);
      policies = createPostgresPrivacyPolicyPackageRepository(connection);
      purposes = createPostgresPrivacyPurposeRegistry(connection);
      processors = createPostgresPrivacyRuntimeProcessorRegistry(connection);
      subjectRequests =
        createPostgresPrivacySubjectRequestRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(
        sql`TRUNCATE privacy_subject_request, privacy_audit_event, privacy_withdrawal, privacy_authorization_evidence, privacy_purpose_version, privacy_processor_registration, privacy_policy_package_version`,
      );
    });

    afterAll(async () => {
      await connection.close();
    });

    it('reports privacy core readiness after migration', async () => {
      await expect(
        checkPrivacyCoreDatabaseReadiness(connection),
      ).resolves.toEqual({ ready: true });
    });

    it('appends evidence and one-way withdrawal without rewriting evidence', async () => {
      await expect(evidenceLedger.appendEvidence(evidence)).resolves.toBe(
        'accepted',
      );
      await expect(evidenceLedger.appendEvidence(evidence)).resolves.toBe(
        'conflict',
      );
      await expect(
        evidenceLedger.getEvidence(evidence.evidenceId),
      ).resolves.toEqual(evidence);

      const withdrawal = privacyWithdrawalReferenceSchema.parse({
        withdrawalId: privacyWithdrawalIdSchema.parse(
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        ),
        evidenceId: evidence.evidenceId,
        state: 'withdrawn',
        withdrawnAt: '2026-08-18T12:00:00.000Z',
        operationId: privacyOperationIdSchema.parse(
          'ffffffff-ffff-4fff-8fff-ffffffffffff',
        ),
        processingOutcome: 'accepted',
      });

      await expect(evidenceLedger.appendWithdrawal(withdrawal)).resolves.toBe(
        'accepted',
      );
      await expect(evidenceLedger.appendWithdrawal(withdrawal)).resolves.toBe(
        'idempotent_replay',
      );
      await expect(
        evidenceLedger.getAuthoritativeWithdrawal(evidence.evidenceId),
      ).resolves.toMatchObject({ state: 'withdrawn' });
      await expect(
        evidenceLedger.getEvidence(evidence.evidenceId),
      ).resolves.toEqual(evidence);
    });

    it('persists audit events and evaluates data-use against PG evidence/audit', async () => {
      await evidenceLedger.appendEvidence(evidence);

      const synthetic = createSyntheticPrivacyDataUsePorts({
        fixedUtcMs: '2026-08-18T12:00:00.000Z',
      });
      synthetic.policies.seed(policy);
      synthetic.purposes.seed(purpose);
      synthetic.processors.seed(processor);

      const allowed = await evaluateDataUse(
        {
          clock: synthetic.clock,
          ids: synthetic.ids,
          policies: synthetic.policies,
          purposes: synthetic.purposes,
          processors: synthetic.processors,
          evidence: evidenceLedger,
          audit: auditSink,
        },
        {
          actor,
          purposeVersionId: purpose.purposeVersionId,
          policyVersionId: policy.versionId,
          operationKind: 'data_use_evaluation',
          engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
            '44444444-4444-4444-8444-444444444444',
          ),
          processorId: processor.processorId,
          evidenceId: evidence.evidenceId,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          productionMode: false,
        },
      );

      expect(allowed.status).toBe('evaluated');
      expect(allowed.decision.outcome).toBe('allowed');

      const manualAudit = privacyAuditEventReferenceSchema.parse({
        auditEventId: privacyAuditEventIdSchema.parse(
          '12121212-1212-4121-8121-121212121212',
        ),
        kind: 'authorization_evidence_appended',
        outcome: 'succeeded',
        reasonCode: null,
        policyVersionId: policy.versionId,
        evidenceId: evidence.evidenceId,
        requestId: null,
        operationId: privacyOperationIdSchema.parse(
          '34343434-3434-4343-8343-343434343434',
        ),
        correlationId: privacyCorrelationIdSchema.parse(
          '55555555-5555-4555-8555-555555555555',
        ),
        recordedAt: '2026-08-18T12:01:00.000Z',
      });
      await expect(auditSink.append(manualAudit)).resolves.toBe('accepted');
    });

    it('stores policy/purpose/processor references and evaluates fully on PG ports', async () => {
      await expect(policies.put(policy)).resolves.toBe('accepted');
      await expect(policies.put(policy)).resolves.toBe('conflict');
      await expect(policies.getActive(policy.versionId)).resolves.toEqual(
        policy,
      );

      await expect(purposes.put(purpose)).resolves.toBe('accepted');
      await expect(
        purposes.getVersion(purpose.purposeVersionId),
      ).resolves.toEqual(purpose);

      await expect(processors.put(processor)).resolves.toBe('accepted');
      await expect(
        processors.getDescriptor(processor.processorId),
      ).resolves.toEqual(processor);

      await evidenceLedger.appendEvidence(evidence);

      const synthetic = createSyntheticPrivacyDataUsePorts({
        fixedUtcMs: '2026-08-18T12:00:00.000Z',
      });

      const allowed = await evaluateDataUse(
        {
          clock: synthetic.clock,
          ids: synthetic.ids,
          policies,
          purposes,
          processors,
          evidence: evidenceLedger,
          audit: auditSink,
        },
        {
          actor,
          purposeVersionId: purpose.purposeVersionId,
          policyVersionId: policy.versionId,
          operationKind: 'data_use_evaluation',
          engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
            '44444444-4444-4444-8444-444444444444',
          ),
          processorId: processor.processorId,
          evidenceId: evidence.evidenceId,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          productionMode: false,
        },
      );

      expect(allowed.status).toBe('evaluated');
      expect(allowed.decision.outcome).toBe('allowed');
    });

    it('persists subject-request current pointer and applies domain transitions', async () => {
      await policies.put(policy);

      const request = privacySubjectRequestReferenceSchema.parse({
        requestId: privacySubjectRequestIdSchema.parse(
          '66666666-6666-4666-8666-666666666666',
        ),
        requestType: 'export',
        state: 'verification_required',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: '1'.repeat(64),
        correlationId: privacyCorrelationIdSchema.parse(
          '55555555-5555-4555-8555-555555555555',
        ),
        updatedAt: '2026-08-18T12:00:00.000Z',
      });

      await expect(subjectRequests.put(request)).resolves.toBe('accepted');
      await expect(subjectRequests.put(request)).resolves.toBe('conflict');
      await expect(subjectRequests.get(request.requestId)).resolves.toEqual(
        request,
      );

      const blocked = await subjectRequests.applyTransition({
        requestId: request.requestId,
        next: 'ready',
        updatedAt: '2026-08-18T12:01:00.000Z',
        verification: {
          verificationRefDigest: '2'.repeat(64),
          synthetic: true,
        },
        productionMode: true,
      });
      expect(blocked).toMatchObject({
        status: 'invalid',
        reason: 'synthetic_verification_in_production',
      });

      const advanced = await subjectRequests.applyTransition({
        requestId: request.requestId,
        next: 'ready',
        updatedAt: '2026-08-18T12:02:00.000Z',
        verification: {
          verificationRefDigest: '2'.repeat(64),
          synthetic: true,
        },
        productionMode: false,
      });
      expect(advanced.status).toBe('advanced');
      if (advanced.status !== 'advanced') {
        throw new Error('expected advanced');
      }
      expect(advanced.request.state).toBe('ready');
      await expect(subjectRequests.get(request.requestId)).resolves.toEqual(
        advanced.request,
      );
    });
  },
);

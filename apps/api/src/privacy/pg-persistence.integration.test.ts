import { fileURLToPath } from 'node:url';

import { createPostgresConnection } from '@fitness-os/database';
import {
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacySubjectDataProcessor,
} from '@fitness-os/domain';
import {
  privacyActorContextReferenceSchema,
  privacyCorrelationIdSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyExpectedProcessorInventorySchema,
  privacyGovernanceLifecycleProofReferenceSchema,
  privacyLifecycleProofIdSchema,
  privacyOperationIdSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyProcessorIdSchema,
  privacyPurposeVersionReferenceSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestTransitionIdSchema,
  privacySubjectScopeIdSchema,
  privacySyntheticProcessorStepRecordResponseSchema,
} from '@fitness-os/schemas';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createPrivacyPgPersistence } from './pg-persistence.js';

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/database/drizzle', import.meta.url),
);

function requireDisposableDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  }
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname.slice(1) !== 'fitness_os_prd02_test'
  ) {
    throw new Error(
      'PostgreSQL tests require the local fitness_os_prd02_test database.',
    );
  }
  return value;
}

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

const evidence = privacyEvidenceReferenceSchema.parse({
  evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  purposeId: purpose.purposeId,
  policyVersionId: policy.versionId,
  contentDigest: 'f'.repeat(64),
  recordedAt: '2026-08-18T11:00:00.000Z',
});

const expectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
  privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: processor.inventoryId,
    inventoryVersionDigest: processor.inventoryVersionDigest,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: '579b735',
    processors: [
      {
        processorId: processor.processorId,
        registrationVersion: 1,
        inventoryId: processor.inventoryId,
        descriptorDigest: processor.descriptorDigest,
        codeOwner: processor.codeOwner,
        adapterPackage: '@fitness-os/domain',
        storageKind: 'in_memory_synthetic',
        allowedPurposeIds: processor.allowedPurposeIds,
        allowedCategoryIds: processor.allowedCategoryIds,
        subjectLookupStrategy: 'synthetic_scope_id',
        supportedCapabilities: processor.capabilities,
        unsupportedCapabilities: [
          {
            capability: 'delete',
            rationale: 'deferred_to_later_prd21_slice',
          },
        ],
        recordFamilies: [
          {
            family: 'privacy_audit_event',
            lifecycleAction: 'retain_until_reviewed',
          },
        ],
        environmentApplicability: 'synthetic_only',
        requiredReadiness: 'mechanism_only',
        synthetic: true,
      },
    ],
  }),
);

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'privacy PG persistence synthetic HTTP composition',
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
        sql`TRUNCATE privacy_retention_preview, privacy_governance_lifecycle_proof, privacy_processor_step, privacy_subject_request_transition, privacy_subject_request, privacy_audit_event, privacy_withdrawal, privacy_authorization_evidence, privacy_purpose_version, privacy_processor_registration, privacy_policy_package_version`,
      );
    });

    afterAll(async () => {
      await connection.close();
    });

    it('evaluates data-use against disposable Postgres evidence and audit', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      await expect(persistence.evidence.appendEvidence(evidence)).resolves.toBe(
        'accepted',
      );

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            audit: persistence.audit,
            evidence: persistence.evidence,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            processorResolver: {
              resolve: async (processorId: string) =>
                processorId === processor.processorId
                  ? new SyntheticPrivacySubjectDataProcessor(processor, [])
                  : null,
            },
            expectedInventory: expectedInventory as never,
            subjectRequests: persistence.subjectRequests,
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/data-use-evaluate',
        payload: {
          actor: privacyActorContextReferenceSchema.parse({
            issuer: 'synthetic.identity.v1',
            version: 1,
            principalReferenceDigest: 'e'.repeat(64),
            authorityClaims: ['data_use_evaluate'],
            synthetic: true,
          }),
          purpose,
          policy,
          processor,
          processorCapability: 'access',
          operationKind: 'data_use_evaluation',
          engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
            '44444444-4444-4444-8444-444444444444',
          ),
          evidence,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          productionMode: false,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'evaluated',
        decision: { outcome: 'allowed' },
      });
      await expect(
        persistence.evidence.getEvidence(evidence.evidenceId),
      ).resolves.toEqual(evidence);

      const auditRows = await connection.db.execute<{
        kind: string;
        outcome: string;
      }>(sql`
        SELECT kind, outcome
        FROM privacy_audit_event
        ORDER BY recorded_at
      `);
      expect(auditRows).toEqual([
        { kind: 'data_use_evaluated', outcome: 'succeeded' },
      ]);

      await app.close();
    });

    it('persists withdrawal over disposable Postgres and denies subsequent data-use', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      await expect(persistence.policies.put(policy)).resolves.toBe('accepted');
      await expect(persistence.purposes.put(purpose)).resolves.toBe('accepted');
      await expect(persistence.processors.put(processor)).resolves.toBe(
        'accepted',
      );
      await expect(persistence.evidence.appendEvidence(evidence)).resolves.toBe(
        'accepted',
      );

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            audit: persistence.audit,
            evidence: persistence.evidence,
            policies: persistence.policies,
            purposes: persistence.purposes,
            processors: persistence.processors,
            processorResolver: {
              resolve: async (processorId: string) =>
                processorId === processor.processorId
                  ? new SyntheticPrivacySubjectDataProcessor(processor, [])
                  : null,
            },
            expectedInventory: expectedInventory as never,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            subjectRequests: persistence.subjectRequests,
          },
        },
      );

      const withdrawalId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      const operationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

      const planned = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/withdrawal-plan',
        payload: {
          existing: null,
          withdrawalId,
          evidenceId: evidence.evidenceId,
          operationId,
        },
      });
      expect(planned.statusCode).toBe(200);
      expect(planned.json()).toMatchObject({
        status: 'accepted',
        withdrawal: { state: 'withdrawn', evidenceId: evidence.evidenceId },
      });

      const withdrawalRows = await connection.db.execute<{
        evidence_id: string;
        state: string;
      }>(sql`
        SELECT evidence_id, state
        FROM privacy_withdrawal
        WHERE evidence_id = ${evidence.evidenceId}
      `);
      expect(withdrawalRows).toEqual([
        { evidence_id: evidence.evidenceId, state: 'withdrawn' },
      ]);

      const evaluated = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/data-use-evaluate',
        payload: {
          actor: privacyActorContextReferenceSchema.parse({
            issuer: 'synthetic.identity.v1',
            version: 1,
            principalReferenceDigest: 'e'.repeat(64),
            authorityClaims: ['data_use_evaluate'],
            synthetic: true,
          }),
          purpose,
          policy,
          processor,
          processorCapability: 'access',
          operationKind: 'data_use_evaluation',
          engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
            '44444444-4444-4444-8444-444444444444',
          ),
          evidence,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          productionMode: false,
        },
      });
      expect(evaluated.statusCode).toBe(200);
      expect(evaluated.json()).toMatchObject({
        status: 'evaluated',
        decision: { outcome: 'denied', reasonCode: 'evidence_withdrawn' },
      });

      await app.close();
    });

    it('evaluates data-use against disposable Postgres policy/purpose/processor registries', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      await expect(persistence.policies.put(policy)).resolves.toBe('accepted');
      await expect(persistence.purposes.put(purpose)).resolves.toBe('accepted');
      await expect(persistence.processors.put(processor)).resolves.toBe(
        'accepted',
      );
      await expect(persistence.evidence.appendEvidence(evidence)).resolves.toBe(
        'accepted',
      );

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            audit: persistence.audit,
            evidence: persistence.evidence,
            policies: persistence.policies,
            purposes: persistence.purposes,
            processors: persistence.processors,
            processorResolver: {
              resolve: async (processorId: string) =>
                processorId === processor.processorId
                  ? new SyntheticPrivacySubjectDataProcessor(processor, [])
                  : null,
            },
            expectedInventory: expectedInventory as never,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            subjectRequests: persistence.subjectRequests,
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/data-use-evaluate',
        payload: {
          actor: privacyActorContextReferenceSchema.parse({
            issuer: 'synthetic.identity.v1',
            version: 1,
            principalReferenceDigest: 'e'.repeat(64),
            authorityClaims: ['data_use_evaluate'],
            synthetic: true,
          }),
          purpose,
          policy,
          processor,
          processorCapability: 'access',
          operationKind: 'data_use_evaluation',
          engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
            '44444444-4444-4444-8444-444444444444',
          ),
          evidence,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          productionMode: false,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'evaluated',
        decision: { outcome: 'allowed' },
      });
      await expect(
        persistence.policies.getActive(policy.versionId),
      ).resolves.toEqual(policy);
      await expect(
        persistence.purposes.getVersion(purpose.purposeVersionId),
      ).resolves.toEqual(purpose);
      await expect(
        persistence.processors.getDescriptor(processor.processorId),
      ).resolves.toEqual(processor);

      await app.close();
    });

    it('advances subject-request transitions over disposable Postgres', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      // policy_version_id on privacy_subject_request FKs to policy package.
      await expect(persistence.policies.put(policy)).resolves.toBe('accepted');
      const baseRequest = privacySubjectRequestReferenceSchema.parse({
        requestId: privacySubjectRequestIdSchema.parse(
          '66666666-6666-4666-8666-666666666666',
        ),
        requestType: 'export',
        state: 'received',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: '1'.repeat(64),
        correlationId: privacyCorrelationIdSchema.parse(
          '55555555-5555-4555-8555-555555555555',
        ),
        updatedAt: '2026-08-18T11:00:00.000Z',
      });
      await expect(
        persistence.subjectRequests.createReceived(
          baseRequest,
          '2026-08-18T11:30:00.000Z',
        ),
      ).resolves.toBe('accepted');
      const verificationRequired =
        await persistence.subjectRequests.applyTransition({
          requestId: baseRequest.requestId,
          next: 'verification_required',
          updatedAt: '2026-08-18T11:45:00.000Z',
          transitionId: privacySubjectRequestTransitionIdSchema.parse(
            '99999999-9999-4999-8999-999999999999',
          ),
          operationId: privacyOperationIdSchema.parse(
            '88888888-8888-4888-8888-888888888888',
          ),
          correlationId: baseRequest.correlationId,
          reasonCode: 'forward',
          productionMode: false,
        });
      expect(verificationRequired.status).toBe('advanced');

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            subjectRequests: persistence.subjectRequests,
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/subject-request-transition',
        payload: {
          request: baseRequest,
          next: 'ready',
          transitionId: privacySubjectRequestTransitionIdSchema.parse(
            'a1111111-1111-4111-8111-111111111111',
          ),
          operationId: privacyOperationIdSchema.parse(
            'b2222222-2222-4222-8222-222222222222',
          ),
          correlationId: baseRequest.correlationId,
          reasonCode: 'verification_accepted',
          verification: {
            verificationRefDigest: '2'.repeat(64),
            synthetic: true,
          },
          productionMode: false,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'advanced',
        request: { state: 'ready' },
        transition: {
          previousState: 'verification_required',
          nextState: 'ready',
          reasonCode: 'verification_accepted',
        },
      });

      const requestRows = await connection.db.execute<{
        request_id: string;
        state: string;
      }>(sql`
        SELECT request_id, state
        FROM privacy_subject_request
        WHERE request_id = ${baseRequest.requestId}
      `);
      expect(requestRows).toEqual([
        { request_id: baseRequest.requestId, state: 'ready' },
      ]);

      const transitionRows = await connection.db.execute<{
        previous_state: string;
        next_state: string;
      }>(sql`
        SELECT previous_state, next_state
        FROM privacy_subject_request_transition
        WHERE request_id = ${baseRequest.requestId}
        ORDER BY recorded_at
      `);
      expect(transitionRows).toEqual([
        {
          previous_state: 'received',
          next_state: 'verification_required',
        },
        {
          previous_state: 'verification_required',
          next_state: 'ready',
        },
      ]);

      await app.close();
    });

    it('records a processor step over disposable Postgres and advances the request to completed', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      // policy_version_id on privacy_subject_request FKs to policy package.
      await expect(persistence.policies.put(policy)).resolves.toBe('accepted');
      const requestId = privacySubjectRequestIdSchema.parse(
        '77777777-7777-4777-8777-777777777777',
      );
      const correlationId = privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      );
      const baseRequest = privacySubjectRequestReferenceSchema.parse({
        requestId,
        requestType: 'export',
        state: 'received',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: '1'.repeat(64),
        correlationId,
        updatedAt: '2026-08-18T11:00:00.000Z',
      });
      await expect(
        persistence.subjectRequests.createReceived(
          baseRequest,
          '2026-08-18T11:30:00.000Z',
        ),
      ).resolves.toBe('accepted');
      await expect(
        persistence.subjectRequests.applyTransition({
          requestId,
          next: 'verification_required',
          updatedAt: '2026-08-18T11:45:00.000Z',
          transitionId: privacySubjectRequestTransitionIdSchema.parse(
            'a2222222-2222-4222-8222-222222222222',
          ),
          operationId: privacyOperationIdSchema.parse(
            'b3333333-3333-4333-8333-333333333333',
          ),
          correlationId,
          reasonCode: 'forward',
          productionMode: false,
        }),
      ).resolves.toMatchObject({ status: 'advanced' });
      await expect(
        persistence.subjectRequests.applyTransition({
          requestId,
          next: 'ready',
          updatedAt: '2026-08-18T11:50:00.000Z',
          transitionId: privacySubjectRequestTransitionIdSchema.parse(
            'a3333333-3333-4333-8333-333333333333',
          ),
          operationId: privacyOperationIdSchema.parse(
            'b4444444-4444-4444-8444-444444444444',
          ),
          correlationId,
          reasonCode: 'verification_accepted',
          verification: {
            verificationRefDigest: '2'.repeat(64),
            synthetic: true,
          },
          productionMode: false,
        }),
      ).resolves.toMatchObject({ status: 'advanced' });
      await expect(
        persistence.subjectRequests.applyTransition({
          requestId,
          next: 'in_progress',
          updatedAt: '2026-08-18T11:55:00.000Z',
          transitionId: privacySubjectRequestTransitionIdSchema.parse(
            'a4444444-4444-4444-8444-444444444444',
          ),
          operationId: privacyOperationIdSchema.parse(
            'b5555555-5555-4555-8555-555555555555',
          ),
          correlationId,
          reasonCode: 'forward',
          productionMode: false,
        }),
      ).resolves.toMatchObject({ status: 'advanced' });

      const inventory = await expectedInventory.getInventory();
      const processorStepInventory =
        new SyntheticPrivacyExpectedProcessorInventory(
          privacyExpectedProcessorInventorySchema.parse({
            ...inventory,
            inventoryVersionDigest: '1'.repeat(64),
            processors: inventory.processors.map((entry) => ({
              ...entry,
              supportedCapabilities: [...entry.supportedCapabilities, 'export'],
            })),
          }),
        );

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            expectedInventory: processorStepInventory,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            subjectRequests: persistence.subjectRequests,
            processorSteps: persistence.processorSteps,
          },
        },
      );

      const processorId = '99999999-9999-4999-8999-999999999999';
      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/processor-step-record',
        payload: {
          step: {
            stepId: 'e2222222-2222-4222-8222-222222222222',
            requestId,
            processorId,
            capability: 'export',
            outcome: 'completed',
            operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            correlationId,
          },
          productionMode: false,
        },
      });
      const body = privacySyntheticProcessorStepRecordResponseSchema.parse(
        response.json(),
      );

      expect(response.statusCode).toBe(200);
      expect(body).toMatchObject({
        status: 'advanced',
        completion: 'completed',
        request: { state: 'completed' },
        transition: {
          correlationId,
          operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          transitionId: 'e2222222-2222-4222-8222-222222222222',
        },
      });

      const stepRows = await connection.db.execute<{
        step_id: string;
        outcome: string;
      }>(sql`
        SELECT step_id, outcome
        FROM privacy_processor_step
        WHERE request_id = ${requestId}
      `);
      expect(stepRows).toEqual([
        {
          step_id: 'e2222222-2222-4222-8222-222222222222',
          outcome: 'completed',
        },
      ]);

      await app.close();
    });

    it('lists runtime processors from disposable Postgres registry via GET', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      await expect(persistence.processors.put(processor)).resolves.toBe(
        'accepted',
      );

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            processors: persistence.processors,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
          },
        },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/privacy/synthetic/runtime-processors',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        evaluatedAt: '2026-08-18T12:00:00.000Z',
        runtime: [
          {
            processorId: processor.processorId,
            inventoryId: processor.inventoryId,
            synthetic: true,
          },
        ],
      });

      await app.close();
    });

    it('matches inventory-coverage using PG listDescriptors without body runtime', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      await expect(persistence.processors.put(processor)).resolves.toBe(
        'accepted',
      );

      const expected = privacyExpectedProcessorInventorySchema.parse({
        schemaVersion: 'privacy.processor-inventory.v1',
        inventoryId: processor.inventoryId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        sourceCommit: 'f4502d9',
        processors: [
          {
            processorId: processor.processorId,
            registrationVersion: 1,
            inventoryId: processor.inventoryId,
            descriptorDigest: processor.descriptorDigest,
            codeOwner: processor.codeOwner,
            adapterPackage: '@fitness-os/domain',
            storageKind: 'in_memory_synthetic',
            allowedPurposeIds: processor.allowedPurposeIds,
            allowedCategoryIds: processor.allowedCategoryIds,
            subjectLookupStrategy: 'synthetic_scope_id',
            supportedCapabilities: processor.capabilities,
            unsupportedCapabilities: [
              {
                capability: 'delete',
                rationale: 'deferred_to_later_prd21_slice',
              },
            ],
            recordFamilies: [
              {
                family: 'privacy_audit_event',
                lifecycleAction: 'retain_until_reviewed',
              },
              {
                family: 'privacy_subject_request',
                lifecycleAction: 'retain_until_reviewed',
              },
            ],
            environmentApplicability: 'synthetic_only',
            requiredReadiness: 'mechanism_only',
            synthetic: true,
          },
        ],
      });

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            processors: persistence.processors,
            expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
              expected,
            ) as never,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
          },
        },
      );

      const matched = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/inventory-coverage',
        payload: {},
      });
      expect(matched.statusCode).toBe(200);
      expect(matched.json()).toMatchObject({
        status: 'matched',
        mismatches: [],
        evaluatedAt: '2026-08-18T12:00:00.000Z',
      });

      await app.close();
    });

    it('reports processor_missing from empty PG registry via inventory-coverage', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      const expected = privacyExpectedProcessorInventorySchema.parse({
        schemaVersion: 'privacy.processor-inventory.v1',
        inventoryId: processor.inventoryId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        sourceCommit: 'f4502d9',
        processors: [
          {
            processorId: processor.processorId,
            registrationVersion: 1,
            inventoryId: processor.inventoryId,
            descriptorDigest: processor.descriptorDigest,
            codeOwner: processor.codeOwner,
            adapterPackage: '@fitness-os/domain',
            storageKind: 'in_memory_synthetic',
            allowedPurposeIds: processor.allowedPurposeIds,
            allowedCategoryIds: processor.allowedCategoryIds,
            subjectLookupStrategy: 'synthetic_scope_id',
            supportedCapabilities: processor.capabilities,
            unsupportedCapabilities: [
              {
                capability: 'delete',
                rationale: 'deferred_to_later_prd21_slice',
              },
            ],
            recordFamilies: [
              {
                family: 'privacy_audit_event',
                lifecycleAction: 'retain_until_reviewed',
              },
            ],
            environmentApplicability: 'synthetic_only',
            requiredReadiness: 'mechanism_only',
            synthetic: true,
          },
        ],
      });

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            processors: persistence.processors,
            expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
              expected,
            ) as never,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/inventory-coverage',
        payload: {},
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'mismatched',
        mismatches: [
          {
            processorId: processor.processorId,
            diagnosticCode: 'processor_missing',
          },
        ],
      });

      await app.close();
    });

    it('composes a governance-lifecycle ledger backed by disposable Postgres', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      await expect(persistence.policies.put(policy)).resolves.toBe('accepted');
      const requestId = privacySubjectRequestIdSchema.parse(
        '11111111-1111-4111-8111-111111111111',
      );
      await expect(
        persistence.subjectRequests.createReceived(
          privacySubjectRequestReferenceSchema.parse({
            requestId,
            requestType: 'deletion',
            state: 'received',
            subjectScopeId: '22222222-2222-4222-8222-222222222222',
            verification: null,
            policyVersionId: policy.versionId,
            inventoryVersionDigest: '1'.repeat(64),
            correlationId: '55555555-5555-4555-8555-555555555555',
            updatedAt: '2026-08-18T11:00:00.000Z',
          }),
          '2026-08-18T11:00:00.000Z',
        ),
      ).resolves.toBe('accepted');

      const proof = privacyGovernanceLifecycleProofReferenceSchema.parse({
        requestId,
        processorId: privacyProcessorIdSchema.parse(processor.processorId),
        operationId: privacyOperationIdSchema.parse(
          'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
        ),
        result: {
          outcome: 'completed',
          proofId: privacyLifecycleProofIdSchema.parse(
            'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
          ),
        },
        recordedAt: '2026-08-18T12:00:00.000Z',
        synthetic: true,
      });

      await expect(persistence.governanceLifecycle.append(proof)).resolves.toBe(
        'accepted',
      );
      await expect(persistence.governanceLifecycle.append(proof)).resolves.toBe(
        'conflict',
      );
      await expect(
        persistence.governanceLifecycle.getByOperationId(proof.operationId),
      ).resolves.toEqual(proof);
    });

    it('persists a planned retention preview over disposable Postgres via HTTP write-through', async () => {
      const persistence = createPrivacyPgPersistence(connection);

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            retentionPreviews: persistence.retentionPreviews,
          },
        },
      );

      const previewPayload = {
        policyVersionId: policy.versionId,
        policySynthetic: true,
        inventoryVersionDigest: '3'.repeat(64),
        processorDescriptorDigests: ['c'.repeat(64), 'b'.repeat(64)],
        watermark: '2026-08-18T00:00:00.000Z',
        approvedExceptionIds: [
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ],
        productionMode: false,
      };

      const planned = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/retention-preview',
        payload: previewPayload,
      });
      expect(planned.statusCode).toBe(200);
      expect(planned.json()).toMatchObject({
        status: 'planned',
        preview: { synthetic: true },
      });
      const { selectionDigest } = planned.json().preview;

      const rows = await connection.db.execute<{
        selection_digest: string;
        status: string;
        executed_at: string | null;
      }>(sql`
        SELECT selection_digest, status, executed_at
        FROM privacy_retention_preview
        WHERE selection_digest = ${selectionDigest}
      `);
      expect(rows).toEqual([
        {
          selection_digest: selectionDigest,
          status: 'planned',
          executed_at: null,
        },
      ]);

      // Replaying the identical input is an idempotent no-op: the route
      // treats the resulting 'conflict' from `put` as expected, not an error.
      const replayed = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/retention-preview',
        payload: previewPayload,
      });
      expect(replayed.statusCode).toBe(200);
      expect(replayed.json().preview.selectionDigest).toBe(selectionDigest);

      const rowsAfterReplay = await connection.db.execute<{
        selection_digest: string;
      }>(sql`
        SELECT selection_digest
        FROM privacy_retention_preview
        WHERE selection_digest = ${selectionDigest}
      `);
      expect(rowsAfterReplay).toHaveLength(1);

      await expect(
        persistence.retentionPreviews.getBySelectionDigest(selectionDigest),
      ).resolves.toMatchObject({ selectionDigest, status: 'planned' });

      await app.close();
    });
  },
);

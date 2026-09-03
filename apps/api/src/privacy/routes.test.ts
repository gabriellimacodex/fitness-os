import {
  apiErrorResponseSchema,
  privacyActorContextReferenceSchema,
  privacyAuditEventIdSchema,
  privacyCorrelationIdSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyOperationIdSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyProcessorExecutionReceiptSchema,
  privacyPurposeVersionReferenceSchema,
  privacyExpectedProcessorInventorySchema,
  privacyGovernanceLifecycleBindingSchema,
  privacyReadinessResultSchema,
  privacyRetentionRuleReferenceSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestTransitionIdSchema,
  privacySubjectScopeIdSchema,
  privacySyntheticExpectedInventoryResponseSchema,
  privacySyntheticGovernanceLifecycleRecordResponseSchema,
  privacySyntheticInventoryCoverageResponseSchema,
  privacySyntheticProcessorPlanResponseSchema,
  privacySyntheticProcessorCoordinateResponseSchema,
  privacySyntheticProcessorStepRecordResponseSchema,
  privacySyntheticRuntimeProcessorsResponseSchema,
  privacyWithdrawalIdSchema,
  type PrivacyReadinessResult,
} from '@fitness-os/schemas';
import {
  digestRetentionExecutionInput,
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacyGovernanceLifecycleBindingVerifier,
  SyntheticPrivacyGovernanceLifecycleLedger,
  SyntheticPrivacyProcessorStepRepository,
  SyntheticPrivacyRetentionPreviewRepository,
  SyntheticPrivacyRetentionRuleRepository,
  SyntheticPrivacyRuntimeProcessorRegistry,
  SyntheticPrivacySubjectDataProcessor,
  SyntheticPrivacySubjectRequestRepository,
  SyntheticPrivacyTrustedClock,
} from '@fitness-os/domain';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

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

const retentionRule = privacyRetentionRuleReferenceSchema.parse({
  ruleId: '55555555-5555-4555-8555-555555555555',
  ruleVersionId: '66666666-6666-4666-8666-666666666666',
  engineeringCategoryId: purpose.allowedCategoryIds[0],
  purposeVersionId: purpose.purposeVersionId,
  policyVersionId: policy.versionId,
  action: 'delete',
  parametersDigest: 'e'.repeat(64),
  canonicalizationVersion: 'privacy-governance.canonical.v1',
  synthetic: true,
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

const processorResolver = {
  resolve: async (processorId: string) =>
    processorId === processor.processorId
      ? new SyntheticPrivacySubjectDataProcessor(processor, [])
      : null,
};

const expectedInventoryArtifact = privacyExpectedProcessorInventorySchema.parse(
  {
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
  },
);

const expectedInventoryPort = new SyntheticPrivacyExpectedProcessorInventory(
  expectedInventoryArtifact,
);

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

const evaluatePayload = {
  actor,
  purpose,
  policy,
  processor,
  processorCapability: 'access' as const,
  operationKind: 'data_use_evaluation' as const,
  engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
    '44444444-4444-4444-8444-444444444444',
  ),
  evidence,
  subjectScopeId: privacySubjectScopeIdSchema.parse(
    '22222222-2222-4222-8222-222222222222',
  ),
  productionMode: false,
};

const readyPrivacyComponentIds: PrivacyReadinessResult['components'][number]['componentId'][] =
  [
    'contracts',
    'migrations',
    'repositories',
    'audit_sink',
    'expected_inventory',
    'runtime_processors',
    'governance_lifecycle',
    'identity_boundary',
    'policy_package',
    'recovery',
  ];

const completeSyntheticReadiness: PrivacyReadinessResult = {
  mechanismReady: true,
  productionReady: false,
  canonicalizationVersion: 'privacy-governance.canonical.v1',
  schemaDigest: 'a'.repeat(64),
  inventoryVersionDigest: 'b'.repeat(64),
  components: readyPrivacyComponentIds.map((componentId) => ({
    componentId,
    state: 'ready',
    diagnosticCode: null,
  })),
  diagnosticCodes: ['legal_privacy_decision_required'],
  evaluatedAt: '2026-08-18T12:00:00.000Z',
};

function buildSyntheticPrivacyApp() {
  return buildApp(
    { logger: false },
    {
      allowSyntheticPrivacy: true,
      privacy: {
        fixedUtcMs: '2026-08-18T12:00:00.000Z',
        processorResolver,
        expectedInventory: expectedInventoryPort as never,
      },
    },
  );
}

describe('synthetic privacy composition seam', () => {
  it('rejects privacy composition without the explicit test seam', () => {
    expect(() =>
      buildApp(
        { logger: false },
        {
          privacy: { fixedUtcMs: '2026-08-18T12:00:00.000Z' },
        },
      ),
    ).toThrow('Synthetic privacy composition requires an explicit test seam');
  });

  it('does not expose synthetic privacy routes by default', async () => {
    const app = buildApp({ logger: false });

    const readiness = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/readiness',
    });
    const evaluate = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });
    const transition = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {},
    });
    const withdrawal = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/withdrawal-plan',
      payload: {},
    });
    const retentionPreview = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: {},
    });
    const retentionAuthorize = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {},
    });
    const processorPlan = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-plan',
      payload: {},
    });
    const processorExecute = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-execute',
      payload: {},
    });
    const inventoryCoverage = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    const expectedInventoryGet = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/expected-inventory',
    });
    const runtimeProcessorsGet = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/runtime-processors',
    });

    for (const response of [
      readiness,
      evaluate,
      transition,
      withdrawal,
      retentionPreview,
      retentionAuthorize,
      processorPlan,
      processorExecute,
      inventoryCoverage,
      expectedInventoryGet,
      runtimeProcessorsGet,
    ]) {
      expect(response.statusCode).toBe(404);
      expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
        'NOT_FOUND',
      );
    }

    await app.close();
  });
});

describe('GET /v1/privacy/synthetic/readiness', () => {
  it('fails mechanism readiness closed when complete evidence is not injected', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/readiness',
    });
    const body = privacyReadinessResultSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.mechanismReady).toBe(false);
    expect(body.productionReady).toBe(false);
    expect(body.components).toHaveLength(10);
    expect(body.diagnosticCodes).toContain('migration_missing');
    expect(body.diagnosticCodes).toContain('legal_privacy_decision_required');

    await app.close();
  });

  it('reports mechanism ready only from complete injected evidence', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          readiness: { evaluate: async () => completeSyntheticReadiness },
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/readiness',
    });

    expect(privacyReadinessResultSchema.parse(response.json())).toEqual(
      completeSyntheticReadiness,
    );
    await app.close();
  });

  it('does not let an injected synthetic probe clear the active legal stop', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          readiness: {
            evaluate: async () => ({
              ...completeSyntheticReadiness,
              productionReady: true,
              diagnosticCodes: [],
            }),
          },
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/readiness',
    });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
    await app.close();
  });

  it('stamps readiness and data-use through PrivacyTrustedClock and PrivacyIdFactory', async () => {
    const fixedUtc = '2026-08-19T21:00:00.000Z';
    const fixedCorrelation = privacyCorrelationIdSchema.parse(
      '11111111-1111-4111-8111-111111111111',
    );
    const fixedOperation = privacyOperationIdSchema.parse(
      '22222222-2222-4222-8222-222222222222',
    );
    const fixedAudit = privacyAuditEventIdSchema.parse(
      '33333333-3333-4333-8333-333333333333',
    );
    const fixedScope = privacySubjectScopeIdSchema.parse(
      '44444444-4444-4444-8444-444444444444',
    );
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          clock: new SyntheticPrivacyTrustedClock(fixedUtc),
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
          ids: {
            auditEventId: () => fixedAudit,
            correlationId: () => fixedCorrelation,
            operationId: () => fixedOperation,
            subjectScopeId: () => fixedScope,
          },
        },
      },
    );

    const readiness = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/readiness',
    });
    expect(
      privacyReadinessResultSchema.parse(readiness.json()).evaluatedAt,
    ).toBe(fixedUtc);

    const evaluated = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });
    expect(evaluated.statusCode).toBe(200);
    expect(evaluated.json()).toMatchObject({
      status: 'evaluated',
      decision: {
        outcome: 'allowed',
        evaluatedAt: fixedUtc,
        correlationId: fixedCorrelation,
      },
    });

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/data-use-evaluate', () => {
  it('evaluates an allowed synthetic data-use decision', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: { outcome: 'allowed' },
    });

    await app.close();
  });

  it('fails closed without leaking a bound processor execution error', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: expectedInventoryPort as never,
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => processor,
              execute: async () => {
                throw new Error('raw processor secret');
              },
            }),
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error',
    });
    expect(JSON.stringify(response.json())).not.toContain(
      'raw processor secret',
    );
    await app.close();
  });

  it('denies synthetic actor when productionMode is true', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: {
        ...evaluatePayload,
        productionMode: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: {
        outcome: 'denied',
        reasonCode: 'actor_context_synthetic_in_production',
      },
    });

    await app.close();
  });

  it('rejects unknown keys and missing required fields', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: {
        ...evaluatePayload,
        noticeText: 'forbidden',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/subject-request-transition', () => {
  const baseRequest = privacySubjectRequestReferenceSchema.parse({
    requestId: privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    ),
    requestType: 'export',
    state: 'verification_required',
    subjectScopeId: '22222222-2222-4222-8222-222222222222',
    verification: null,
    policyVersionId: policy.versionId,
    inventoryVersionDigest: '1'.repeat(64),
    correlationId: privacyCorrelationIdSchema.parse(
      '55555555-5555-4555-8555-555555555555',
    ),
    updatedAt: '2026-08-18T11:00:00.000Z',
  });

  const transitionIds = {
    first: privacySubjectRequestTransitionIdSchema.parse(
      'a1111111-1111-4111-8111-111111111111',
    ),
    second: privacySubjectRequestTransitionIdSchema.parse(
      'c3333333-3333-4333-8333-333333333333',
    ),
  };
  const operationIds = {
    first: privacyOperationIdSchema.parse(
      'b2222222-2222-4222-8222-222222222222',
    ),
    second: privacyOperationIdSchema.parse(
      'd4444444-4444-4444-8444-444444444444',
    ),
  };

  it('does not seed a new request in a terminal state', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: { ...baseRequest, state: 'completed' },
        next: 'cancelled',
        transitionId: transitionIds.first,
        operationId: operationIds.first,
        correlationId: baseRequest.correlationId,
        productionMode: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'invalid',
      reason: 'illegal_transition',
    });
    await expect(
      subjectRequests.get(baseRequest.requestId),
    ).resolves.toBeNull();

    await app.close();
  });

  it('uses the trusted server clock when admitting a new request', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: { ...baseRequest, state: 'received' },
        next: 'ready',
        transitionId: transitionIds.first,
        operationId: operationIds.first,
        correlationId: baseRequest.correlationId,
        productionMode: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'invalid',
      reason: 'illegal_transition',
    });
    await expect(
      subjectRequests.get(baseRequest.requestId),
    ).resolves.toMatchObject({
      state: 'received',
      updatedAt: '2026-08-18T12:00:00.000Z',
    });

    await app.close();
  });

  it('conflicts when the same requestId is reused for another subject scope', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(baseRequest);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const first = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: baseRequest,
        next: 'ready',
        transitionId: transitionIds.first,
        operationId: operationIds.first,
        correlationId: baseRequest.correlationId,
        reasonCode: 'verification_accepted',
        verification: {
          verificationRefDigest: '2'.repeat(64),
          synthetic: true,
        },
        productionMode: false,
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: 'advanced' });
    const before = await subjectRequests.listTransitions(baseRequest.requestId);

    const conflicted = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: {
          ...baseRequest,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '33333333-3333-4333-8333-333333333333',
          ),
          state: 'verification_required',
        },
        next: 'ready',
        transitionId: transitionIds.second,
        operationId: operationIds.second,
        correlationId: baseRequest.correlationId,
        reasonCode: 'verification_accepted',
        verification: {
          verificationRefDigest: '2'.repeat(64),
          synthetic: true,
        },
        productionMode: false,
      },
    });
    expect(conflicted.statusCode).toBe(200);
    expect(conflicted.json()).toEqual({ status: 'conflict' });
    await expect(
      subjectRequests.listTransitions(baseRequest.requestId),
    ).resolves.toHaveLength(before.length);
    const stored = await subjectRequests.get(baseRequest.requestId);
    expect(stored?.subjectScopeId).toBe(baseRequest.subjectScopeId);

    await app.close();
  });

  it('advances through the repository and returns append-only history', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(baseRequest);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: baseRequest,
        next: 'ready',
        transitionId: transitionIds.first,
        operationId: operationIds.first,
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
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      status: 'advanced',
      request: { state: 'ready' },
      transition: {
        previousState: 'verification_required',
        nextState: 'ready',
        reasonCode: 'verification_accepted',
      },
    });
    await expect(
      subjectRequests.listTransitions(baseRequest.requestId),
    ).resolves.toHaveLength(1);

    await app.close();
  });

  it('rejects synthetic verification in productionMode', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(baseRequest);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: { subjectRequests: subjectRequests as never },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: baseRequest,
        next: 'ready',
        transitionId: transitionIds.first,
        operationId: operationIds.first,
        correlationId: baseRequest.correlationId,
        verification: {
          verificationRefDigest: '2'.repeat(64),
          synthetic: true,
        },
        productionMode: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'invalid',
      reason: 'synthetic_verification_in_production',
    });

    await app.close();
  });

  it('continues to applyTransition when received creation loses a race', async () => {
    const pointer = { ...baseRequest, state: 'received' as const };
    let gets = 0;
    const subjectRequests = {
      get: async () => {
        gets += 1;
        return gets === 1 ? null : pointer;
      },
      createReceived: async () => 'conflict' as const,
      listTransitions: async () => [],
      applyTransition: async (input: {
        requestId: string;
        next: 'verification_required';
        transitionId: string;
        operationId: string;
      }) => {
        const advanced = {
          ...pointer,
          state: 'verification_required' as const,
          verification: null,
          updatedAt: '2026-08-18T12:00:00.000Z',
        };
        return {
          status: 'advanced' as const,
          request: advanced,
          transition: {
            transitionId: input.transitionId,
            requestId: input.requestId,
            previousState: 'received' as const,
            nextState: 'verification_required' as const,
            operationId: input.operationId,
            correlationId: baseRequest.correlationId,
            reasonCode: 'forward' as const,
            verificationRefDigest: null,
            recordedAt: '2026-08-18T12:00:00.000Z',
          },
        };
      },
    };

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: pointer,
        next: 'verification_required',
        transitionId: transitionIds.first,
        operationId: operationIds.first,
        correlationId: baseRequest.correlationId,
        reasonCode: 'forward',
        productionMode: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'advanced',
      request: { state: 'verification_required' },
      transition: { nextState: 'verification_required' },
    });

    await app.close();
  });

  it('returns conflict when operationId is reused', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(baseRequest);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          subjectRequests: subjectRequests as never,
        },
      },
    );

    await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: baseRequest,
        next: 'ready',
        transitionId: transitionIds.first,
        operationId: operationIds.first,
        correlationId: baseRequest.correlationId,
        reasonCode: 'verification_accepted',
        verification: {
          verificationRefDigest: '2'.repeat(64),
          synthetic: true,
        },
        productionMode: false,
      },
    });

    const conflict = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: {
          ...baseRequest,
          state: 'ready',
          verification: {
            verificationRefDigest: '2'.repeat(64),
            synthetic: true,
          },
          updatedAt: '2026-08-18T12:00:00.000Z',
        },
        next: 'in_progress',
        transitionId: transitionIds.second,
        operationId: operationIds.first,
        correlationId: baseRequest.correlationId,
        reasonCode: 'forward',
        productionMode: false,
      },
    });

    expect(conflict.statusCode).toBe(200);
    expect(conflict.json()).toEqual({ status: 'conflict' });

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/withdrawal-plan', () => {
  it('accepts the first withdrawal and replays the same operation', async () => {
    const app = buildSyntheticPrivacyApp();
    const withdrawalId = privacyWithdrawalIdSchema.parse(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    );
    const operationId = privacyOperationIdSchema.parse(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
    );

    const first = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/withdrawal-plan',
      payload: {
        existing: null,
        withdrawalId,
        evidenceId: evidence.evidenceId,
        operationId,
      },
    });
    expect(first.json()).toMatchObject({
      status: 'accepted',
      withdrawal: { state: 'withdrawn', processingOutcome: 'accepted' },
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/withdrawal-plan',
      payload: {
        existing: first.json().withdrawal,
        withdrawalId,
        evidenceId: evidence.evidenceId,
        operationId,
      },
    });
    expect(replay.json()).toMatchObject({
      status: 'idempotent_replay',
      withdrawal: { processingOutcome: 'idempotent_replay' },
    });
    expect(replay.body).not.toContain('noticeText');

    await app.close();
  });

  it('persists withdrawal through an injected evidence ledger and denies later data-use', async () => {
    const withdrawals = new Map<string, unknown>();
    let appendCalls = 0;
    const evidenceLedger = {
      appendEvidence: async () => 'accepted' as const,
      appendWithdrawal: async (record: {
        evidenceId: string;
        withdrawalId: string;
        operationId: string;
        withdrawnAt: string;
      }) => {
        appendCalls += 1;
        const existing = withdrawals.get(record.evidenceId) as
          | {
              evidenceId: string;
              operationId: string;
              withdrawalId: string;
              state: 'withdrawn';
              withdrawnAt: string;
              processingOutcome: string;
            }
          | undefined;
        if (
          existing &&
          existing.operationId === record.operationId &&
          existing.evidenceId === record.evidenceId
        ) {
          return 'idempotent_replay' as const;
        }
        if (existing?.state === 'withdrawn') {
          return 'already_withdrawn' as const;
        }
        const stored = {
          withdrawalId: record.withdrawalId,
          evidenceId: record.evidenceId,
          state: 'withdrawn' as const,
          withdrawnAt: record.withdrawnAt,
          operationId: record.operationId,
          processingOutcome: 'accepted' as const,
        };
        withdrawals.set(record.evidenceId, stored);
        return 'accepted' as const;
      },
      getAuthoritativeWithdrawal: async (evidenceId: string) =>
        (withdrawals.get(evidenceId) as never) ?? null,
      getEvidence: async (evidenceId: string) =>
        evidenceId === evidence.evidenceId ? evidence : null,
    };

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          evidence: evidenceLedger,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
        },
      },
    );

    const withdrawalId = privacyWithdrawalIdSchema.parse(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    );
    const operationId = privacyOperationIdSchema.parse(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
    );

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
      withdrawal: {
        evidenceId: evidence.evidenceId,
        state: 'withdrawn',
        processingOutcome: 'accepted',
      },
    });
    expect(appendCalls).toBe(1);

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/withdrawal-plan',
      payload: {
        existing: null,
        withdrawalId,
        evidenceId: evidence.evidenceId,
        operationId,
      },
    });
    expect(replay.json()).toMatchObject({
      status: 'idempotent_replay',
      withdrawal: { processingOutcome: 'idempotent_replay' },
    });
    expect(appendCalls).toBe(2);

    const evaluated = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });
    expect(evaluated.statusCode).toBe(200);
    expect(evaluated.json()).toMatchObject({
      status: 'evaluated',
      decision: { outcome: 'denied', reasonCode: 'evidence_withdrawn' },
    });

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/retention-preview', () => {
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

  it('returns a deterministic planned preview without side effects', async () => {
    const app = buildSyntheticPrivacyApp();

    const left = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: previewPayload,
    });
    const right = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: {
        ...previewPayload,
        processorDescriptorDigests: ['b'.repeat(64), 'c'.repeat(64)],
        approvedExceptionIds: [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ],
      },
    });

    expect(left.statusCode).toBe(200);
    expect(left.headers['cache-control']).toBe('no-store');
    expect(left.json()).toMatchObject({
      status: 'planned',
      preview: { synthetic: true },
    });
    expect(left.json().preview.selectionDigest).toBe(
      right.json().preview.selectionDigest,
    );
    expect(left.json().preview.processorDescriptorDigests).toEqual([
      'b'.repeat(64),
      'c'.repeat(64),
    ]);
    expect(left.body).not.toContain('DELETE');

    await app.close();
  });

  it('rejects synthetic policy preview in productionMode', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: {
        ...previewPayload,
        productionMode: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'invalid',
      reason: 'policy_synthetic_in_production',
    });

    await app.close();
  });

  it('persists a planned preview write-through when injected, keyed by selectionDigest', async () => {
    const retentionPreviews = new SyntheticPrivacyRetentionPreviewRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
          retentionPreviews,
        },
      },
    );

    const first = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: previewPayload,
    });
    expect(first.statusCode).toBe(200);
    const selectionDigest = first.json().preview.selectionDigest;

    const stored =
      await retentionPreviews.getBySelectionDigest(selectionDigest);
    expect(stored).toMatchObject({
      selectionDigest,
      status: 'planned',
      createdAt: '2026-08-18T12:00:00.000Z',
      executedAt: null,
    });

    // Replanning the identical input is idempotent write-through: no error
    // surfaced, and the persisted record is unaffected.
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: previewPayload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().preview.selectionDigest).toBe(selectionDigest);

    await app.close();
  });

  it('plans a rule-aware preview and binds the active rule version and digest when retentionRuleSelection is provided', async () => {
    const retentionRules = new SyntheticPrivacyRetentionRuleRepository();
    retentionRules.seed(retentionRule);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
          retentionRules,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: {
        ...previewPayload,
        retentionRuleSelection: {
          engineeringCategoryId: retentionRule.engineeringCategoryId,
          purposeVersionId: retentionRule.purposeVersionId,
          ruleVersionId: retentionRule.ruleVersionId,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'planned',
      preview: { retentionRuleVersionId: retentionRule.ruleVersionId },
    });
    expect(typeof response.json().preview.retentionRuleDigest).toBe('string');
    // Binding the rule into the selection digest changes it from the
    // unconditional plan for otherwise identical input.
    const unconditional = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: previewPayload,
    });
    expect(response.json().preview.selectionDigest).not.toBe(
      unconditional.json().preview.selectionDigest,
    );

    await app.close();
  });

  it('omitting retentionRuleSelection preserves the unconditional plan exactly, with no rule fields in the response', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: previewPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().preview).not.toHaveProperty('retentionRuleDigest');
    expect(response.json().preview).not.toHaveProperty(
      'retentionRuleVersionId',
    );

    await app.close();
  });

  it('fails closed as no_active_retention_rule when retentionRuleSelection is provided but no rule is seeded or injected', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: {
        ...previewPayload,
        retentionRuleSelection: {
          engineeringCategoryId: retentionRule.engineeringCategoryId,
          purposeVersionId: retentionRule.purposeVersionId,
          ruleVersionId: retentionRule.ruleVersionId,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'invalid',
      reason: 'no_active_retention_rule',
    });

    await app.close();
  });

  it('fails closed as retention_rule_policy_mismatch when the active rule carries a different policy version', async () => {
    const mismatchedRule = privacyRetentionRuleReferenceSchema.parse({
      ...retentionRule,
      policyVersionId: '11111111-1111-4111-8111-111111111111',
    });
    const retentionRules = new SyntheticPrivacyRetentionRuleRepository();
    retentionRules.seed(mismatchedRule);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
          retentionRules,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: {
        ...previewPayload,
        retentionRuleSelection: {
          engineeringCategoryId: mismatchedRule.engineeringCategoryId,
          purposeVersionId: mismatchedRule.purposeVersionId,
          ruleVersionId: mismatchedRule.ruleVersionId,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'invalid',
      reason: 'retention_rule_policy_mismatch',
    });

    await app.close();
  });

  it('does not persist rule-aware retentionRuleDigest/retentionRuleVersionId into the retentionPreviews write-through', async () => {
    const retentionRules = new SyntheticPrivacyRetentionRuleRepository();
    retentionRules.seed(retentionRule);
    const retentionPreviews = new SyntheticPrivacyRetentionPreviewRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
          retentionRules,
          retentionPreviews,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-preview',
      payload: {
        ...previewPayload,
        retentionRuleSelection: {
          engineeringCategoryId: retentionRule.engineeringCategoryId,
          purposeVersionId: retentionRule.purposeVersionId,
          ruleVersionId: retentionRule.ruleVersionId,
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const selectionDigest = response.json().preview.selectionDigest;

    const stored =
      await retentionPreviews.getBySelectionDigest(selectionDigest);
    expect(stored).not.toHaveProperty('retentionRuleDigest');
    expect(stored).not.toHaveProperty('retentionRuleVersionId');
    expect(stored).toMatchObject({ selectionDigest, status: 'planned' });

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/retention-execution-authorize', () => {
  it('authorizes from the persisted preview and trusted current runtime evidence', async () => {
    const selectionDigest = 'f'.repeat(64);
    const retentionPreviews = new SyntheticPrivacyRetentionPreviewRepository();
    await retentionPreviews.put({
      policyVersionId: policy.versionId,
      inventoryVersionDigest: expectedInventoryArtifact.inventoryVersionDigest,
      processorDescriptorDigests: [processor.descriptorDigest],
      watermark: '2026-08-18T11:00:00.000Z',
      selectionDigest,
      approvedExceptionIds: [],
      synthetic: true,
      status: 'planned',
      createdAt: '2026-08-18T11:30:00.000Z',
      executedAt: null,
    });
    const processors = new SyntheticPrivacyRuntimeProcessorRegistry();
    processors.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: expectedInventoryPort,
          processors,
          retentionPreviews,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: false,
        requestedSelectionDigest: selectionDigest,
        previewTtlMs: 60 * 60 * 1000,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'executed' });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: false,
        requestedSelectionDigest: selectionDigest,
        previewTtlMs: 60 * 60 * 1000,
      },
    });
    expect(replay.json()).toEqual({ status: 'idempotent_replay' });

    const changedTtl = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: false,
        requestedSelectionDigest: selectionDigest,
        previewTtlMs: 30 * 60 * 1000,
      },
    });
    expect(changedTtl.json()).toEqual({ status: 'conflict' });

    const conflict = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '22222222-2222-4222-8222-222222222222',
        productionMode: false,
        requestedSelectionDigest: selectionDigest,
        previewTtlMs: 60 * 60 * 1000,
      },
    });
    expect(conflict.json()).toEqual({ status: 'conflict' });
    await expect(
      retentionPreviews.getBySelectionDigest(selectionDigest),
    ).resolves.toMatchObject({
      executedAt: '2026-08-18T12:00:00.000Z',
      status: 'executed',
    });

    await app.close();
  });

  it('rejects caller-supplied preview state and digest booleans', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        productionMode: false,
        policySynthetic: true,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );

    await app.close();
  });

  it('returns 503 when persisted preview evidence is unavailable', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: expectedInventoryPort,
          processors: new SyntheticPrivacyRuntimeProcessorRegistry(),
          retentionPreviews: {
            getBySelectionDigest: async () => {
              throw new Error('preview store unavailable');
            },
            markExecuted: async () => 'conflict' as const,
            put: async () => 'accepted' as const,
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: false,
        requestedSelectionDigest: 'f'.repeat(64),
        previewTtlMs: 60 * 60 * 1000,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );

    await app.close();
  });

  it('returns 503 when the trusted clock is unavailable', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          clock: {
            nowUtcMs: () => {
              throw new Error('trusted clock unavailable');
            },
          },
          retentionPreviews: {
            getBySelectionDigest: async () => null,
            markExecuted: async () => 'not_found' as const,
            put: async () => 'accepted' as const,
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: false,
        requestedSelectionDigest: 'f'.repeat(64),
        previewTtlMs: 60 * 60 * 1000,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );

    await app.close();
  });

  it('returns 503 without claiming execution when the atomic transition is unavailable', async () => {
    const selectionDigest = '9'.repeat(64);
    const preview = {
      policyVersionId: policy.versionId,
      inventoryVersionDigest: expectedInventoryArtifact.inventoryVersionDigest,
      processorDescriptorDigests: [processor.descriptorDigest],
      watermark: '2026-08-18T11:00:00.000Z',
      selectionDigest,
      approvedExceptionIds: [],
      synthetic: true as const,
      status: 'planned' as const,
      createdAt: '2026-08-18T11:30:00.000Z',
      executedAt: null,
    };
    const processors = new SyntheticPrivacyRuntimeProcessorRegistry();
    processors.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: expectedInventoryPort,
          processors,
          retentionPreviews: {
            getBySelectionDigest: async () => preview,
            markExecuted: async () => {
              throw new Error('transition unavailable');
            },
            put: async () => 'accepted' as const,
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: false,
        requestedSelectionDigest: selectionDigest,
        previewTtlMs: 60 * 60 * 1000,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );

    await app.close();
  });

  it('replays the persisted winning operation without consulting current evidence again', async () => {
    const selectionDigest = '8'.repeat(64);
    const operationId = privacyOperationIdSchema.parse(
      '44444444-4444-4444-8444-444444444444',
    );
    const retentionPreviews = new SyntheticPrivacyRetentionPreviewRepository();
    await retentionPreviews.put({
      policyVersionId: policy.versionId,
      inventoryVersionDigest: expectedInventoryArtifact.inventoryVersionDigest,
      processorDescriptorDigests: [processor.descriptorDigest],
      watermark: '2026-08-18T11:00:00.000Z',
      selectionDigest,
      approvedExceptionIds: [],
      synthetic: true,
      status: 'planned',
      createdAt: '2026-08-18T11:30:00.000Z',
      executedAt: null,
    });
    await retentionPreviews.markExecuted({
      selectionDigest,
      inputDigest: digestRetentionExecutionInput({
        previewTtlMs: 60 * 60 * 1000,
        requestedSelectionDigest: selectionDigest,
      }),
      operationId,
      executedAt: '2026-08-18T12:00:00.000Z',
    });
    let currentEvidenceReads = 0;
    const unavailable = () => {
      currentEvidenceReads += 1;
      throw new Error('current evidence unavailable');
    };
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          clock: { nowUtcMs: unavailable },
          expectedInventory: { getInventory: async () => unavailable() },
          processors: {
            getDescriptor: async () => unavailable(),
            listDescriptors: async () => unavailable(),
            put: async () => unavailable(),
          },
          retentionPreviews,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId,
        productionMode: false,
        requestedSelectionDigest: selectionDigest,
        previewTtlMs: 60 * 60 * 1000,
      },
    });

    expect(response.json()).toEqual({ status: 'idempotent_replay' });
    expect(currentEvidenceReads).toBe(0);

    await app.close();
  });

  it('fails closed when trusted preview or current-runtime ports are absent', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: false,
        requestedSelectionDigest: 'f'.repeat(64),
        previewTtlMs: 60 * 60 * 1000,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reason: 'preview_mismatch',
      status: 'hard_disabled',
    });

    await app.close();
  });

  it('does not consume an expired planned preview', async () => {
    const selectionDigest = 'e'.repeat(64);
    const retentionPreviews = new SyntheticPrivacyRetentionPreviewRepository();
    await retentionPreviews.put({
      policyVersionId: policy.versionId,
      inventoryVersionDigest: expectedInventoryArtifact.inventoryVersionDigest,
      processorDescriptorDigests: [processor.descriptorDigest],
      watermark: '2026-08-18T10:00:00.000Z',
      selectionDigest,
      approvedExceptionIds: [],
      synthetic: true,
      status: 'planned',
      createdAt: '2026-08-18T10:00:00.000Z',
      executedAt: null,
    });
    const processors = new SyntheticPrivacyRuntimeProcessorRegistry();
    processors.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: expectedInventoryPort,
          processors,
          retentionPreviews,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '33333333-3333-4333-8333-333333333333',
        productionMode: false,
        requestedSelectionDigest: selectionDigest,
        previewTtlMs: 60 * 60 * 1000,
      },
    });

    expect(response.json()).toEqual({
      reason: 'preview_expired_or_executed',
      status: 'hard_disabled',
    });
    await expect(
      retentionPreviews.getBySelectionDigest(selectionDigest),
    ).resolves.toMatchObject({ status: 'planned', executedAt: null });

    await app.close();
  });

  it('hard-disables production execution before considering synthetic evidence', async () => {
    let evidenceReads = 0;
    const unavailable = () => {
      evidenceReads += 1;
      throw new Error('must not read evidence for production');
    };
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          clock: { nowUtcMs: unavailable },
          expectedInventory: { getInventory: async () => unavailable() },
          processors: {
            getDescriptor: async () => unavailable(),
            listDescriptors: async () => unavailable(),
            put: async () => unavailable(),
          },
          retentionPreviews: {
            getBySelectionDigest: async () => unavailable(),
            markExecuted: async () => unavailable(),
            put: async () => unavailable(),
          },
        },
      },
    );

    const production = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        operationId: '11111111-1111-4111-8111-111111111111',
        productionMode: true,
        requestedSelectionDigest: 'f'.repeat(64),
        previewTtlMs: 60 * 60 * 1000,
      },
    });
    expect(production.statusCode).toBe(200);
    expect(production.json()).toMatchObject({
      status: 'hard_disabled',
      reason: 'production_path',
    });
    expect(evidenceReads).toBe(0);

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/processor-execute', () => {
  it('completes synthetic inventory and denies productionMode synthetic', async () => {
    const app = buildSyntheticPrivacyApp();

    const inventory = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-execute',
      payload: {
        descriptor: processor,
        families: ['privacy_audit_event', 'privacy_subject_request'],
        command: {
          processorId: processor.processorId,
          capability: 'inventory',
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          correlationId: privacyCorrelationIdSchema.parse(
            '55555555-5555-4555-8555-555555555555',
          ),
          operationId: privacyOperationIdSchema.parse(
            'ffffffff-ffff-4fff-8fff-ffffffffffff',
          ),
          productionMode: false,
        },
      },
    });

    expect(inventory.statusCode).toBe(200);
    expect(inventory.headers['cache-control']).toBe('no-store');
    expect(inventory.json()).toMatchObject({
      status: 'completed',
      capability: 'inventory',
    });
    expect(inventory.json().families).toHaveLength(2);

    const denied = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-execute',
      payload: {
        descriptor: processor,
        families: ['privacy_audit_event'],
        command: {
          processorId: processor.processorId,
          capability: 'inventory',
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          correlationId: privacyCorrelationIdSchema.parse(
            '55555555-5555-4555-8555-555555555555',
          ),
          operationId: privacyOperationIdSchema.parse(
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ),
          productionMode: true,
        },
      },
    });

    expect(denied.statusCode).toBe(200);
    expect(denied.json()).toMatchObject({
      status: 'denied',
      reasonCode: 'synthetic_processor_in_production',
    });

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/data-use-evaluate with injected registries', () => {
  it('loads policy/purpose/processor from injected ports without in-memory seed', async () => {
    let getActiveCalls = 0;
    let getVersionCalls = 0;
    let getDescriptorCalls = 0;

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          policies: {
            getActive: async (versionId: string) => {
              getActiveCalls += 1;
              return versionId === policy.versionId ? policy : null;
            },
            put: async () => 'accepted' as const,
          },
          purposes: {
            getVersion: async (purposeVersionId: string) => {
              getVersionCalls += 1;
              return purposeVersionId === purpose.purposeVersionId
                ? purpose
                : null;
            },
            put: async () => 'accepted' as const,
          },
          processors: {
            getDescriptor: async (processorId: string) => {
              getDescriptorCalls += 1;
              return processorId === processor.processorId ? processor : null;
            },
            listDescriptors: async () => [processor],
            put: async () => 'accepted' as const,
          },
          processorResolver: {
            resolve: async (processorId: string) =>
              processorId === processor.processorId
                ? new SyntheticPrivacySubjectDataProcessor(processor, [])
                : null,
          },
          expectedInventory: expectedInventoryPort as never,
          evidence: {
            appendEvidence: async () => 'accepted' as const,
            appendWithdrawal: async () => 'accepted' as const,
            getAuthoritativeWithdrawal: async () => null,
            getEvidence: async (evidenceId: string) =>
              evidenceId === evidence.evidenceId ? evidence : null,
          },
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: { outcome: 'allowed' },
    });
    expect(getActiveCalls).toBeGreaterThan(0);
    expect(getVersionCalls).toBeGreaterThan(0);
    expect(getDescriptorCalls).toBeGreaterThan(0);

    await app.close();
  });

  it('denies with purpose_unknown when injected purpose registry is empty', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          policies: {
            getActive: async () => policy,
            put: async () => 'accepted' as const,
          },
          purposes: {
            getVersion: async () => null,
            put: async () => 'accepted' as const,
          },
          processors: {
            getDescriptor: async () => processor,
            listDescriptors: async () => [processor],
            put: async () => 'accepted' as const,
          },
          evidence: {
            appendEvidence: async () => 'accepted' as const,
            appendWithdrawal: async () => 'accepted' as const,
            getAuthoritativeWithdrawal: async () => null,
            getEvidence: async (evidenceId: string) =>
              evidenceId === evidence.evidenceId ? evidence : null,
          },
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: { outcome: 'denied', reasonCode: 'purpose_unknown' },
    });

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/data-use-evaluate with injected evidence ledger', () => {
  it('reads evidence from the injected disposable ledger without in-memory seed', async () => {
    let getCalls = 0;
    const evidenceLedger = {
      appendEvidence: async () => {
        throw new Error('injected ledger must not append from the route');
      },
      appendWithdrawal: async () => {
        throw new Error('injected ledger must not withdraw from the route');
      },
      getAuthoritativeWithdrawal: async () => null,
      getEvidence: async (evidenceId: string) => {
        getCalls += 1;
        return evidenceId === evidence.evidenceId ? evidence : null;
      },
    };

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          evidence: evidenceLedger,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: { outcome: 'allowed' },
    });
    expect(getCalls).toBeGreaterThan(0);

    await app.close();
  });

  it('appends audit events through the injected audit sink', async () => {
    const evidenceLedger = {
      appendEvidence: async () => {
        throw new Error('injected ledger must not append from the route');
      },
      appendWithdrawal: async () => {
        throw new Error('injected ledger must not withdraw from the route');
      },
      getAuthoritativeWithdrawal: async () => null,
      getEvidence: async (evidenceId: string) =>
        evidenceId === evidence.evidenceId ? evidence : null,
    };
    const auditEvents: unknown[] = [];
    const audit = {
      append: async (event: unknown) => {
        auditEvents.push(event);
        return 'accepted' as const;
      },
    };

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          audit,
          evidence: evidenceLedger,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: { outcome: 'allowed' },
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      kind: 'data_use_evaluated',
      outcome: 'succeeded',
      policyVersionId: policy.versionId,
    });

    await app.close();
  });

  it('denies when injected attribution verifier reports unattributed', async () => {
    let executions = 0;

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: expectedInventoryPort as never,
          attributionVerifier: {
            verify: async () => ({ status: 'unattributed' as const }),
          },
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => processor,
              execute: async () => {
                executions += 1;
                throw new Error('must not execute');
              },
            }),
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: {
        outcome: 'denied',
        reasonCode: 'policy_unattributed',
      },
    });
    expect(executions).toBe(0);
    await app.close();
  });

  it('denies when injected integrity verifier reports invalid policy digest', async () => {
    let executions = 0;

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: expectedInventoryPort as never,
          integrityVerifier: {
            verify: async () => ({ status: 'invalid' as const }),
          },
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => processor,
              execute: async () => {
                executions += 1;
                throw new Error('must not execute');
              },
            }),
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: {
        outcome: 'denied',
        reasonCode: 'policy_integrity_invalid',
      },
    });
    expect(executions).toBe(0);
    await app.close();
  });

  it('denies and never executes when expected inventory omits the processor (H3)', async () => {
    let executions = 0;
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => processor,
              execute: async () => {
                executions += 1;
                throw new Error('must not execute');
              },
            }),
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'evaluated',
      decision: {
        outcome: 'denied',
        reasonCode: 'processor_undeclared',
      },
    });
    expect(executions).toBe(0);
    await app.close();
  });

  it('returns 503 when the injected audit sink is unavailable', async () => {
    const evidenceLedger = {
      appendEvidence: async () => {
        throw new Error('injected ledger must not append from the route');
      },
      appendWithdrawal: async () => {
        throw new Error('injected ledger must not withdraw from the route');
      },
      getAuthoritativeWithdrawal: async () => null,
      getEvidence: async (evidenceId: string) =>
        evidenceId === evidence.evidenceId ? evidence : null,
    };
    const audit = {
      append: async () => 'unavailable' as const,
    };

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          audit,
          evidence: evidenceLedger,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
          expectedInventory: expectedInventoryPort as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/data-use-evaluate',
      payload: evaluatePayload,
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      status: 'audit_unavailable',
      decision: {
        outcome: 'denied',
        reasonCode: 'audit_unavailable',
      },
    });

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/processor-plan', () => {
  const expected = privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: processor.inventoryId,
    inventoryVersionDigest: processor.inventoryVersionDigest,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: 'ebab024',
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

  it('plans a step for a supported capability', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-plan',
      payload: { requestType: 'access', expected },
    });
    const body = privacySyntheticProcessorPlanResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      status: 'planned',
      steps: [{ processorId: processor.processorId, capability: 'access' }],
      excluded: [],
    });

    await app.close();
  });

  it('excludes a processor with a declared exemption rationale', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-plan',
      payload: { requestType: 'deletion', expected },
    });
    const body = privacySyntheticProcessorPlanResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'planned',
      steps: [],
      excluded: [
        {
          processorId: processor.processorId,
          capability: 'delete',
          rationale: 'deferred_to_later_prd21_slice',
        },
      ],
    });

    await app.close();
  });

  it('reports undeclared processors as incomplete', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-plan',
      payload: { requestType: 'export', expected },
    });
    const body = privacySyntheticProcessorPlanResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'incomplete',
      undeclaredProcessorIds: [processor.processorId],
    });

    await app.close();
  });

  it('reports empty_inventory for a zero-processor inventory', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-plan',
      payload: {
        requestType: 'access',
        expected: { ...expected, processors: [] },
      },
    });
    const body = privacySyntheticProcessorPlanResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({ status: 'empty_inventory' });

    await app.close();
  });

  it('rejects a malformed request body', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-plan',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/processor-coordinate', () => {
  it('executes the server-selected synthetic step and advances the request', async () => {
    const requestId = privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    );
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    const boundProcessor = new SyntheticPrivacySubjectDataProcessor(
      processor,
      [],
    );
    let executions = 0;
    subjectRequests.seedForTest(
      privacySubjectRequestReferenceSchema.parse({
        requestId,
        requestType: 'access',
        state: 'in_progress',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
        correlationId: '55555555-5555-4555-8555-555555555555',
        updatedAt: '2026-08-18T12:00:00.000Z',
      }),
    );
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: expectedInventoryPort,
          fixedUtcMs: '2026-08-18T12:03:00.000Z',
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => boundProcessor.descriptorReference(),
              execute: async (command) => {
                executions += 1;
                return boundProcessor.execute(command);
              },
            }),
          },
          subjectRequests,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: {
        requestId,
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: false,
      },
    });
    const body = privacySyntheticProcessorCoordinateResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'advanced',
      completion: 'completed',
      request: { state: 'completed' },
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: {
        requestId,
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: false,
      },
    });
    expect(replay.json()).toMatchObject({ status: 'already_terminal' });
    expect(executions).toBe(1);
    await app.close();
  });

  it('hard-disables production before reading request, plan, or processor ports', async () => {
    let reads = 0;
    const unavailable = () => {
      reads += 1;
      throw new Error('must not read');
    };
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: { getInventory: async () => unavailable() },
          processorResolver: { resolve: async () => unavailable() },
          processorSteps: {
            append: async () => unavailable(),
            listForRequest: async () => unavailable(),
          } as never,
          subjectRequests: {
            applyTransition: async () => unavailable(),
            createReceived: async () => unavailable(),
            get: async () => unavailable(),
            listTransitions: async () => unavailable(),
          } as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: {
        requestId: '66666666-6666-4666-8666-666666666666',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: true,
      },
    });

    expect(response.json()).toEqual({
      status: 'hard_disabled',
      reason: 'production_path',
    });
    expect(reads).toBe(0);
    await app.close();
  });

  it('returns reconciliation_required for a durable unfinished reservation without executing', async () => {
    const requestId = privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    );
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(
      privacySubjectRequestReferenceSchema.parse({
        requestId,
        requestType: 'access',
        state: 'in_progress',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
        correlationId: '55555555-5555-4555-8555-555555555555',
        updatedAt: '2026-08-18T12:00:00.000Z',
      }),
    );
    let executions = 0;
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: expectedInventoryPort,
          processorExecutionJournal: {
            complete: async () => 'conflict',
            getByOperationId: async () => null,
            markReconciliationRequired: async () => 'accepted',
            reserve: async () => ({ status: 'reconciliation_required' }),
          },
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => processor,
              execute: async () => {
                executions += 1;
                throw new Error('must not execute');
              },
            }),
          },
          subjectRequests,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: {
        requestId,
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'reconciliation_required' });
    expect(executions).toBe(0);
    await app.close();
  });

  it('advances from trusted reconciliation evidence without executing again', async () => {
    const requestId = privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    );
    const operationId = privacyOperationIdSchema.parse(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
    );
    const correlationId = privacyCorrelationIdSchema.parse(
      '55555555-5555-4555-8555-555555555555',
    );
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(
      privacySubjectRequestReferenceSchema.parse({
        requestId,
        requestType: 'access',
        state: 'in_progress',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
        correlationId,
        updatedAt: '2026-08-18T12:00:00.000Z',
      }),
    );
    let completedRecord: unknown = null;
    let executions = 0;
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: expectedInventoryPort,
          fixedUtcMs: '2026-08-18T12:04:00.000Z',
          processorExecutionJournal: {
            complete: async () => 'conflict',
            getByOperationId: async () => completedRecord as never,
            markReconciliationRequired: async () => 'accepted',
            reconcileCompletion: async (record) => {
              completedRecord = record;
              return 'accepted';
            },
            reserve: async () => ({ status: 'reconciliation_required' }),
          },
          processorExecutionReceipts: {
            listByOperationId: async () => [
              {
                requestId,
                processorId: processor.processorId,
                capability: 'access',
                outcome: 'completed',
                operationId,
                correlationId,
              },
            ],
          },
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => processor,
              execute: async () => {
                executions += 1;
                throw new Error('must not execute');
              },
            }),
          },
          subjectRequests,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: { requestId, operationId, productionMode: false },
    });

    expect(response.json()).toMatchObject({
      status: 'advanced',
      completion: 'completed',
    });
    expect(executions).toBe(0);
    expect(completedRecord).toMatchObject({
      state: 'completed',
      outcome: 'completed',
    });
    await app.close();
  });

  it('rejects caller-selected processor, capability, outcome, and step identity', async () => {
    const app = buildSyntheticPrivacyApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: {
        requestId: '66666666-6666-4666-8666-666666666666',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: false,
        processorId: processor.processorId,
        capability: 'access',
        outcome: 'completed',
        stepId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );
    await app.close();
  });

  it('rejects a malformed processor result before appending a step', async () => {
    const requestId = privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    );
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(
      privacySubjectRequestReferenceSchema.parse({
        requestId,
        requestType: 'access',
        state: 'in_progress',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
        correlationId: '55555555-5555-4555-8555-555555555555',
        updatedAt: '2026-08-18T12:00:00.000Z',
      }),
    );
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: expectedInventoryPort,
          processorResolver: {
            resolve: async () => ({
              descriptorReference: () => processor,
              execute: async () => ({ raw: 'untrusted output' }) as never,
            }),
          },
          processorSteps,
          subjectRequests,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: {
        requestId,
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: false,
      },
    });

    expect(response.json()).toEqual({ status: 'receipt_invalid' });
    await expect(processorSteps.listForRequest(requestId)).resolves.toEqual([]);
    await app.close();
  });

  it('does not resolve, execute, timestamp, or append a fresh operation after completion', async () => {
    const requestId = privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    );
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(
      privacySubjectRequestReferenceSchema.parse({
        requestId,
        requestType: 'access',
        state: 'completed',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: policy.versionId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
        correlationId: '55555555-5555-4555-8555-555555555555',
        updatedAt: '2026-08-18T12:00:00.000Z',
      }),
    );
    let resolverReads = 0;
    let clockReads = 0;
    let appends = 0;
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          clock: {
            nowUtcMs: () => {
              clockReads += 1;
              return '2026-08-18T12:03:00.000Z';
            },
          },
          expectedInventory: expectedInventoryPort,
          processorResolver: {
            resolve: async () => {
              resolverReads += 1;
              throw new Error('must not resolve');
            },
          },
          processorSteps: {
            append: async () => {
              appends += 1;
              return 'accepted';
            },
            listForRequest: async () => [],
          },
          subjectRequests,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-coordinate',
      payload: {
        requestId,
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: false,
      },
    });

    expect(response.json()).toEqual({ status: 'request_not_executable' });
    expect({ appends, clockReads, resolverReads }).toEqual({
      appends: 0,
      clockReads: 0,
      resolverReads: 0,
    });
    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/processor-step-record', () => {
  const stepRequestId = privacySubjectRequestIdSchema.parse(
    '66666666-6666-4666-8666-666666666666',
  );
  const processorA = '99999999-9999-4999-8999-999999999999';
  const processorB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const stepInventory = (processorIds: readonly string[]) =>
    new SyntheticPrivacyExpectedProcessorInventory(
      privacyExpectedProcessorInventorySchema.parse({
        schemaVersion: 'privacy.processor-inventory.v1',
        inventoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        inventoryVersionDigest: '1'.repeat(64),
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        sourceCommit: 'a35c289',
        processors: processorIds.map((processorId, index) => ({
          processorId,
          registrationVersion: 1,
          inventoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          descriptorDigest: String(index + 1).repeat(64),
          codeOwner: 'packages.domain.privacy',
          adapterPackage: '@fitness-os/domain',
          storageKind: 'in_memory_synthetic',
          allowedPurposeIds: [],
          allowedCategoryIds: [],
          subjectLookupStrategy: 'synthetic_scope_id',
          supportedCapabilities: ['export'],
          unsupportedCapabilities: [],
          recordFamilies: [
            {
              family: 'privacy_export_metadata',
              lifecycleAction: 'retain_until_reviewed',
            },
          ],
          environmentApplicability: 'synthetic_only',
          requiredReadiness: 'mechanism_only',
          synthetic: true,
        })),
      }),
    );

  const seedRequest = (
    state: 'in_progress' | 'partially_failed' | 'completed',
  ) =>
    privacySubjectRequestReferenceSchema.parse({
      requestId: stepRequestId,
      requestType: 'export',
      state,
      subjectScopeId: '22222222-2222-4222-8222-222222222222',
      verification: null,
      policyVersionId: policy.versionId,
      inventoryVersionDigest: '1'.repeat(64),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      updatedAt: '2026-08-18T12:00:00.000Z',
    });

  const step = (overrides: Record<string, unknown> = {}) => ({
    stepId: 'e1111111-1111-4111-8111-111111111111',
    requestId: stepRequestId,
    processorId: processorA,
    capability: 'export',
    operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    correlationId: '55555555-5555-4555-8555-555555555555',
    ...overrides,
  });

  const executionReceipt = (overrides: Record<string, unknown> = {}) =>
    privacyProcessorExecutionReceiptSchema.parse({
      requestId: stepRequestId,
      processorId: processorA,
      capability: 'export',
      outcome: 'completed',
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
      ...overrides,
    });

  const executionReceipts = (overrides: Record<string, unknown> = {}) => ({
    listByOperationId: async () => [executionReceipt(overrides)],
  });

  const basePayload = (overrides: Record<string, unknown> = {}) => ({
    step: step(),
    productionMode: false,
    ...overrides,
  });

  it('reports request_not_found for an unknown request', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });
    const body = privacySyntheticProcessorStepRecordResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toEqual({ status: 'request_not_found' });

    await app.close();
  });

  it('records the step but stays incomplete while an expected pair has not reported', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          processorExecutionReceipts: executionReceipts({
            outcome: 'permanent_failure',
          }),
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: stepInventory([processorA, processorB]),
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });
    const body = privacySyntheticProcessorStepRecordResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'recorded',
      completion: 'incomplete',
    });
    await expect(subjectRequests.get(stepRequestId)).resolves.toMatchObject({
      state: 'in_progress',
    });
    await expect(
      processorSteps.listForRequest(stepRequestId),
    ).resolves.toMatchObject([
      {
        outcome: 'permanent_failure',
        recordedAt: '2026-08-18T12:00:00.000Z',
      },
    ]);

    await app.close();
  });

  it('fails closed without a trusted expected inventory', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: { processorSteps, subjectRequests: subjectRequests as never },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });

    expect(response.json()).toEqual({ status: 'plan_unavailable' });
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it('fails closed when the request-pinned inventory digest changed', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const currentInventory = await stepInventory([processorA]).getInventory();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: {
            getInventory: async () => ({
              ...currentInventory,
              inventoryVersionDigest: '2'.repeat(64),
            }),
          },
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });

    expect(response.json()).toEqual({ status: 'inventory_mismatch' });
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it('fails closed when the trusted request plan is incomplete', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: stepInventory([]),
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });

    expect(response.json()).toEqual({ status: 'plan_incomplete' });
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it('rejects a processor step that is absent from the trusted plan', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: stepInventory([processorA]),
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload({
        step: step({ processorId: processorB }),
      }),
    });

    expect(response.json()).toEqual({ status: 'step_not_planned' });
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it('rejects step correlation that differs from the pinned request', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: stepInventory([processorA]),
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload({
        step: step({
          correlationId: '77777777-7777-4777-8777-777777777777',
        }),
      }),
    });

    expect(response.json()).toEqual({ status: 'binding_mismatch' });
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it('fails closed without an independent processor execution receipt source', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: stepInventory([processorA]),
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });

    expect(response.json()).toEqual({
      status: 'execution_receipt_unavailable',
    });
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it.each([
    ['missing', []],
    ['ambiguous', [executionReceipt(), executionReceipt()]],
    [
      'mismatched',
      [executionReceipt({ outcome: 'completed', processorId: processorB })],
    ],
  ])(
    'rejects %s independent processor execution evidence before append',
    async (_case, receipts) => {
      const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
      subjectRequests.seedForTest(seedRequest('in_progress'));
      const processorSteps = new SyntheticPrivacyProcessorStepRepository();
      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            expectedInventory: stepInventory([processorA]),
            processorExecutionReceipts: {
              listByOperationId: async () => receipts,
            },
            processorSteps,
            subjectRequests: subjectRequests as never,
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/processor-step-record',
        payload: basePayload(),
      });

      expect(response.json()).toEqual({
        status: 'execution_receipt_invalid',
      });
      await expect(
        processorSteps.listForRequest(stepRequestId),
      ).resolves.toEqual([]);
      await app.close();
    },
  );

  it('returns 503 without appending when processor receipt evidence is unavailable', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: stepInventory([processorA]),
          processorExecutionReceipts: {
            listByOperationId: () => {
              throw new Error('processor receipt unavailable');
            },
          },
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });

    expect(response.statusCode).toBe(503);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it('returns 503 without appending when the trusted clock is unavailable', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          clock: {
            nowUtcMs: () => {
              throw new Error('clock unavailable');
            },
          },
          expectedInventory: stepInventory([processorA]),
          processorExecutionReceipts: executionReceipts(),
          processorSteps,
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });

    expect(response.statusCode).toBe(503);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );
    await expect(processorSteps.listForRequest(stepRequestId)).resolves.toEqual(
      [],
    );
    await app.close();
  });

  it('advances an in_progress request to completed once the expected step is recorded', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          processorExecutionReceipts: executionReceipts(),
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: stepInventory([processorA]),
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
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
        correlationId: '55555555-5555-4555-8555-555555555555',
        nextState: 'completed',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        transitionId: 'e1111111-1111-4111-8111-111111111111',
      },
    });

    await app.close();
  });

  it('resumes a transition dropped after a crash between append and transition, on replay of the same step', async () => {
    // Simulates a process that crashed between the step append committing and
    // the follow-on transition running: the step is durably recorded via the
    // shared processorSteps repository, but the request is still sitting
    // in_progress. Replaying the exact same step over HTTP must recover the
    // dropped transition rather than reporting step_conflict forever.
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('in_progress'));
    const processorSteps = new SyntheticPrivacyProcessorStepRepository();
    await processorSteps.append({
      ...step(),
      outcome: 'completed',
      recordedAt: '2026-08-18T12:02:00.000Z',
    } as never);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          processorExecutionReceipts: executionReceipts(),
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: stepInventory([processorA]),
          subjectRequests: subjectRequests as never,
          processorSteps: processorSteps as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });
    const body = privacySyntheticProcessorStepRecordResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'advanced',
      completion: 'completed',
      request: { state: 'completed' },
    });
    await expect(
      processorSteps.listForRequest(stepRequestId),
    ).resolves.toHaveLength(1);

    await app.close();
  });

  it('reports already_terminal and appends no further transition for a terminal request', async () => {
    const subjectRequests = new SyntheticPrivacySubjectRequestRepository();
    subjectRequests.seedForTest(seedRequest('completed'));
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          processorExecutionReceipts: executionReceipts(),
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          expectedInventory: stepInventory([processorA]),
          subjectRequests: subjectRequests as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload(),
    });
    const body = privacySyntheticProcessorStepRecordResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'already_terminal',
      completion: 'completed',
    });

    await app.close();
  });

  it('hard-disables production before reading coordinator evidence', async () => {
    let evidenceReads = 0;
    const unavailable = () => {
      evidenceReads += 1;
      throw new Error('must not read');
    };
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          clock: { nowUtcMs: unavailable },
          expectedInventory: { getInventory: async () => unavailable() },
          processorExecutionReceipts: {
            listByOperationId: async () => unavailable(),
          },
          processorSteps: {
            append: async () => unavailable(),
            listForRequest: async () => unavailable(),
          } as never,
          subjectRequests: {
            applyTransition: async () => unavailable(),
            createReceived: async () => unavailable(),
            get: async () => unavailable(),
            listTransitions: async () => unavailable(),
          } as never,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload({ productionMode: true }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reason: 'production_path',
      status: 'hard_disabled',
    });
    expect(evidenceReads).toBe(0);

    await app.close();
  });

  it('rejects a malformed request body', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );

    await app.close();
  });

  it('rejects a caller-supplied processor outcome at the HTTP boundary', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/processor-step-record',
      payload: basePayload({
        step: { ...step(), outcome: 'completed' },
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/governance-lifecycle-record', () => {
  const lifecycleRequestId = privacySubjectRequestIdSchema.parse(
    '77777777-7777-4777-8777-777777777777',
  );
  const lifecycleProcessorId = '99999999-9999-4999-8999-999999999999';

  const basePayload = (overrides: Record<string, unknown> = {}) => ({
    requestId: lifecycleRequestId,
    processorId: lifecycleProcessorId,
    operationId: privacyOperationIdSchema.parse(
      'c3333333-3333-4333-8333-333333333333',
    ),
    result: {
      outcome: 'completed',
      proofId: 'd4444444-4444-4444-8444-444444444444',
    },
    ...overrides,
  });

  const createVerifiedComposition = () => {
    const governanceLifecycle = new SyntheticPrivacyGovernanceLifecycleLedger();
    const governanceLifecycleVerifier =
      new SyntheticPrivacyGovernanceLifecycleBindingVerifier();
    governanceLifecycleVerifier.seal(basePayload());

    return {
      governanceLifecycle,
      governanceLifecycleVerifier,
      app: buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            governanceLifecycle,
            governanceLifecycleVerifier,
          },
        },
      ),
    };
  };

  it('records a governance-lifecycle proof, forcing synthetic/recordedAt server-side', async () => {
    const { app } = createVerifiedComposition();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });
    const body = privacySyntheticGovernanceLifecycleRecordResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toEqual({
      status: 'recorded',
      proof: {
        requestId: lifecycleRequestId,
        processorId: lifecycleProcessorId,
        operationId: 'c3333333-3333-4333-8333-333333333333',
        result: {
          outcome: 'completed',
          proofId: 'd4444444-4444-4444-8444-444444444444',
        },
        recordedAt: '2026-08-18T12:00:00.000Z',
        synthetic: true,
      },
    });

    await app.close();
  });

  it('records only after an independent execution-receipt source verifies the binding', async () => {
    const governanceLifecycle = new SyntheticPrivacyGovernanceLifecycleLedger();
    const receipt =
      privacyGovernanceLifecycleBindingSchema.parse(basePayload());
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          governanceExecutionReceipts: {
            listByOperationId: async () => [receipt],
          },
          governanceLifecycle,
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });

    expect(response.statusCode).toBe(200);
    await expect(
      governanceLifecycle.getByOperationId(receipt.operationId),
    ).resolves.toMatchObject(receipt);

    await app.close();
  });

  it('returns the stored proof as a conflict on an exact operationId replay', async () => {
    const { app } = createVerifiedComposition();

    const first = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });
    const body = privacySyntheticGovernanceLifecycleRecordResponseSchema.parse(
      replay.json(),
    );

    expect(replay.statusCode).toBe(200);
    expect(body.status).toBe('conflict');
    expect(body.proof.result).toEqual({
      outcome: 'completed',
      proofId: 'd4444444-4444-4444-8444-444444444444',
    });

    await app.close();
  });

  it.each([
    ['request', { requestId: '88888888-8888-4888-8888-888888888888' }],
    ['processor', { processorId: '88888888-8888-4888-8888-888888888888' }],
    ['operation', { operationId: '88888888-8888-4888-8888-888888888888' }],
    ['result', { result: { outcome: 'denied' } }],
    ['synthetic marker', { synthetic: false }],
    ['malformed timestamp', { recordedAt: 'not-a-trusted-time' }],
  ])(
    'fails closed when conflict evidence has a mismatched %s',
    async (_field, mismatch) => {
      const governanceLifecycleVerifier =
        new SyntheticPrivacyGovernanceLifecycleBindingVerifier();
      governanceLifecycleVerifier.seal(basePayload());
      const existing = {
        ...basePayload(),
        recordedAt: '2026-08-18T12:00:00.000Z',
        synthetic: true,
        ...mismatch,
      };
      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            governanceLifecycleVerifier,
            governanceLifecycle: {
              append: async () => 'conflict' as const,
              getByOperationId: async () => existing as never,
            },
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/governance-lifecycle-record',
        payload: basePayload(),
      });

      expect(response.statusCode).toBe(503);
      expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
        'SERVICE_UNAVAILABLE',
      );
      await app.close();
    },
  );

  it('fails closed with zero appends when no exact sealed binding exists', async () => {
    let appendCalls = 0;
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          governanceLifecycle: {
            append: async () => {
              appendCalls += 1;
              return 'accepted' as const;
            },
            getByOperationId: async () => null,
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );
    expect(appendCalls).toBe(0);
    await app.close();
  });

  it.each([
    ['request', { requestId: '88888888-8888-4888-8888-888888888888' }],
    ['processor', { processorId: '88888888-8888-4888-8888-888888888888' }],
    ['operation', { operationId: '88888888-8888-4888-8888-888888888888' }],
    ['result', { result: { outcome: 'denied' } }],
  ])(
    'rejects a mismatched %s binding before append',
    async (_field, mismatch) => {
      const governanceLifecycleVerifier =
        new SyntheticPrivacyGovernanceLifecycleBindingVerifier();
      governanceLifecycleVerifier.seal(basePayload());
      let appendCalls = 0;
      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            governanceLifecycleVerifier,
            governanceLifecycle: {
              append: async () => {
                appendCalls += 1;
                return 'accepted' as const;
              },
              getByOperationId: async () => null,
            },
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/governance-lifecycle-record',
        payload: basePayload(mismatch),
      });

      expect(response.statusCode).toBe(400);
      expect(appendCalls).toBe(0);
      await app.close();
    },
  );

  it('rejects ambiguous sealed bindings before append', async () => {
    const governanceLifecycleVerifier =
      new SyntheticPrivacyGovernanceLifecycleBindingVerifier();
    governanceLifecycleVerifier.seal(basePayload());
    governanceLifecycleVerifier.seal(
      basePayload({ result: { outcome: 'denied' } }),
    );
    let appendCalls = 0;
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          governanceLifecycleVerifier,
          governanceLifecycle: {
            append: async () => {
              appendCalls += 1;
              return 'accepted' as const;
            },
            getByOperationId: async () => null,
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });

    expect(response.statusCode).toBe(400);
    expect(appendCalls).toBe(0);
    await app.close();
  });

  it('returns 503 with zero appends when binding verification is unavailable', async () => {
    let appendCalls = 0;
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          governanceLifecycleVerifier: {
            verify: async () => {
              throw new Error('sealed evidence unavailable');
            },
          },
          governanceLifecycle: {
            append: async () => {
              appendCalls += 1;
              return 'accepted' as const;
            },
            getByOperationId: async () => null,
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });

    expect(response.statusCode).toBe(503);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );
    expect(appendCalls).toBe(0);
    await app.close();
  });

  it('returns 503 without claiming a record when the ledger is unavailable', async () => {
    const governanceLifecycleVerifier =
      new SyntheticPrivacyGovernanceLifecycleBindingVerifier();
    governanceLifecycleVerifier.seal(basePayload());
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          governanceLifecycleVerifier,
          governanceLifecycle: {
            append: async () => {
              throw new Error('ledger unavailable');
            },
            getByOperationId: async () => null,
          },
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: basePayload(),
    });

    expect(response.statusCode).toBe(503);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );
    await app.close();
  });

  it('rejects a malformed request body', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/governance-lifecycle-record',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'BAD_REQUEST',
    );

    await app.close();
  });
});

describe('POST /v1/privacy/synthetic/inventory-coverage', () => {
  const expected = privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: processor.inventoryId,
    inventoryVersionDigest: processor.inventoryVersionDigest,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: 'ebab024',
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

  it('reports matched coverage for expected vs runtime descriptors', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {
        expected,
        runtime: [processor],
      },
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      status: 'matched',
      mismatches: [],
      evaluatedAt: '2026-08-18T12:00:00.000Z',
    });

    await app.close();
  });

  it('reports mismatched coverage when a runtime processor is missing', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {
        expected,
        runtime: [],
      },
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('mismatched');
    expect(body.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticCode: 'processor_missing',
          processorId: processor.processorId,
        }),
      ]),
    );

    await app.close();
  });

  it('loads runtime descriptors from PrivacyRuntimeProcessorRegistry when omitted', async () => {
    const registry = new SyntheticPrivacyRuntimeProcessorRegistry();
    registry.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expected,
          ) as never,
          // Dual zod brand across package boundaries.
          processors: registry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'matched',
      mismatches: [],
    });
    await app.close();

    const bare = buildSyntheticPrivacyApp();
    const rejected = await bare.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {
        expected,
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(rejected.json()).error.code).toBe(
      'BAD_REQUEST',
    );
    await bare.close();
  });

  it('loads expected inventory from PrivacyExpectedProcessorInventoryPort when omitted', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          // Dual zod brand across package boundaries.
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
      payload: {
        runtime: [processor],
      },
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'matched',
      mismatches: [],
    });
    await app.close();

    const bare = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
        },
      },
    );
    const rejected = await bare.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {
        runtime: [processor],
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(rejected.json()).error.code).toBe(
      'BAD_REQUEST',
    );
    await bare.close();
  });
});

describe('GET /v1/privacy/synthetic/expected-inventory', () => {
  const expected = privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: processor.inventoryId,
    inventoryVersionDigest: processor.inventoryVersionDigest,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: 'a39ece5',
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

  it('returns 404 when expectedInventory port is not injected', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
          processorResolver,
        },
      },
    );
    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/expected-inventory',
    });
    expect(response.statusCode).toBe(404);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'NOT_FOUND',
    );
    await app.close();
  });

  it('returns injected expected inventory stamped by TrustedClock', async () => {
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expected,
          ) as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/expected-inventory',
    });
    const body = privacySyntheticExpectedInventoryResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      evaluatedAt: '2026-08-18T12:00:00.000Z',
      inventory: {
        inventoryId: processor.inventoryId,
        inventoryVersionDigest: processor.inventoryVersionDigest,
      },
    });
    await app.close();
  });
});

describe('GET /v1/privacy/synthetic/runtime-processors', () => {
  it('returns 404 when processors registry is not injected', async () => {
    const app = buildSyntheticPrivacyApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/runtime-processors',
    });
    expect(response.statusCode).toBe(404);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'NOT_FOUND',
    );
    await app.close();
  });

  it('returns injected runtime descriptors stamped by TrustedClock', async () => {
    const registry = new SyntheticPrivacyRuntimeProcessorRegistry();
    registry.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          // Dual zod brand across package boundaries.
          processors: registry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/runtime-processors',
    });
    const body = privacySyntheticRuntimeProcessorsResponseSchema.parse(
      response.json(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      evaluatedAt: '2026-08-18T12:00:00.000Z',
    });
    expect(body.runtime).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          processorId: processor.processorId,
          inventoryId: processor.inventoryId,
        }),
      ]),
    );
    await app.close();
  });
});

describe('synthetic inventory triad (GET expected + GET runtime + coverage)', () => {
  const expected = privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: processor.inventoryId,
    inventoryVersionDigest: processor.inventoryVersionDigest,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: 'b1a4f90',
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

  it('matches coverage from injected ports without request bodies for inventory', async () => {
    const registry = new SyntheticPrivacyRuntimeProcessorRegistry();
    registry.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expected,
          ) as never,
          processors: registry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const expectedGet = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/expected-inventory',
    });
    expect(
      privacySyntheticExpectedInventoryResponseSchema.parse(expectedGet.json())
        .inventory.inventoryId,
    ).toBe(processor.inventoryId);

    const runtimeGet = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/runtime-processors',
    });
    expect(
      privacySyntheticRuntimeProcessorsResponseSchema.parse(runtimeGet.json())
        .runtime,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ processorId: processor.processorId }),
      ]),
    );

    const coverage = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    expect(
      privacySyntheticInventoryCoverageResponseSchema.parse(coverage.json()),
    ).toMatchObject({
      status: 'matched',
      mismatches: [],
      evaluatedAt: '2026-08-18T12:00:00.000Z',
    });

    await app.close();
  });

  it('reports processor_missing when runtime registry is empty via ports', async () => {
    const emptyRegistry = new SyntheticPrivacyRuntimeProcessorRegistry();
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expected,
          ) as never,
          processors: emptyRegistry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const runtimeGet = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/runtime-processors',
    });
    expect(
      privacySyntheticRuntimeProcessorsResponseSchema.parse(runtimeGet.json())
        .runtime,
    ).toEqual([]);

    const coverage = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      coverage.json(),
    );

    expect(coverage.statusCode).toBe(200);
    expect(body.status).toBe('mismatched');
    expect(body.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticCode: 'processor_missing',
          processorId: processor.processorId,
        }),
      ]),
    );

    await app.close();
  });

  it('reports inventory_mismatch for undeclared runtime processors via ports', async () => {
    const undeclared = privacyProcessorDescriptorReferenceSchema.parse({
      ...processor,
      processorId: '88888888-8888-4888-8888-888888888888',
      descriptorDigest: 'e'.repeat(64),
    });
    const registry = new SyntheticPrivacyRuntimeProcessorRegistry();
    registry.seed(processor);
    registry.seed(undeclared);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expected,
          ) as never,
          processors: registry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const coverage = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      coverage.json(),
    );

    expect(coverage.statusCode).toBe(200);
    expect(body.status).toBe('mismatched');
    expect(body.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticCode: 'inventory_mismatch',
          detail: 'undeclared_runtime_processor',
          processorId: undeclared.processorId,
        }),
      ]),
    );

    await app.close();
  });

  it('reports handler_missing when runtime lacks an expected capability via ports', async () => {
    const expectedWithExport = privacyExpectedProcessorInventorySchema.parse({
      ...expected,
      sourceCommit: '05cc79f',
      processors: [
        {
          ...expected.processors[0],
          supportedCapabilities: ['access', 'inventory', 'export'],
        },
      ],
    });
    const registry = new SyntheticPrivacyRuntimeProcessorRegistry();
    // Runtime still only advertises access/inventory.
    registry.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expectedWithExport,
          ) as never,
          processors: registry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const coverage = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      coverage.json(),
    );

    expect(coverage.statusCode).toBe(200);
    expect(body.status).toBe('mismatched');
    expect(body.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticCode: 'handler_missing',
          detail: 'missing_handler:export',
          processorId: processor.processorId,
        }),
      ]),
    );

    await app.close();
  });

  it('reports inventory_mismatch for missing expected purpose via ports', async () => {
    const extraPurposeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const baseProcessor = expected.processors[0];
    if (baseProcessor === undefined) {
      throw new Error('expected processor fixture missing');
    }
    const expectedWithExtraPurpose =
      privacyExpectedProcessorInventorySchema.parse({
        ...expected,
        sourceCommit: '96ef13b',
        processors: [
          {
            ...baseProcessor,
            allowedPurposeIds: [
              ...baseProcessor.allowedPurposeIds,
              extraPurposeId,
            ],
          },
        ],
      });
    const registry = new SyntheticPrivacyRuntimeProcessorRegistry();
    registry.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expectedWithExtraPurpose,
          ) as never,
          processors: registry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const coverage = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      coverage.json(),
    );

    expect(coverage.statusCode).toBe(200);
    expect(body.status).toBe('mismatched');
    expect(body.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticCode: 'inventory_mismatch',
          detail: `missing_purpose:${extraPurposeId}`,
          processorId: processor.processorId,
        }),
      ]),
    );

    await app.close();
  });

  it('reports inventory_mismatch for missing expected category via ports', async () => {
    const extraCategoryId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const baseProcessor = expected.processors[0];
    if (baseProcessor === undefined) {
      throw new Error('expected processor fixture missing');
    }
    const expectedWithExtraCategory =
      privacyExpectedProcessorInventorySchema.parse({
        ...expected,
        sourceCommit: '027281e',
        processors: [
          {
            ...baseProcessor,
            allowedCategoryIds: [
              ...baseProcessor.allowedCategoryIds,
              extraCategoryId,
            ],
          },
        ],
      });
    const registry = new SyntheticPrivacyRuntimeProcessorRegistry();
    registry.seed(processor);
    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
            expectedWithExtraCategory,
          ) as never,
          processors: registry as never,
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
        },
      },
    );

    const coverage = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/inventory-coverage',
      payload: {},
    });
    const body = privacySyntheticInventoryCoverageResponseSchema.parse(
      coverage.json(),
    );

    expect(coverage.statusCode).toBe(200);
    expect(body.status).toBe('mismatched');
    expect(body.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagnosticCode: 'inventory_mismatch',
          detail: `missing_category:${extraCategoryId}`,
          processorId: processor.processorId,
        }),
      ]),
    );

    await app.close();
  });
});

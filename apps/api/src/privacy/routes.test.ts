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
  privacyPurposeVersionReferenceSchema,
  privacyExpectedProcessorInventorySchema,
  privacyReadinessResultSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestTransitionIdSchema,
  privacySubjectScopeIdSchema,
  privacySyntheticExpectedInventoryResponseSchema,
  privacySyntheticInventoryCoverageResponseSchema,
  privacySyntheticRuntimeProcessorsResponseSchema,
  privacyWithdrawalIdSchema,
} from '@fitness-os/schemas';
import {
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacyRuntimeProcessorRegistry,
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

const evaluatePayload = {
  actor,
  purpose,
  policy,
  processor,
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

function buildSyntheticPrivacyApp() {
  return buildApp(
    { logger: false },
    {
      allowSyntheticPrivacy: true,
      privacy: { fixedUtcMs: '2026-08-18T12:00:00.000Z' },
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
  it('reports mechanism ready while production stays blocked by LEGAL_PRIVACY', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/synthetic/readiness',
    });
    const body = privacyReadinessResultSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.mechanismReady).toBe(true);
    expect(body.productionReady).toBe(false);
    expect(body.diagnosticCodes).toContain('legal_privacy_decision_required');

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

  it('advances through the repository and returns append-only history', async () => {
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
    const app = buildSyntheticPrivacyApp();

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

  it('continues to applyTransition when seed put loses a create race', async () => {
    const pointer = { ...baseRequest };
    let gets = 0;
    const subjectRequests = {
      get: async () => {
        gets += 1;
        return gets === 1 ? null : pointer;
      },
      put: async () => 'conflict' as const,
      listTransitions: async () => [],
      applyTransition: async (input: {
        requestId: string;
        next: 'ready';
        transitionId: string;
        operationId: string;
      }) => {
        const advanced = {
          ...pointer,
          state: 'ready' as const,
          verification: {
            verificationRefDigest: '2'.repeat(64),
            synthetic: true,
          },
          updatedAt: '2026-08-18T12:00:00.000Z',
        };
        return {
          status: 'advanced' as const,
          request: advanced,
          transition: {
            transitionId: input.transitionId,
            requestId: input.requestId,
            previousState: 'verification_required' as const,
            nextState: 'ready' as const,
            operationId: input.operationId,
            correlationId: baseRequest.correlationId,
            reasonCode: 'verification_accepted' as const,
            verificationRefDigest: '2'.repeat(64),
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
    expect(response.json()).toMatchObject({
      status: 'advanced',
      request: { state: 'ready' },
      transition: { nextState: 'ready' },
    });

    await app.close();
  });

  it('returns conflict when operationId is reused', async () => {
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
});

describe('POST /v1/privacy/synthetic/retention-execution-authorize', () => {
  it('hard-disables production execution and allows disposable synthetic tests', async () => {
    const app = buildSyntheticPrivacyApp();

    const production = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/retention-execution-authorize',
      payload: {
        productionMode: true,
        policySynthetic: true,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      },
    });
    expect(production.json()).toMatchObject({
      status: 'hard_disabled',
      reason: 'production_path',
    });

    const synthetic = await app.inject({
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
    expect(synthetic.json()).toEqual({ status: 'allowed_synthetic_test' });

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

    const bare = buildSyntheticPrivacyApp();
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
    const app = buildSyntheticPrivacyApp();
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
});

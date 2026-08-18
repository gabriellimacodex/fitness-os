import {
  apiErrorResponseSchema,
  privacyActorContextReferenceSchema,
  privacyCorrelationIdSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyOperationIdSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacyReadinessResultSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
  privacySubjectScopeIdSchema,
  privacyWithdrawalIdSchema,
} from '@fitness-os/schemas';
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

    for (const response of [
      readiness,
      evaluate,
      transition,
      withdrawal,
      retentionPreview,
      retentionAuthorize,
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

  it('advances to ready with verification outside productionMode', async () => {
    const app = buildSyntheticPrivacyApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/privacy/synthetic/subject-request-transition',
      payload: {
        request: baseRequest,
        next: 'ready',
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
    });

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

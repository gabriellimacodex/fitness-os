import {
  apiErrorResponseSchema,
  privacyActorContextReferenceSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacyReadinessResultSchema,
  privacySubjectScopeIdSchema,
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

    expect(readiness.statusCode).toBe(404);
    expect(evaluate.statusCode).toBe(404);
    expect(apiErrorResponseSchema.parse(readiness.json()).error.code).toBe(
      'NOT_FOUND',
    );

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

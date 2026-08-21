import {
  privacyActorContextReferenceSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacySubjectScopeIdSchema,
} from '@fitness-os/schemas';
import { SyntheticPrivacySubjectDataProcessor } from '@fitness-os/domain';
import { describe, expect, it, vi } from 'vitest';

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

const evidence = privacyEvidenceReferenceSchema.parse({
  evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  purposeId: purpose.purposeId,
  policyVersionId: policy.versionId,
  contentDigest: 'f'.repeat(64),
  recordedAt: '2026-08-18T11:00:00.000Z',
});

const auditEvents: unknown[] = [];
const append = async (event: unknown) => {
  auditEvents.push(event);
  return 'accepted' as const;
};
let getEvidenceCalls = 0;
const getEvidence = async (evidenceId: string) => {
  getEvidenceCalls += 1;
  return evidenceId === evidence.evidenceId ? evidence : null;
};
const subjectRequests = {
  applyTransition: async () => ({ status: 'conflict' as const }),
  get: async () => null,
  listTransitions: async () => [],
  put: async () => 'accepted' as const,
};

let getActiveCalls = 0;
let getVersionCalls = 0;
let getDescriptorCalls = 0;

const policies = {
  getActive: async (versionId: string) => {
    getActiveCalls += 1;
    return versionId === policy.versionId ? policy : null;
  },
  put: async () => 'accepted' as const,
};

const purposes = {
  getVersion: async (purposeVersionId: string) => {
    getVersionCalls += 1;
    return purposeVersionId === purpose.purposeVersionId ? purpose : null;
  },
  put: async () => 'accepted' as const,
};

const processors = {
  getDescriptor: async (processorId: string) => {
    getDescriptorCalls += 1;
    return processorId === processor.processorId ? processor : null;
  },
  listDescriptors: async () => [processor],
  put: async () => 'accepted' as const,
};

vi.mock('@fitness-os/database', () => ({
  createPostgresPrivacyAuditSink: vi.fn(() => ({ append })),
  createPostgresPrivacyAuthorizationEvidenceLedger: vi.fn(() => ({
    appendEvidence: async () => 'accepted' as const,
    appendWithdrawal: async () => 'accepted' as const,
    getAuthoritativeWithdrawal: async () => null,
    getEvidence,
  })),
  createPostgresPrivacySubjectRequestRepository: vi.fn(() => subjectRequests),
  createPostgresPrivacyPolicyPackageRepository: vi.fn(() => policies),
  createPostgresPrivacyPurposeRegistry: vi.fn(() => purposes),
  createPostgresPrivacyRuntimeProcessorRegistry: vi.fn(() => processors),
}));

import {
  createPostgresPrivacyAuditSink,
  createPostgresPrivacyAuthorizationEvidenceLedger,
  createPostgresPrivacyPolicyPackageRepository,
  createPostgresPrivacyPurposeRegistry,
  createPostgresPrivacyRuntimeProcessorRegistry,
  createPostgresPrivacySubjectRequestRepository,
} from '@fitness-os/database';

import { createPrivacyPgPersistence } from './pg-persistence.js';

describe('privacy PG persistence bundle', () => {
  it('composes disposable evidence, audit, subject-request, and registry ports', () => {
    const connection = { db: {}, close: async () => undefined } as never;
    const persistence = createPrivacyPgPersistence(connection);

    expect(
      createPostgresPrivacyAuthorizationEvidenceLedger,
    ).toHaveBeenCalledWith(connection);
    expect(createPostgresPrivacyAuditSink).toHaveBeenCalledWith(connection);
    expect(createPostgresPrivacySubjectRequestRepository).toHaveBeenCalledWith(
      connection,
    );
    expect(createPostgresPrivacyPolicyPackageRepository).toHaveBeenCalledWith(
      connection,
    );
    expect(createPostgresPrivacyPurposeRegistry).toHaveBeenCalledWith(
      connection,
    );
    expect(createPostgresPrivacyRuntimeProcessorRegistry).toHaveBeenCalledWith(
      connection,
    );
    expect(persistence.evidence.getEvidence).toBe(getEvidence);
    expect(persistence.audit.append).toBe(append);
    expect(persistence.subjectRequests).toBe(subjectRequests);
    expect(persistence.policies).toBe(policies);
    expect(persistence.purposes).toBe(purposes);
    expect(persistence.processors).toBe(processors);
  });

  it('drives synthetic data-use-evaluate over the composed bundle ports', async () => {
    auditEvents.length = 0;
    getEvidenceCalls = 0;
    getActiveCalls = 0;
    getVersionCalls = 0;
    getDescriptorCalls = 0;

    const connection = { db: {}, close: async () => undefined } as never;
    const persistence = createPrivacyPgPersistence(connection);

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
    expect(getEvidenceCalls).toBeGreaterThan(0);
    expect(getActiveCalls).toBeGreaterThan(0);
    expect(getVersionCalls).toBeGreaterThan(0);
    expect(getDescriptorCalls).toBeGreaterThan(0);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      kind: 'data_use_evaluated',
      outcome: 'succeeded',
    });

    await app.close();
  });

  it('denies when injected policy registry has no matching version', async () => {
    getActiveCalls = 0;

    const emptyPolicies = {
      getActive: async () => {
        getActiveCalls += 1;
        return null;
      },
      put: async () => 'accepted' as const,
    };

    const app = buildApp(
      { logger: false },
      {
        allowSyntheticPrivacy: true,
        privacy: {
          policies: emptyPolicies,
          purposes,
          processors,
          evidence: {
            appendEvidence: async () => 'accepted' as const,
            appendWithdrawal: async () => 'accepted' as const,
            getAuthoritativeWithdrawal: async () => null,
            getEvidence,
          },
          fixedUtcMs: '2026-08-18T12:00:00.000Z',
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
      decision: { outcome: 'denied', reasonCode: 'policy_missing' },
    });
    expect(getActiveCalls).toBeGreaterThan(0);

    await app.close();
  });
});

import {
  privacyActorContextReferenceSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacySubjectScopeIdSchema,
  privacyWithdrawalIdSchema,
  privacyWithdrawalReferenceSchema,
  privacyOperationIdSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  authoritativeEvidenceState,
  createSyntheticPrivacyDataUsePorts,
  evaluateDataUse,
  planWithdrawal,
} from '../src/privacy-governance/index.js';

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

const categoryId = privacyEngineeringCategoryIdSchema.parse(
  '44444444-4444-4444-8444-444444444444',
);
const subjectScopeId = privacySubjectScopeIdSchema.parse(
  '22222222-2222-4222-8222-222222222222',
);

function seedHappyPath() {
  const ports = createSyntheticPrivacyDataUsePorts();
  ports.policies.seed(policy);
  ports.purposes.seed(purpose);
  ports.processors.seed(processor);
  ports.evidence.seedEvidence(evidence);
  return ports;
}

describe('evaluateDataUse', () => {
  it('allows a synthetic evaluation and appends a succeeded audit event', async () => {
    const ports = seedHappyPath();

    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      evidenceId: evidence.evidenceId,
      subjectScopeId,
      productionMode: false,
    });

    expect(result.status).toBe('evaluated');
    expect(result.decision.outcome).toBe('allowed');
    expect(ports.audit.events).toHaveLength(1);
    expect(ports.audit.events[0]?.outcome).toBe('succeeded');
  });

  it('denies withdrawn evidence and still audits the denial', async () => {
    const ports = seedHappyPath();
    ports.evidence.seedWithdrawal(
      privacyWithdrawalReferenceSchema.parse({
        withdrawalId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        evidenceId: evidence.evidenceId,
        state: 'withdrawn',
        withdrawnAt: '2026-08-18T11:30:00.000Z',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        processingOutcome: 'accepted',
      }),
    );

    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      evidenceId: evidence.evidenceId,
      subjectScopeId,
      productionMode: false,
    });

    expect(result.status).toBe('evaluated');
    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'evidence_withdrawn',
    });
    expect(ports.audit.events[0]?.outcome).toBe('denied');
  });

  it('denies synthetic actor in production mode', async () => {
    const ports = seedHappyPath();

    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      evidenceId: evidence.evidenceId,
      subjectScopeId,
      productionMode: true,
    });

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'actor_context_synthetic_in_production',
    });
  });

  it('never allows when the audit sink is unavailable', async () => {
    const ports = seedHappyPath();
    ports.audit.unavailable = true;

    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      evidenceId: evidence.evidenceId,
      subjectScopeId,
      productionMode: false,
    });

    expect(result.status).toBe('audit_unavailable');
    expect(result.decision.outcome).toBe('allowed');
    expect(ports.audit.events).toHaveLength(0);
  });

  it('denies missing required evidence', async () => {
    const ports = seedHappyPath();

    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      evidenceId: null,
      subjectScopeId,
      productionMode: false,
    });

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'evidence_missing',
    });
  });
});

describe('withdrawal planning', () => {
  it('accepts the first withdrawal and treats same operation as replay', () => {
    expect(authoritativeEvidenceState(null)).toBe('active');

    const first = planWithdrawal({
      existing: null,
      withdrawalId: privacyWithdrawalIdSchema.parse(
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      ),
      evidenceId: evidence.evidenceId,
      operationId: privacyOperationIdSchema.parse(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ),
      withdrawnAt: '2026-08-18T12:00:00.000Z',
    });

    expect(first.status).toBe('accepted');
    if (first.status !== 'accepted') {
      throw new Error('expected accepted');
    }
    expect(authoritativeEvidenceState(first.withdrawal)).toBe('withdrawn');

    const replay = planWithdrawal({
      existing: first.withdrawal,
      withdrawalId: first.withdrawal.withdrawalId,
      evidenceId: evidence.evidenceId,
      operationId: first.withdrawal.operationId,
      withdrawnAt: '2026-08-18T12:05:00.000Z',
    });
    expect(replay.status).toBe('idempotent_replay');

    const second = planWithdrawal({
      existing: first.withdrawal,
      withdrawalId: privacyWithdrawalIdSchema.parse(
        '12121212-1212-4121-8121-121212121212',
      ),
      evidenceId: evidence.evidenceId,
      operationId: privacyOperationIdSchema.parse(
        '34343434-3434-4343-8343-343434343434',
      ),
      withdrawnAt: '2026-08-18T12:06:00.000Z',
    });
    expect(second.status).toBe('already_withdrawn');
  });
});

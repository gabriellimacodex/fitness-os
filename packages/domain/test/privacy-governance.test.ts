import {
  privacyActorContextReferenceSchema,
  privacyCorrelationIdSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyExpectedProcessorInventorySchema,
  privacyOperationIdSchema,
  privacyPolicyPackageReferenceSchema,
  privacyPolicyVersionIdSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacyRetentionExceptionIdSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestTransitionIdSchema,
  privacySubjectScopeIdSchema,
  privacyWithdrawalIdSchema,
  privacyWithdrawalReferenceSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  authoritativeEvidenceState,
  authorizeRetentionExecution,
  compareExpectedInventoryToRuntime,
  createSyntheticPrivacyDataUsePorts,
  evaluateDataUse,
  planRetentionPreview,
  planWithdrawal,
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacySubjectRequestRepository,
  transitionSubjectRequest,
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

describe('synthetic expected processor inventory', () => {
  const inventory = privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    inventoryVersionDigest: 'd'.repeat(64),
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: 'ad3f3e2',
    processors: [
      {
        processorId: '99999999-9999-4999-8999-999999999999',
        registrationVersion: 1,
        inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        descriptorDigest: 'c'.repeat(64),
        codeOwner: 'packages.domain.privacy',
        adapterPackage: '@fitness-os/domain',
        storageKind: 'in_memory_synthetic',
        allowedPurposeIds: [purpose.purposeId],
        allowedCategoryIds: purpose.allowedCategoryIds,
        subjectLookupStrategy: 'synthetic_scope_id',
        supportedCapabilities: ['inventory', 'access'],
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

  it('returns a canonicalized metadata-only inventory', async () => {
    const port = new SyntheticPrivacyExpectedProcessorInventory(inventory);
    const loaded = await port.getInventory();
    expect(loaded.processors[0]?.supportedCapabilities).toEqual([
      'access',
      'inventory',
    ]);
    expect(loaded.processors[0]?.synthetic).toBe(true);
  });

  it('matches runtime descriptors that bind the same inventory digests', () => {
    const matched = compareExpectedInventoryToRuntime({
      expected: inventory,
      runtime: [processor],
    });
    expect(matched).toEqual({ status: 'matched' });
  });

  it('flags missing handlers and undeclared runtime processors', () => {
    const missingHandler = compareExpectedInventoryToRuntime({
      expected: inventory,
      runtime: [
        privacyProcessorDescriptorReferenceSchema.parse({
          ...processor,
          capabilities: ['access'],
        }),
      ],
    });
    expect(missingHandler).toMatchObject({
      status: 'mismatched',
      mismatches: [
        {
          diagnosticCode: 'handler_missing',
          detail: 'missing_handler:inventory',
        },
      ],
    });

    const extra = compareExpectedInventoryToRuntime({
      expected: inventory,
      runtime: [
        processor,
        privacyProcessorDescriptorReferenceSchema.parse({
          ...processor,
          processorId: '88888888-8888-4888-8888-888888888888',
        }),
      ],
    });
    expect(extra).toMatchObject({
      status: 'mismatched',
      mismatches: [
        {
          diagnosticCode: 'inventory_mismatch',
          detail: 'undeclared_runtime_processor',
        },
      ],
    });
  });
});

describe('synthetic subject request repository', () => {
  it('puts and applies transitions against the current pointer', async () => {
    const repo = new SyntheticPrivacySubjectRequestRepository();
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

    await expect(repo.put(request)).resolves.toBe('accepted');
    const advanced = await repo.applyTransition({
      requestId: request.requestId,
      next: 'ready',
      updatedAt: '2026-08-18T12:01:00.000Z',
      transitionId: privacySubjectRequestTransitionIdSchema.parse(
        'a1111111-1111-4111-8111-111111111111',
      ),
      operationId: privacyOperationIdSchema.parse(
        'b2222222-2222-4222-8222-222222222222',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      reasonCode: 'verification_accepted',
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
    expect(advanced.transition).toMatchObject({
      previousState: 'verification_required',
      nextState: 'ready',
      reasonCode: 'verification_accepted',
    });
    await expect(repo.listTransitions(request.requestId)).resolves.toEqual([
      advanced.transition,
    ]);
    await expect(repo.get(request.requestId)).resolves.toMatchObject({
      state: 'ready',
    });

    await expect(
      repo.applyTransition({
        requestId: request.requestId,
        next: 'in_progress',
        updatedAt: '2026-08-18T12:02:00.000Z',
        transitionId: privacySubjectRequestTransitionIdSchema.parse(
          'c3333333-3333-4333-8333-333333333333',
        ),
        operationId: privacyOperationIdSchema.parse(
          'b2222222-2222-4222-8222-222222222222',
        ),
        correlationId: privacyCorrelationIdSchema.parse(
          '55555555-5555-4555-8555-555555555555',
        ),
        reasonCode: 'forward',
        productionMode: false,
      }),
    ).resolves.toEqual({ status: 'conflict' });
  });
});

describe('subject request transitions', () => {
  const baseRequest = privacySubjectRequestReferenceSchema.parse({
    requestId: privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    ),
    requestType: 'export',
    state: 'received',
    verification: null,
    policyVersionId: policy.versionId,
    inventoryVersionDigest: '1'.repeat(64),
    correlationId: privacyCorrelationIdSchema.parse(
      '55555555-5555-4555-8555-555555555555',
    ),
    updatedAt: '2026-08-18T12:00:00.000Z',
  });

  it('advances received → verification_required → ready with verification', () => {
    const pending = transitionSubjectRequest({
      request: baseRequest,
      next: 'verification_required',
      updatedAt: '2026-08-18T12:01:00.000Z',
    });
    expect(pending.status).toBe('advanced');
    if (pending.status !== 'advanced') {
      throw new Error('expected advanced');
    }

    const readyWithoutVerification = transitionSubjectRequest({
      request: pending.request,
      next: 'ready',
      updatedAt: '2026-08-18T12:02:00.000Z',
    });
    expect(readyWithoutVerification).toMatchObject({
      status: 'invalid',
      reason: 'verification_required',
    });

    const ready = transitionSubjectRequest({
      request: pending.request,
      next: 'ready',
      updatedAt: '2026-08-18T12:02:00.000Z',
      verification: {
        verificationRefDigest: '2'.repeat(64),
        synthetic: true,
      },
      productionMode: false,
    });
    expect(ready.status).toBe('advanced');
    if (ready.status !== 'advanced') {
      throw new Error('expected advanced');
    }
    expect(ready.request.state).toBe('ready');
  });

  it('rejects synthetic verification in production mode', () => {
    const pending = transitionSubjectRequest({
      request: baseRequest,
      next: 'verification_required',
      updatedAt: '2026-08-18T12:01:00.000Z',
    });
    if (pending.status !== 'advanced') {
      throw new Error('expected advanced');
    }

    const blocked = transitionSubjectRequest({
      request: pending.request,
      next: 'ready',
      updatedAt: '2026-08-18T12:02:00.000Z',
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
  });

  it('rejects illegal jumps and reports terminal states', () => {
    const illegal = transitionSubjectRequest({
      request: baseRequest,
      next: 'completed',
      updatedAt: '2026-08-18T12:03:00.000Z',
    });
    expect(illegal).toMatchObject({
      status: 'invalid',
      reason: 'illegal_transition',
    });

    const denied = transitionSubjectRequest({
      request: {
        ...baseRequest,
        state: 'denied',
      },
      next: 'ready',
      updatedAt: '2026-08-18T12:04:00.000Z',
    });
    expect(denied.status).toBe('already_terminal');
  });
});

describe('retention preview and execution gates', () => {
  it('plans a deterministic synthetic preview without side effects', () => {
    const left = planRetentionPreview({
      policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
      policySynthetic: true,
      inventoryVersionDigest: '3'.repeat(64),
      processorDescriptorDigests: ['c'.repeat(64), 'b'.repeat(64)],
      watermark: '2026-08-18T00:00:00.000Z',
      approvedExceptionIds: [
        privacyRetentionExceptionIdSchema.parse(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
        privacyRetentionExceptionIdSchema.parse(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
      ],
      productionMode: false,
    });
    const right = planRetentionPreview({
      policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
      policySynthetic: true,
      inventoryVersionDigest: '3'.repeat(64),
      processorDescriptorDigests: ['b'.repeat(64), 'c'.repeat(64)],
      watermark: '2026-08-18T00:00:00.000Z',
      approvedExceptionIds: [
        privacyRetentionExceptionIdSchema.parse(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
        privacyRetentionExceptionIdSchema.parse(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
      ],
      productionMode: false,
    });

    expect(left.status).toBe('planned');
    expect(right.status).toBe('planned');
    if (left.status !== 'planned' || right.status !== 'planned') {
      throw new Error('expected planned');
    }
    expect(left.preview.selectionDigest).toBe(right.preview.selectionDigest);
    expect(left.preview.processorDescriptorDigests).toEqual([
      'b'.repeat(64),
      'c'.repeat(64),
    ]);
  });

  it('hard-disables production retention execution and allows synthetic tests only', () => {
    expect(
      authorizeRetentionExecution({
        productionMode: true,
        policySynthetic: true,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      }),
    ).toMatchObject({
      status: 'hard_disabled',
      reason: 'production_path',
    });

    expect(
      authorizeRetentionExecution({
        productionMode: false,
        policySynthetic: true,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      }),
    ).toEqual({ status: 'allowed_synthetic_test' });

    expect(
      authorizeRetentionExecution({
        productionMode: false,
        policySynthetic: false,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      }),
    ).toMatchObject({
      status: 'hard_disabled',
      reason: 'synthetic_fixtures_required',
    });
  });
});

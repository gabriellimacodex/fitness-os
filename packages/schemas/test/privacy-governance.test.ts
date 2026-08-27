import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PRIVACY_CANONICAL_PROFILES,
  PRIVACY_OPERATION_KINDS,
  canonicalizePrivacyAuthorityClaims,
  canonicalizePrivacyExpectedProcessorInventory,
  canonicalizePrivacyPurposeVersionReference,
  canonicalizeRetentionPreviewApprovedExceptionIds,
  getPrivacyCanonicalProfile,
  governanceLifecycleResultSchema,
  privacyActorContextReferenceSchema,
  privacyAuditEventReferenceSchema,
  privacyCanonicalizationVersionSchema,
  privacyDataUseDecisionSchema,
  privacyDataUseDenyReasonSchema,
  privacyEvidenceReferenceSchema,
  privacyExpectedProcessorInventorySchema,
  privacyGovernanceLifecycleProofReferenceSchema,
  privacyLifecycleProofIdSchema,
  privacyOperationIdSchema,
  privacyOperationKindSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyProcessorIdSchema,
  privacyProcessorStepReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacyReadinessResultSchema,
  privacyRetentionExceptionIdSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestIdentityEquals,
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestTransitionReferenceSchema,
  privacySyntheticDataUseEvaluateRequestSchema,
  privacySyntheticDataUseEvaluateResponseSchema,
  privacySyntheticRetentionExecutionAuthorizeRequestSchema,
  privacySyntheticRetentionPreviewRequestSchema,
  privacySyntheticProcessorCommandSchema,
  privacySyntheticProcessorResultSchema,
  privacySyntheticSubjectRequestTransitionRequestSchema,
  privacySyntheticSubjectRequestTransitionResponseSchema,
  privacySyntheticWithdrawalPlanRequestSchema,
  privacyWithdrawalReferenceSchema,
  canonicalizePrivacyProcessorDescriptorReference,
  canonicalizePrivacyReadinessDiagnosticCodes,
  retentionPreviewCanonicalInputSchema,
  sortPrivacySetIdentifiers,
} from '../src/privacy-governance.js';
const proofId = privacyLifecycleProofIdSchema.parse(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
);
const exceptionA = privacyRetentionExceptionIdSchema.parse(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
);
const exceptionB = privacyRetentionExceptionIdSchema.parse(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
);
const exceptionC = privacyRetentionExceptionIdSchema.parse(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
);

describe('privacy operation kinds and canonical profiles', () => {
  it('pins the Option A canonicalization version', () => {
    expect(
      privacyCanonicalizationVersionSchema.parse(
        'privacy-governance.canonical.v1',
      ),
    ).toBe('privacy-governance.canonical.v1');
    expect(
      privacyCanonicalizationVersionSchema.safeParse('utf8-json-sha256.v1')
        .success,
    ).toBe(false);
  });

  it('exposes an exhaustive profile key for every declared operation kind', () => {
    const kinds = [...PRIVACY_OPERATION_KINDS].sort();
    const profileKeys = Object.keys(PRIVACY_CANONICAL_PROFILES).sort();

    expect(profileKeys).toEqual(kinds);
    expect(kinds.length).toBe(privacyOperationKindSchema.options.length);

    for (const kind of PRIVACY_OPERATION_KINDS) {
      const profile = getPrivacyCanonicalProfile(kind);
      expect(profile.operationKind).toBe(kind);
      expect(profile.canonicalizationVersion).toBe(
        'privacy-governance.canonical.v1',
      );
      expect(
        privacyOperationKindSchema.safeParse(profile.operationKind).success,
      ).toBe(true);
    }
  });

  it('declares approvedExceptionIds on retention_preview for set canonicalization', () => {
    const preview = getPrivacyCanonicalProfile('retention_preview');
    expect(preview.setPaths).toContain('/approvedExceptionIds');

    expect(
      getPrivacyCanonicalProfile('retention_execution').setPaths,
    ).toContain('/approvedExceptionIds');
    expect(
      getPrivacyCanonicalProfile('governance_lifecycle').setPaths,
    ).toContain('/approvedExceptionIds');
  });
});

describe('governance lifecycle proofId binding', () => {
  it('requires proofId on completed and partially_failed results', () => {
    expect(
      governanceLifecycleResultSchema.parse({
        outcome: 'completed',
        proofId,
      }),
    ).toEqual({ outcome: 'completed', proofId });

    expect(
      governanceLifecycleResultSchema.parse({
        outcome: 'partially_failed',
        proofId,
      }),
    ).toEqual({ outcome: 'partially_failed', proofId });

    expect(
      governanceLifecycleResultSchema.safeParse({ outcome: 'completed' })
        .success,
    ).toBe(false);
    expect(
      governanceLifecycleResultSchema.safeParse({
        outcome: 'partially_failed',
      }).success,
    ).toBe(false);
  });

  it('requires proofId to be absent on denied outcomes', () => {
    expect(
      governanceLifecycleResultSchema.parse({ outcome: 'denied' }),
    ).toEqual({ outcome: 'denied' });

    expect(
      governanceLifecycleResultSchema.safeParse({
        outcome: 'denied',
        proofId,
      }).success,
    ).toBe(false);
  });
});

describe('governance lifecycle proof ledger reference', () => {
  const requestId = privacySubjectRequestIdSchema.parse(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  );
  const processorId = privacyProcessorIdSchema.parse(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
  );
  const operationId = privacyOperationIdSchema.parse(
    '11111111-1111-4111-8111-111111111111',
  );

  it('accepts a completed proof reference bound to its outcome/proofId rule', () => {
    const parsed = privacyGovernanceLifecycleProofReferenceSchema.parse({
      requestId,
      processorId,
      operationId,
      result: { outcome: 'completed', proofId },
      recordedAt: '2026-08-27T00:00:00.000Z',
      synthetic: true,
    });
    expect(parsed.result).toEqual({ outcome: 'completed', proofId });
  });

  it('accepts a denied proof reference with no proofId in the result', () => {
    const parsed = privacyGovernanceLifecycleProofReferenceSchema.parse({
      requestId,
      processorId,
      operationId,
      result: { outcome: 'denied' },
      recordedAt: '2026-08-27T00:00:00.000Z',
      synthetic: true,
    });
    expect(parsed.result).toEqual({ outcome: 'denied' });
  });

  it('rejects an unknown key such as an inlined destructive-action detail', () => {
    expect(
      privacyGovernanceLifecycleProofReferenceSchema.safeParse({
        requestId,
        processorId,
        operationId,
        result: { outcome: 'denied' },
        recordedAt: '2026-08-27T00:00:00.000Z',
        synthetic: true,
        deletedRecordCount: 42,
      }).success,
    ).toBe(false);
  });

  it('rejects a result violating the closed outcome/proofId rule', () => {
    expect(
      privacyGovernanceLifecycleProofReferenceSchema.safeParse({
        requestId,
        processorId,
        operationId,
        result: { outcome: 'completed' },
        recordedAt: '2026-08-27T00:00:00.000Z',
        synthetic: true,
      }).success,
    ).toBe(false);
  });
});

describe('retention_preview approvedExceptionIds set canonicalization', () => {
  it('accepts the Option A retention preview set fragment', () => {
    const input = retentionPreviewCanonicalInputSchema.parse({
      approvedExceptionIds: [exceptionB, exceptionA],
    });
    expect(input.approvedExceptionIds).toEqual([exceptionB, exceptionA]);
  });

  it('sorts approvedExceptionIds independently of input permutation', () => {
    const left = canonicalizeRetentionPreviewApprovedExceptionIds({
      approvedExceptionIds: [exceptionC, exceptionA, exceptionB],
    });
    const right = canonicalizeRetentionPreviewApprovedExceptionIds({
      approvedExceptionIds: [exceptionB, exceptionC, exceptionA],
    });

    expect(left).toEqual(right);
    expect(left.approvedExceptionIds).toEqual(
      sortPrivacySetIdentifiers([exceptionA, exceptionB, exceptionC]),
    );
  });
});

describe('policy and evidence reference contracts', () => {
  it('accepts reference-only policy package metadata without legal copy fields', () => {
    const parsed = privacyPolicyPackageReferenceSchema.parse({
      packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      contentDigest: 'a'.repeat(64),
      synthetic: true,
    });
    expect(parsed.synthetic).toBe(true);
    expect(
      privacyPolicyPackageReferenceSchema.safeParse({
        ...parsed,
        noticeText: 'forbidden',
      }).success,
    ).toBe(false);
  });

  it('accepts integrity-bound evidence locators without raw participant answers', () => {
    const parsed = privacyEvidenceReferenceSchema.parse({
      evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      purposeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contentDigest: 'b'.repeat(64),
      recordedAt: '2026-08-18T00:00:00.000Z',
    });
    expect(parsed.contentDigest).toHaveLength(64);
    expect(
      privacyEvidenceReferenceSchema.safeParse({
        ...parsed,
        consentAnswer: true,
      }).success,
    ).toBe(false);
  });
});

describe('withdrawal and data-use decision contracts', () => {
  const withdrawalBase = {
    withdrawalId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    state: 'withdrawn' as const,
    withdrawnAt: '2026-08-18T12:00:00.000Z',
    operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    processingOutcome: 'accepted' as const,
  };

  it('records one-way withdrawal against evidence without reopening fields', () => {
    const parsed = privacyWithdrawalReferenceSchema.parse(withdrawalBase);
    expect(parsed.state).toBe('withdrawn');

    expect(
      privacyWithdrawalReferenceSchema.safeParse({
        ...withdrawalBase,
        state: 'active',
      }).success,
    ).toBe(false);
    expect(
      privacyWithdrawalReferenceSchema.safeParse({
        ...withdrawalBase,
        reopened: true,
      }).success,
    ).toBe(false);
    expect(
      privacyWithdrawalReferenceSchema.safeParse({
        ...withdrawalBase,
        noticeText: 'forbidden',
      }).success,
    ).toBe(false);
  });

  it('accepts idempotent withdrawal replay without editing evidence', () => {
    expect(
      privacyWithdrawalReferenceSchema.parse({
        ...withdrawalBase,
        processingOutcome: 'idempotent_replay',
      }).processingOutcome,
    ).toBe('idempotent_replay');
  });

  it('requires a closed deny reason on denied data-use decisions', () => {
    const denied = privacyDataUseDecisionSchema.parse({
      outcome: 'denied',
      reasonCode: 'evidence_withdrawn',
      evaluatedAt: '2026-08-18T12:00:00.000Z',
      correlationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(denied.outcome).toBe('denied');
    expect(privacyDataUseDenyReasonSchema.options).toContain(
      'evidence_withdrawn',
    );
    expect(privacyDataUseDenyReasonSchema.options).toContain(
      'dependency_unavailable',
    );

    expect(
      privacyDataUseDecisionSchema.safeParse({
        outcome: 'denied',
        evaluatedAt: '2026-08-18T12:00:00.000Z',
        correlationId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
    expect(
      privacyDataUseDecisionSchema.safeParse({
        outcome: 'denied',
        reasonCode: 'not_a_real_reason',
        evaluatedAt: '2026-08-18T12:00:00.000Z',
        correlationId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('binds allowed decisions to digests and versions without boolean grants', () => {
    const allowed = privacyDataUseDecisionSchema.parse({
      outcome: 'allowed',
      subjectScopeId: '22222222-2222-4222-8222-222222222222',
      actorContextDigest: 'c'.repeat(64),
      purposeVersionId: '33333333-3333-4333-8333-333333333333',
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: '44444444-4444-4444-8444-444444444444',
      processorDescriptorVersionDigest: 'd'.repeat(64),
      policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      policyDigest: 'e'.repeat(64),
      evaluatedAt: '2026-08-18T12:00:00.000Z',
      correlationId: '55555555-5555-4555-8555-555555555555',
    });
    expect(allowed.outcome).toBe('allowed');

    expect(
      privacyDataUseDecisionSchema.safeParse({
        ...allowed,
        reasonCode: 'evidence_missing',
      }).success,
    ).toBe(false);
    expect(
      privacyDataUseDecisionSchema.safeParse({
        outcome: true,
      }).success,
    ).toBe(false);
    expect(
      privacyDataUseDecisionSchema.safeParse({
        ...allowed,
        legalBasis: 'consent',
      }).success,
    ).toBe(false);
  });
});

describe('actor context and purpose version references', () => {
  it('accepts actor context with digest-bound principal and closed authority claims', () => {
    const parsed = privacyActorContextReferenceSchema.parse({
      issuer: 'synthetic.identity.v1',
      version: 1,
      principalReferenceDigest: 'a'.repeat(64),
      authorityClaims: ['data_use_evaluate', 'authorization_evidence_append'],
      synthetic: true,
    });
    expect(parsed.synthetic).toBe(true);
    expect(
      canonicalizePrivacyAuthorityClaims([
        'retention_preview',
        'data_use_evaluate',
        'retention_preview',
      ]),
    ).toEqual(
      sortPrivacySetIdentifiers([
        'data_use_evaluate',
        'retention_preview',
        'retention_preview',
      ]),
    );

    expect(
      privacyActorContextReferenceSchema.safeParse({
        ...parsed,
        rawToken: 'secret',
      }).success,
    ).toBe(false);
    expect(
      privacyActorContextReferenceSchema.safeParse({
        ...parsed,
        studentId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(false);
    expect(
      privacyActorContextReferenceSchema.safeParse({
        ...parsed,
        authorityClaims: ['coach'],
      }).success,
    ).toBe(false);
  });

  it('accepts purpose version bindings without legal purpose text', () => {
    const purpose = privacyPurposeVersionReferenceSchema.parse({
      purposeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      purposeVersionId: '33333333-3333-4333-8333-333333333333',
      policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      allowedOperationKinds: [
        'authorization_withdrawal',
        'data_use_evaluation',
      ],
      allowedCategoryIds: [
        '44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',
      ],
      evidenceRequired: true,
      activationState: 'active',
      contentDigest: 'f'.repeat(64),
    });

    const canonical = canonicalizePrivacyPurposeVersionReference(purpose);
    expect(canonical.allowedOperationKinds).toEqual(
      sortPrivacySetIdentifiers([
        'authorization_withdrawal',
        'data_use_evaluation',
      ]),
    );
    expect(canonical.allowedCategoryIds).toEqual(
      sortPrivacySetIdentifiers([
        '22222222-2222-4222-8222-222222222222',
        '44444444-4444-4444-8444-444444444444',
      ]),
    );

    expect(
      privacyPurposeVersionReferenceSchema.safeParse({
        ...purpose,
        noticeText: 'forbidden',
      }).success,
    ).toBe(false);
    expect(
      privacyPurposeVersionReferenceSchema.safeParse({
        ...purpose,
        activationState: 'draft',
      }).success,
    ).toBe(false);
  });
});

describe('subject request and audit event references', () => {
  it('accepts request pointers without entitlement or identity payloads', () => {
    const parsed = privacySubjectRequestReferenceSchema.parse({
      requestId: '66666666-6666-4666-8666-666666666666',
      requestType: 'export',
      state: 'verification_required',
      subjectScopeId: '22222222-2222-4222-8222-222222222222',
      verification: {
        verificationRefDigest: '1'.repeat(64),
        synthetic: true,
      },
      policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      inventoryVersionDigest: '2'.repeat(64),
      correlationId: '55555555-5555-4555-8555-555555555555',
      updatedAt: '2026-08-18T12:00:00.000Z',
    });
    expect(parsed.state).toBe('verification_required');
    expect(parsed.subjectScopeId).toBe('22222222-2222-4222-8222-222222222222');

    expect(
      privacySubjectRequestReferenceSchema.safeParse({
        requestId: parsed.requestId,
        requestType: parsed.requestType,
        state: parsed.state,
        verification: parsed.verification,
        policyVersionId: parsed.policyVersionId,
        inventoryVersionDigest: parsed.inventoryVersionDigest,
        correlationId: parsed.correlationId,
        updatedAt: parsed.updatedAt,
      }).success,
    ).toBe(false);

    expect(
      privacySubjectRequestReferenceSchema.safeParse({
        ...parsed,
        email: 'user@example.com',
      }).success,
    ).toBe(false);
    expect(
      privacySubjectRequestReferenceSchema.safeParse({
        ...parsed,
        requestType: 'rectification',
      }).success,
    ).toBe(false);
    expect(
      privacySubjectRequestReferenceSchema.safeParse({
        ...parsed,
        state: 'legally_approved',
      }).success,
    ).toBe(false);

    expect(
      privacySubjectRequestIdentityEquals(
        parsed,
        privacySubjectRequestReferenceSchema.parse({
          ...parsed,
          state: 'ready',
          updatedAt: '2026-08-18T13:00:00.000Z',
        }),
      ),
    ).toBe(true);
    expect(
      privacySubjectRequestIdentityEquals(
        parsed,
        privacySubjectRequestReferenceSchema.parse({
          ...parsed,
          subjectScopeId: '33333333-3333-4333-8333-333333333333',
        }),
      ),
    ).toBe(false);
  });

  it('accepts append-only subject-request transition references without free text', () => {
    const parsed = privacySubjectRequestTransitionReferenceSchema.parse({
      transitionId: 'a1111111-1111-4111-8111-111111111111',
      requestId: '66666666-6666-4666-8666-666666666666',
      previousState: 'verification_required',
      nextState: 'ready',
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
      reasonCode: 'verification_accepted',
      verificationRefDigest: '2'.repeat(64),
      recordedAt: '2026-08-18T12:01:00.000Z',
    });
    expect(parsed.nextState).toBe('ready');
    expect(
      privacySubjectRequestTransitionReferenceSchema.safeParse({
        ...parsed,
        reasonCode: 'legally_approved',
      }).success,
    ).toBe(false);
    expect(
      privacySubjectRequestTransitionReferenceSchema.safeParse({
        ...parsed,
        note: 'operator comment',
      }).success,
    ).toBe(false);
  });

  it('accepts append-only processor step records and rejects free text/unknown outcomes', () => {
    const parsed = privacyProcessorStepReferenceSchema.parse({
      stepId: 'e1111111-1111-4111-8111-111111111111',
      requestId: '66666666-6666-4666-8666-666666666666',
      processorId: '99999999-9999-4999-8999-999999999999',
      capability: 'export',
      outcome: 'completed',
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
      recordedAt: '2026-08-18T12:02:00.000Z',
    });
    expect(parsed.outcome).toBe('completed');

    expect(
      privacyProcessorStepReferenceSchema.safeParse({
        ...parsed,
        outcome: 'deleted',
      }).success,
    ).toBe(false);
    expect(
      privacyProcessorStepReferenceSchema.safeParse({
        ...parsed,
        note: 'operator comment',
      }).success,
    ).toBe(false);
    expect(
      privacyProcessorStepReferenceSchema.safeParse({
        stepId: parsed.stepId,
        requestId: parsed.requestId,
        capability: parsed.capability,
        outcome: parsed.outcome,
        operationId: parsed.operationId,
        correlationId: parsed.correlationId,
        recordedAt: parsed.recordedAt,
      }).success,
    ).toBe(false);
  });

  it('requires closed audit kinds and denied reason codes without free-text metadata', () => {
    const denied = privacyAuditEventReferenceSchema.parse({
      auditEventId: '77777777-7777-4777-8777-777777777777',
      kind: 'data_use_evaluated',
      outcome: 'denied',
      reasonCode: 'evidence_withdrawn',
      policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      requestId: null,
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
      recordedAt: '2026-08-18T12:00:00.000Z',
    });
    expect(denied.outcome).toBe('denied');

    const succeeded = privacyAuditEventReferenceSchema.parse({
      auditEventId: '88888888-8888-4888-8888-888888888888',
      kind: 'subject_request_transitioned',
      outcome: 'succeeded',
      reasonCode: null,
      policyVersionId: null,
      evidenceId: null,
      requestId: '66666666-6666-4666-8666-666666666666',
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
      recordedAt: '2026-08-18T12:00:00.000Z',
    });
    expect(succeeded.kind).toBe('subject_request_transitioned');

    expect(
      privacyAuditEventReferenceSchema.safeParse({
        ...denied,
        reasonCode: null,
      }).success,
    ).toBe(false);
    expect(
      privacyAuditEventReferenceSchema.safeParse({
        ...succeeded,
        reasonCode: 'evidence_missing',
      }).success,
    ).toBe(false);
    expect(
      privacyAuditEventReferenceSchema.safeParse({
        ...succeeded,
        metadata: { sql: 'select 1' },
      }).success,
    ).toBe(false);
    expect(
      privacyAuditEventReferenceSchema.safeParse({
        ...succeeded,
        stackTrace: 'Error: boom',
      }).success,
    ).toBe(false);
  });
});

describe('synthetic subject-data processor contracts', () => {
  it('accepts completed inventory/access results and rejects free text', () => {
    const inventory = privacySyntheticProcessorResultSchema.parse({
      status: 'completed',
      reasonCode: null,
      capability: 'inventory',
      families: [
        {
          family: 'privacy_audit_event',
          recordCount: 0,
          coverageDigest: 'a'.repeat(64),
        },
      ],
      accessLocatorDigest: null,
      exportManifestDigest: null,
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
    });
    expect(inventory.capability).toBe('inventory');

    const access = privacySyntheticProcessorResultSchema.parse({
      status: 'completed',
      reasonCode: null,
      capability: 'access',
      families: [],
      accessLocatorDigest: 'b'.repeat(64),
      exportManifestDigest: null,
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
    });
    expect(access.accessLocatorDigest).toBe('b'.repeat(64));

    const exported = privacySyntheticProcessorResultSchema.parse({
      status: 'completed',
      reasonCode: null,
      capability: 'export',
      families: [
        {
          family: 'privacy_subject_request',
          recordCount: 0,
          coverageDigest: 'c'.repeat(64),
        },
      ],
      accessLocatorDigest: null,
      exportManifestDigest: 'd'.repeat(64),
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
    });
    expect(exported.exportManifestDigest).toBe('d'.repeat(64));
    expect(
      privacySyntheticProcessorResultSchema.safeParse({
        ...exported,
        payload: { rows: [] },
      }).success,
    ).toBe(false);

    expect(
      privacySyntheticProcessorResultSchema.parse({
        status: 'denied',
        reasonCode: 'requires_legal_privacy_decision',
        capability: 'delete',
        families: [],
        accessLocatorDigest: null,
        exportManifestDigest: null,
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        correlationId: '55555555-5555-4555-8555-555555555555',
      }).reasonCode,
    ).toBe('requires_legal_privacy_decision');

    expect(
      privacySyntheticProcessorCommandSchema.safeParse({
        processorId: '99999999-9999-4999-8999-999999999999',
        capability: 'inventory',
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        correlationId: '55555555-5555-4555-8555-555555555555',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        productionMode: false,
        sql: 'select 1',
      }).success,
    ).toBe(false);
  });
});

describe('expected processor inventory contracts', () => {
  it('parses the packaged synthetic inventory fixture without secrets', () => {
    const fixturePath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../fixtures/privacy/processor-inventory.v1.json',
    );
    const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
    const parsed = privacyExpectedProcessorInventorySchema.parse(raw);
    expect(parsed.schemaVersion).toBe('privacy.processor-inventory.v1');
    expect(parsed.processors).toHaveLength(1);
    expect(parsed.processors[0]?.synthetic).toBe(true);
    expect(parsed.processors[0]?.environmentApplicability).toBe(
      'synthetic_only',
    );
    expect(
      privacyExpectedProcessorInventorySchema.safeParse({
        ...parsed,
        connectionString: 'postgresql://secret',
      }).success,
    ).toBe(false);
    expect(
      privacyExpectedProcessorInventorySchema.safeParse({
        ...parsed,
        processors: [
          {
            ...parsed.processors[0],
            supportedCapabilities: ['access'],
            unsupportedCapabilities: [
              { capability: 'access', rationale: 'not_in_scope_for_candidate' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('canonicalizes processors and nested sets by stable sort', () => {
    const fixturePath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../fixtures/privacy/processor-inventory.v1.json',
    );
    const parsed = privacyExpectedProcessorInventorySchema.parse(
      JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown,
    );
    const shuffled = {
      ...parsed,
      processors: [
        {
          ...parsed.processors[0]!,
          allowedPurposeIds: [
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ].reverse() as never,
          supportedCapabilities: ['inventory', 'access'] as never,
        },
      ],
    };
    const canonical = canonicalizePrivacyExpectedProcessorInventory(
      privacyExpectedProcessorInventorySchema.parse({
        ...shuffled,
        processors: [
          {
            ...shuffled.processors[0],
            allowedPurposeIds: [
              'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            ],
            allowedCategoryIds: ['44444444-4444-4444-8444-444444444444'],
          },
        ],
      }),
    );
    expect(canonical.processors[0]?.supportedCapabilities).toEqual([
      'access',
      'inventory',
    ]);
    expect(canonical.processors[0]?.allowedPurposeIds).toEqual([
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    ]);
  });
});

describe('processor descriptor and readiness contracts', () => {
  it('accepts processor descriptors without provider hosts or credentials', () => {
    const parsed = privacyProcessorDescriptorReferenceSchema.parse({
      processorId: '99999999-9999-4999-8999-999999999999',
      inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      descriptorDigest: '3'.repeat(64),
      inventoryVersionDigest: '4'.repeat(64),
      allowedPurposeIds: [
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ],
      allowedCategoryIds: [
        '44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',
      ],
      capabilities: ['export', 'inventory', 'access'],
      supportsSubjectLookup: true,
      codeOwner: 'packages.domain.privacy',
      synthetic: true,
    });

    const canonical = canonicalizePrivacyProcessorDescriptorReference(parsed);
    expect(canonical.capabilities).toEqual(
      sortPrivacySetIdentifiers(['access', 'export', 'inventory']),
    );
    expect(canonical.allowedPurposeIds).toEqual(
      sortPrivacySetIdentifiers([
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      ]),
    );

    expect(
      privacyProcessorDescriptorReferenceSchema.safeParse({
        ...parsed,
        host: 'db.internal',
      }).success,
    ).toBe(false);
    expect(
      privacyProcessorDescriptorReferenceSchema.safeParse({
        ...parsed,
        apiKey: 'secret',
      }).success,
    ).toBe(false);
    expect(
      privacyProcessorDescriptorReferenceSchema.safeParse({
        ...parsed,
        capabilities: ['not_applicable'],
      }).success,
    ).toBe(false);
  });

  it('keeps productionReady false under legal_privacy_decision_required', () => {
    const readyComponents = [
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
    ].map((componentId) => ({
      componentId,
      state: 'ready' as const,
      diagnosticCode: null,
    }));
    const stopped = privacyReadinessResultSchema.parse({
      mechanismReady: true,
      productionReady: false,
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      schemaDigest: '5'.repeat(64),
      inventoryVersionDigest: '6'.repeat(64),
      components: readyComponents,
      diagnosticCodes: ['legal_privacy_decision_required'],
      evaluatedAt: '2026-08-18T12:00:00.000Z',
    });
    expect(stopped.productionReady).toBe(false);
    expect(
      canonicalizePrivacyReadinessDiagnosticCodes(stopped.diagnosticCodes),
    ).toEqual(['legal_privacy_decision_required']);

    expect(
      privacyReadinessResultSchema.safeParse({
        ...stopped,
        productionReady: true,
      }).success,
    ).toBe(false);
    expect(
      privacyReadinessResultSchema.safeParse({
        ...stopped,
        mechanismReady: false,
        productionReady: true,
        diagnosticCodes: [],
      }).success,
    ).toBe(false);
    expect(
      privacyReadinessResultSchema.safeParse({
        ...stopped,
        mechanismReady: true,
        components: readyComponents.map((component) =>
          component.componentId === 'audit_sink'
            ? {
                ...component,
                state: 'not_ready' as const,
                diagnosticCode: 'audit_unavailable' as const,
              }
            : component,
        ),
      }).success,
    ).toBe(false);
    expect(
      privacyReadinessResultSchema.safeParse({
        ...stopped,
        mechanismReady: false,
        components: readyComponents.slice(1),
      }).success,
    ).toBe(false);
    expect(
      privacyReadinessResultSchema.safeParse({
        ...stopped,
        mechanismReady: false,
        components: [...readyComponents, readyComponents[0]],
      }).success,
    ).toBe(false);
    expect(
      privacyReadinessResultSchema.safeParse({
        ...stopped,
        region: 'us-east-1',
      }).success,
    ).toBe(false);
    expect(
      privacyReadinessResultSchema.safeParse({
        ...stopped,
        diagnosticCodes: ['sql_exception'],
      }).success,
    ).toBe(false);
  });

  it('accepts synthetic data-use evaluate requests without legal copy fields', () => {
    const request = privacySyntheticDataUseEvaluateRequestSchema.parse({
      actor: {
        issuer: 'synthetic.identity.v1',
        version: 1,
        principalReferenceDigest: 'e'.repeat(64),
        authorityClaims: ['data_use_evaluate'],
        synthetic: true,
      },
      purpose: {
        purposeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        purposeVersionId: '33333333-3333-4333-8333-333333333333',
        policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        allowedOperationKinds: ['data_use_evaluation'],
        allowedCategoryIds: ['44444444-4444-4444-8444-444444444444'],
        evidenceRequired: true,
        activationState: 'active',
        contentDigest: 'b'.repeat(64),
      },
      policy: {
        packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        contentDigest: 'a'.repeat(64),
        synthetic: true,
      },
      processor: {
        processorId: '99999999-9999-4999-8999-999999999999',
        inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        descriptorDigest: 'c'.repeat(64),
        inventoryVersionDigest: 'd'.repeat(64),
        allowedPurposeIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
        allowedCategoryIds: ['44444444-4444-4444-8444-444444444444'],
        capabilities: ['access'],
        supportsSubjectLookup: true,
        codeOwner: 'packages.domain.privacy',
        synthetic: true,
      },
      processorCapability: 'access',
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: '44444444-4444-4444-8444-444444444444',
      evidence: null,
      subjectScopeId: '22222222-2222-4222-8222-222222222222',
      productionMode: false,
    });
    expect(request.processorCapability).toBe('access');
    expect(
      privacySyntheticDataUseEvaluateRequestSchema.safeParse({
        ...request,
        processorCapability: 'export',
      }).success,
    ).toBe(false);
    expect(request.productionMode).toBe(false);
    expect(
      privacySyntheticDataUseEvaluateRequestSchema.safeParse({
        ...request,
        noticeText: 'forbidden',
      }).success,
    ).toBe(false);
  });

  it('rejects an allowed decision when mandatory audit is unavailable', () => {
    expect(
      privacySyntheticDataUseEvaluateResponseSchema.safeParse({
        status: 'audit_unavailable',
        decision: {
          outcome: 'allowed',
          subjectScopeId: '22222222-2222-4222-8222-222222222222',
          actorContextDigest: 'e'.repeat(64),
          purposeVersionId: '33333333-3333-4333-8333-333333333333',
          operationKind: 'data_use_evaluation',
          engineeringCategoryId: '44444444-4444-4444-8444-444444444444',
          processorDescriptorVersionDigest: 'c'.repeat(64),
          policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          policyDigest: 'a'.repeat(64),
          evaluatedAt: '2026-08-18T12:00:00.000Z',
          correlationId: '55555555-5555-4555-8555-555555555555',
        },
      }).success,
    ).toBe(false);
  });

  it('freezes synthetic subject-request and withdrawal plan seam contracts', () => {
    const validTransitionRequest = {
      request: {
        requestId: '66666666-6666-4666-8666-666666666666',
        requestType: 'export' as const,
        state: 'verification_required' as const,
        subjectScopeId: '22222222-2222-4222-8222-222222222222',
        verification: null,
        policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        inventoryVersionDigest: '1'.repeat(64),
        correlationId: '55555555-5555-4555-8555-555555555555',
        updatedAt: '2026-08-18T12:00:00.000Z',
      },
      next: 'ready' as const,
      transitionId: 'a1111111-1111-4111-8111-111111111111',
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      correlationId: '55555555-5555-4555-8555-555555555555',
      reasonCode: 'verification_accepted' as const,
      verification: {
        verificationRefDigest: '2'.repeat(64),
        synthetic: true,
      },
      productionMode: false,
    };
    expect(
      privacySyntheticSubjectRequestTransitionRequestSchema.parse(
        validTransitionRequest,
      ).transitionId,
    ).toBe(validTransitionRequest.transitionId);
    expect(
      privacySyntheticSubjectRequestTransitionResponseSchema.parse({
        status: 'advanced',
        request: {
          ...validTransitionRequest.request,
          state: 'ready',
          verification: validTransitionRequest.verification,
          updatedAt: '2026-08-18T12:00:00.000Z',
        },
        transition: {
          transitionId: validTransitionRequest.transitionId,
          requestId: validTransitionRequest.request.requestId,
          previousState: 'verification_required',
          nextState: 'ready',
          operationId: validTransitionRequest.operationId,
          correlationId: validTransitionRequest.correlationId,
          reasonCode: 'verification_accepted',
          verificationRefDigest: '2'.repeat(64),
          recordedAt: '2026-08-18T12:00:00.000Z',
        },
      }).status,
    ).toBe('advanced');
    expect(
      privacySyntheticSubjectRequestTransitionResponseSchema.parse({
        status: 'conflict',
      }).status,
    ).toBe('conflict');
    expect(
      privacySyntheticSubjectRequestTransitionRequestSchema.safeParse({
        ...validTransitionRequest,
        legalEntitlement: true,
      }).success,
    ).toBe(false);
    expect(
      privacySyntheticSubjectRequestTransitionRequestSchema.safeParse({
        request: validTransitionRequest.request,
        next: 'ready',
        productionMode: false,
      }).success,
    ).toBe(false);

    expect(
      privacySyntheticWithdrawalPlanRequestSchema.parse({
        existing: null,
        withdrawalId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      }).existing,
    ).toBeNull();

    expect(
      privacySyntheticRetentionPreviewRequestSchema.safeParse({
        policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        policySynthetic: true,
        inventoryVersionDigest: '3'.repeat(64),
        processorDescriptorDigests: ['b'.repeat(64)],
        watermark: '2026-08-18T00:00:00.000Z',
        approvedExceptionIds: [],
        productionMode: false,
        sql: 'delete from subjects',
      }).success,
    ).toBe(false);

    expect(
      privacySyntheticRetentionExecutionAuthorizeRequestSchema.parse({
        productionMode: true,
        policySynthetic: true,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      }).productionMode,
    ).toBe(true);
  });
});

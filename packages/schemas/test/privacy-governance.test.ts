import { describe, expect, it } from 'vitest';

import {
  PRIVACY_CANONICAL_PROFILES,
  PRIVACY_OPERATION_KINDS,
  canonicalizeRetentionPreviewApprovedExceptionIds,
  getPrivacyCanonicalProfile,
  governanceLifecycleResultSchema,
  privacyCanonicalizationVersionSchema,
  privacyDataUseDecisionSchema,
  privacyDataUseDenyReasonSchema,
  privacyEvidenceReferenceSchema,
  privacyLifecycleProofIdSchema,
  privacyOperationKindSchema,
  privacyPolicyPackageReferenceSchema,
  privacyRetentionExceptionIdSchema,
  privacyWithdrawalReferenceSchema,
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

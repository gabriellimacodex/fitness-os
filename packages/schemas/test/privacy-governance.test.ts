import { describe, expect, it } from 'vitest';

import {
  PRIVACY_CANONICAL_PROFILES,
  PRIVACY_OPERATION_KINDS,
  canonicalizeRetentionPreviewApprovedExceptionIds,
  getPrivacyCanonicalProfile,
  governanceLifecycleResultSchema,
  privacyCanonicalizationVersionSchema,
  privacyLifecycleProofIdSchema,
  privacyOperationKindSchema,
  privacyRetentionExceptionIdSchema,
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

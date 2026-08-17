import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createSignedReviewRecord,
  createTestReviewAuthority,
  digestMovementDetail,
  fingerprintPublicKey,
  productionReviewAuthorityFromConfig,
  ReviewVerificationError,
  verifyReviewRecord,
} from '../src/movement-library/index.js';
import { readerReceipt, safetyReceipt, SQUAT } from './movement-fixtures.js';

const SOURCE_COMMIT = 'cccccccccccccccccccccccccccccccccccccccc';

function signedRecord(
  authority = createTestReviewAuthority(),
  overrides: Record<string, unknown> = {},
) {
  const record = createSignedReviewRecord({
    authority,
    contentVersion: SQUAT.contentVersion,
    digest: digestMovementDetail(SQUAT),
    movementId: SQUAT.movementId,
    receipts: [
      safetyReceipt('safety-nonce-0001'),
      readerReceipt('reader-nonce-0001'),
    ],
    sourceCommitSha: SOURCE_COMMIT,
  });

  return { authority, record: { ...record, ...overrides } };
}

describe('review record verification', () => {
  it('accepts a synthetic test authority only when tests opt in', () => {
    const { authority, record } = signedRecord();

    expect(() =>
      verifyReviewRecord(record, authority, { allowTestAuthority: true }),
    ).not.toThrow();
    expect(() => verifyReviewRecord(record, authority)).toThrow(
      /cannot satisfy publication or Gate A/,
    );
  });

  it('rejects a newly generated unpinned keypair', () => {
    const { record } = signedRecord();
    const other = createTestReviewAuthority();

    expect(() =>
      verifyReviewRecord(record, other, { allowTestAuthority: true }),
    ).toThrow(/does not match the pinned authority/);
  });

  it('rejects a missing or mismatched production authority', () => {
    expect(() => productionReviewAuthorityFromConfig({})).toThrow(
      ReviewVerificationError,
    );

    const { publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString();

    expect(() =>
      productionReviewAuthorityFromConfig({
        fingerprint: '0'.repeat(64),
        publicKeyPem,
      }),
    ).toThrow(/does not match the public key/);
  });

  it('rejects identifying fields', () => {
    const { authority, record } = signedRecord();

    expect(() =>
      verifyReviewRecord(
        {
          ...record,
          receipts: [
            { ...record.receipts[0], reviewerId: 'person-1' },
            record.receipts[1],
          ],
        } as never,
        authority,
        { allowTestAuthority: true },
      ),
    ).toThrow(/identifying field/);
  });

  it('rejects reused nonces and failed rubric items', () => {
    const authority = createTestReviewAuthority();
    const reused = createSignedReviewRecord({
      authority,
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      receipts: [
        safetyReceipt('same-nonce-000001'),
        readerReceipt('same-nonce-000001'),
      ],
      sourceCommitSha: SOURCE_COMMIT,
    });

    expect(() =>
      verifyReviewRecord(reused, authority, { allowTestAuthority: true }),
    ).toThrow(/nonces must be unique/);

    const failedRubric = createSignedReviewRecord({
      authority,
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      receipts: [
        {
          ...safetyReceipt('safety-fail-0001'),
          rubric: {
            ...safetyReceipt('safety-fail-0001').rubric,
            conservative_safety: 'PASS',
          },
        },
        readerReceipt('reader-fail-0001'),
      ],
      sourceCommitSha: SOURCE_COMMIT,
    });
    failedRubric.receipts[0].rubric.conservative_safety = 'FAIL' as 'PASS';

    expect(() =>
      verifyReviewRecord(failedRubric, authority, { allowTestAuthority: true }),
    ).toThrow(/rubric/);
  });

  it('computes a stable public-key fingerprint', () => {
    const authority = createTestReviewAuthority();

    expect(fingerprintPublicKey(authority.publicKeyPem)).toBe(
      authority.fingerprint,
    );
  });
});

import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { digestMovementDetail } from '../src/movement-library/index.js';
import {
  assertUniqueNonces,
  createSignedReviewRecord,
  createTestReviewAuthority,
  fingerprintPublicKey,
  productionReviewAuthorityFromConfig,
  ReviewVerificationError,
  verifyReviewRecord,
} from '../src/movement-library/review-record.js';
import {
  HINGE,
  readerReceipt,
  safetyReceipt,
  SQUAT,
} from './movement-fixtures.js';

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

  it('rejects a nonce reused across two different review records', () => {
    const authority = createTestReviewAuthority();
    const first = createSignedReviewRecord({
      authority,
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      receipts: [
        safetyReceipt('cross-record-nonce-01'),
        readerReceipt('reader-nonce-first-01'),
      ],
      sourceCommitSha: SOURCE_COMMIT,
    });
    const second = createSignedReviewRecord({
      authority,
      contentVersion: HINGE.contentVersion,
      digest: digestMovementDetail(HINGE),
      movementId: HINGE.movementId,
      receipts: [
        safetyReceipt('safety-nonce-second-01'),
        readerReceipt('cross-record-nonce-01'),
      ],
      sourceCommitSha: SOURCE_COMMIT,
    });

    expect(() => assertUniqueNonces([first, second])).toThrow(
      /nonce was reused/,
    );
  });

  it('accepts distinct nonces across multiple review records', () => {
    const authority = createTestReviewAuthority();
    const first = createSignedReviewRecord({
      authority,
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      receipts: [
        safetyReceipt('distinct-nonce-01'),
        readerReceipt('distinct-nonce-02'),
      ],
      sourceCommitSha: SOURCE_COMMIT,
    });
    const second = createSignedReviewRecord({
      authority,
      contentVersion: HINGE.contentVersion,
      digest: digestMovementDetail(HINGE),
      movementId: HINGE.movementId,
      receipts: [
        safetyReceipt('distinct-nonce-03'),
        readerReceipt('distinct-nonce-04'),
      ],
      sourceCommitSha: SOURCE_COMMIT,
    });

    expect(() => assertUniqueNonces([first, second])).not.toThrow();
  });

  it('rejects a malformed digest or source commit SHA', () => {
    const { authority, record } = signedRecord();

    expect(() =>
      verifyReviewRecord(
        { ...record, digest: 'not-a-sha256-digest' },
        authority,
        { allowTestAuthority: true },
      ),
    ).toThrow(/artifact binding is malformed/);

    expect(() =>
      verifyReviewRecord(
        { ...record, sourceCommitSha: 'not-a-commit-sha' },
        authority,
        { allowTestAuthority: true },
      ),
    ).toThrow(/artifact binding is malformed/);
  });

  it('rejects a missing review signature', () => {
    const { authority, record } = signedRecord();

    expect(() =>
      verifyReviewRecord(
        { ...record, signatures: [record.signatures[0], undefined] } as never,
        authority,
        { allowTestAuthority: true },
      ),
    ).toThrow(/signature is missing/);
  });

  it('rejects a tampered review signature', () => {
    const { authority, record } = signedRecord();
    // Flip a character from a full 4-char/3-byte base64url group, not the
    // trailing group: an Ed25519 signature's final base64url character
    // encodes trailing padding bits Node's decoder never validates, so
    // tampering it can silently decode back to the same signature bytes.
    const original = record.signatures[0];
    const tampered = `${original[0] === 'A' ? 'B' : 'A'}${original.slice(1)}`;

    expect(() =>
      verifyReviewRecord(
        { ...record, signatures: [tampered, record.signatures[1]] },
        authority,
        { allowTestAuthority: true },
      ),
    ).toThrow(/signature is invalid/);
  });

  it('rejects an authority whose pinned fingerprint does not match its own public key', () => {
    const { authority, record } = signedRecord();
    const other = createTestReviewAuthority();
    const inconsistentAuthority = {
      ...authority,
      publicKeyPem: other.publicKeyPem,
    };

    expect(() =>
      verifyReviewRecord(record, inconsistentAuthority, {
        allowTestAuthority: true,
      }),
    ).toThrow(/Pinned review authority fingerprint is inconsistent/);
  });
});

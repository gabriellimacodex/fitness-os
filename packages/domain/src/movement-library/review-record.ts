import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

import {
  movementContentVersionSchema,
  movementIdSchema,
} from '@fitness-os/schemas';

export const MOVEMENT_SAFETY_RUBRIC = [
  'starting_position',
  'ordered_steps',
  'observable_cues',
  'conservative_safety',
  'no_medical_or_prescription',
  'no_invented_evidence',
  'actionable_safety',
] as const;

export const INTENDED_READER_RUBRIC = [
  'starting_position',
  'followable_steps',
  'defined_terms',
  'findable_headings',
  'understandable_without_media',
] as const;

export type MovementSafetyRubricKey = (typeof MOVEMENT_SAFETY_RUBRIC)[number];
export type IntendedReaderRubricKey = (typeof INTENDED_READER_RUBRIC)[number];

const IDENTIFYING_FIELDS = [
  'name',
  'handle',
  'email',
  'phone',
  'employer',
  'license',
  'licenseNumber',
  'credential',
  'issuer',
  'reviewerSignature',
  'reviewerId',
  'contact',
] as const;

const QUALIFICATION_CATEGORIES = [
  'exercise_professional',
  'movement_coach',
  'physiotherapy',
  'equivalent',
] as const;

export interface ReviewAuthority {
  fingerprint: string;
  kind: 'production' | 'test';
  publicKeyPem: string;
}

export interface RoleApprovalReceipt {
  issuedAt: string;
  nonce: string;
  qualificationCategory: (typeof QUALIFICATION_CATEGORIES)[number];
  readerPerspective?: 'student' | 'coach';
  role: 'movement_safety' | 'intended_reader';
  rubric: Record<string, 'PASS'>;
  scopeFit: 'pass';
  verifiedHumanness: true;
  verifiedIndependence: true;
}

export interface MovementReviewRecord {
  authorityKeyFingerprint: string;
  contentVersion: number;
  digest: string;
  movementId: string;
  receipts: readonly [RoleApprovalReceipt, RoleApprovalReceipt];
  signatures: readonly [string, string];
  sourceCommitSha: string;
}

export class ReviewVerificationError extends Error {
  override readonly name = 'ReviewVerificationError';
}

const SHA256_HEX = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function fingerprintPublicKey(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem, 'utf8').digest('hex');
}

export function createTestReviewAuthority(): ReviewAuthority & {
  privateKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString();

  return {
    fingerprint: fingerprintPublicKey(publicKeyPem),
    kind: 'test',
    privateKeyPem: privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    publicKeyPem,
  };
}

export function productionReviewAuthorityFromConfig(config: {
  fingerprint?: string;
  publicKeyPem?: string;
}): ReviewAuthority {
  const publicKeyPem = config.publicKeyPem?.trim() ?? '';
  const fingerprint = config.fingerprint?.trim() ?? '';

  if (publicKeyPem === '' || fingerprint === '') {
    throw new ReviewVerificationError(
      'Production review authority is missing.',
    );
  }

  if (fingerprint !== fingerprintPublicKey(publicKeyPem)) {
    throw new ReviewVerificationError(
      'Production review authority fingerprint does not match the public key.',
    );
  }

  return {
    fingerprint,
    kind: 'production',
    publicKeyPem,
  };
}

export function signReceipt(payload: string, privateKeyPem: string): string {
  return sign(
    null,
    Buffer.from(payload, 'utf8'),
    createPrivateKey(privateKeyPem),
  ).toString('base64url');
}

function canonicalReceiptBytes(input: {
  contentVersion: number;
  digest: string;
  movementId: string;
  receipt: RoleApprovalReceipt;
  sourceCommitSha: string;
}): string {
  return JSON.stringify({
    contentVersion: input.contentVersion,
    digest: input.digest,
    issuedAt: input.receipt.issuedAt,
    movementId: input.movementId,
    nonce: input.receipt.nonce,
    qualificationCategory: input.receipt.qualificationCategory,
    readerPerspective: input.receipt.readerPerspective ?? null,
    role: input.receipt.role,
    rubric: Object.fromEntries(
      Object.entries(input.receipt.rubric).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    scopeFit: input.receipt.scopeFit,
    sourceCommitSha: input.sourceCommitSha,
    verifiedHumanness: input.receipt.verifiedHumanness,
    verifiedIndependence: input.receipt.verifiedIndependence,
  });
}

export function createSignedReviewRecord(input: {
  authority: ReviewAuthority & { privateKeyPem: string };
  contentVersion: number;
  digest: string;
  movementId: string;
  receipts: readonly [RoleApprovalReceipt, RoleApprovalReceipt];
  sourceCommitSha: string;
}): MovementReviewRecord {
  const signatures = input.receipts.map((receipt) =>
    signReceipt(
      canonicalReceiptBytes({
        contentVersion: input.contentVersion,
        digest: input.digest,
        movementId: input.movementId,
        receipt,
        sourceCommitSha: input.sourceCommitSha,
      }),
      input.authority.privateKeyPem,
    ),
  ) as [string, string];

  return {
    authorityKeyFingerprint: input.authority.fingerprint,
    contentVersion: input.contentVersion,
    digest: input.digest,
    movementId: input.movementId,
    receipts: input.receipts,
    signatures,
    sourceCommitSha: input.sourceCommitSha,
  };
}

function assertNoIdentifyingFields(value: unknown, path = 'record'): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoIdentifyingFields(item, `${path}[${index}]`);
    }

    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if ((IDENTIFYING_FIELDS as readonly string[]).includes(key)) {
      throw new ReviewVerificationError(
        `Review records must not contain identifying field ${key}.`,
      );
    }

    assertNoIdentifyingFields(nested, `${path}.${key}`);
  }
}

function assertReceipt(
  receipt: RoleApprovalReceipt,
  expectedRole: RoleApprovalReceipt['role'],
): void {
  if (receipt.role !== expectedRole) {
    throw new ReviewVerificationError('Review receipt role is incorrect.');
  }

  if (
    receipt.scopeFit !== 'pass' ||
    receipt.verifiedHumanness !== true ||
    receipt.verifiedIndependence !== true
  ) {
    throw new ReviewVerificationError('Review receipt required fields failed.');
  }

  if (!QUALIFICATION_CATEGORIES.includes(receipt.qualificationCategory)) {
    throw new ReviewVerificationError(
      'Review qualification category is invalid.',
    );
  }

  if (
    !INSTANT_PATTERN.test(receipt.issuedAt) ||
    !NONCE_PATTERN.test(receipt.nonce)
  ) {
    throw new ReviewVerificationError(
      'Review receipt issuance data is invalid.',
    );
  }

  const expectedKeys =
    expectedRole === 'movement_safety'
      ? MOVEMENT_SAFETY_RUBRIC
      : INTENDED_READER_RUBRIC;

  if (
    expectedKeys.some((key) => receipt.rubric[key] !== 'PASS') ||
    Object.keys(receipt.rubric).length !== expectedKeys.length
  ) {
    throw new ReviewVerificationError('Review rubric is incomplete or failed.');
  }

  if (expectedRole === 'intended_reader') {
    if (
      receipt.readerPerspective !== 'student' &&
      receipt.readerPerspective !== 'coach'
    ) {
      throw new ReviewVerificationError(
        'Intended-reader receipts require a reader perspective.',
      );
    }
  } else if (receipt.readerPerspective !== undefined) {
    throw new ReviewVerificationError(
      'Movement/safety receipts must not carry a reader perspective.',
    );
  }
}

function verifySignature(
  payload: string,
  signature: string,
  publicKey: KeyObject,
): boolean {
  return verify(
    null,
    Buffer.from(payload, 'utf8'),
    publicKey,
    Buffer.from(signature, 'base64url'),
  );
}

export function verifyReviewRecord(
  record: MovementReviewRecord,
  authority: ReviewAuthority,
  options: { allowTestAuthority?: boolean } = {},
): void {
  if (authority.kind === 'test' && options.allowTestAuthority !== true) {
    throw new ReviewVerificationError(
      'Test review authorities cannot satisfy publication or Gate A.',
    );
  }

  if (record.authorityKeyFingerprint !== authority.fingerprint) {
    throw new ReviewVerificationError(
      'Review record fingerprint does not match the pinned authority.',
    );
  }

  if (fingerprintPublicKey(authority.publicKeyPem) !== authority.fingerprint) {
    throw new ReviewVerificationError(
      'Pinned review authority fingerprint is inconsistent.',
    );
  }

  movementIdSchema.parse(record.movementId);
  movementContentVersionSchema.parse(record.contentVersion);

  if (
    !SHA256_HEX.test(record.digest) ||
    !COMMIT_SHA.test(record.sourceCommitSha)
  ) {
    throw new ReviewVerificationError('Review artifact binding is malformed.');
  }

  assertNoIdentifyingFields(record);
  assertReceipt(record.receipts[0], 'movement_safety');
  assertReceipt(record.receipts[1], 'intended_reader');

  if (record.receipts[0].nonce === record.receipts[1].nonce) {
    throw new ReviewVerificationError('Review receipt nonces must be unique.');
  }

  const publicKey = createPublicKey(authority.publicKeyPem);

  for (const [index, receipt] of record.receipts.entries()) {
    const signature = record.signatures[index];

    if (signature === undefined) {
      throw new ReviewVerificationError('Review signature is missing.');
    }

    const payload = canonicalReceiptBytes({
      contentVersion: record.contentVersion,
      digest: record.digest,
      movementId: record.movementId,
      receipt,
      sourceCommitSha: record.sourceCommitSha,
    });

    if (!verifySignature(payload, signature, publicKey)) {
      throw new ReviewVerificationError('Review signature is invalid.');
    }
  }
}

export function assertUniqueNonces(
  records: readonly MovementReviewRecord[],
): void {
  const seen = new Set<string>();

  for (const record of records) {
    for (const receipt of record.receipts) {
      if (seen.has(receipt.nonce)) {
        throw new ReviewVerificationError('Review receipt nonce was reused.');
      }

      seen.add(receipt.nonce);
    }
  }
}

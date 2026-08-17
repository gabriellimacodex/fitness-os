import { movementDetailSchema, type MovementDetail } from '@fitness-os/schemas';

import { digestMovementDetail } from '../src/movement-library/index.js';
import type { MovementManifestRecord } from '../src/movement-library/manifest.js';
import {
  createSignedReviewRecord,
  createTestReviewAuthority,
  type RoleApprovalReceipt,
} from '../src/movement-library/review-record.js';

export const SQUAT = movementDetailSchema.parse({
  movementId: 'bodyweight-squat',
  contentVersion: 1,
  name: 'Bodyweight Squat',
  summary: 'A controlled squat using body weight and a stable stance.',
  setup: ['Stand with feet about hip-width apart.'],
  steps: ['Lower with control.', 'Return to standing.'],
  cues: ['Keep the movement slow and even.'],
  commonMistakes: ['Dropping quickly without control.'],
  safetyNotes: [
    'Stop if you feel pain, dizziness, or loss of control and seek qualified help as appropriate.',
  ],
});

export const HINGE = movementDetailSchema.parse({
  movementId: 'hip-hinge',
  contentVersion: 1,
  name: 'Hip Hinge',
  summary: 'A controlled hip-dominant fold that keeps the spine quiet.',
  setup: ['Stand tall with a slight bend in the knees.'],
  steps: ['Push the hips back.', 'Return to standing.'],
  cues: ['Move from the hips, not the neck.'],
  commonMistakes: ['Rounding the back to reach farther.'],
  safetyNotes: [
    'Stop if you feel pain, dizziness, or loss of control and seek qualified help as appropriate.',
  ],
});

export function safetyReceipt(
  nonce: string,
  issuedAt = '2026-08-17T12:00:00.000Z',
): RoleApprovalReceipt {
  return {
    issuedAt,
    nonce,
    qualificationCategory: 'movement_coach',
    role: 'movement_safety',
    rubric: {
      actionable_safety: 'PASS',
      conservative_safety: 'PASS',
      no_invented_evidence: 'PASS',
      no_medical_or_prescription: 'PASS',
      observable_cues: 'PASS',
      ordered_steps: 'PASS',
      starting_position: 'PASS',
    },
    scopeFit: 'pass',
    verifiedHumanness: true,
    verifiedIndependence: true,
  };
}

export function readerReceipt(
  nonce: string,
  issuedAt = '2026-08-17T12:00:01.000Z',
): RoleApprovalReceipt {
  return {
    issuedAt,
    nonce,
    qualificationCategory: 'equivalent',
    readerPerspective: 'student',
    role: 'intended_reader',
    rubric: {
      defined_terms: 'PASS',
      findable_headings: 'PASS',
      followable_steps: 'PASS',
      starting_position: 'PASS',
      understandable_without_media: 'PASS',
    },
    scopeFit: 'pass',
    verifiedHumanness: true,
    verifiedIndependence: true,
  };
}

export function publishRecord(
  detail: MovementDetail,
  sequence = 1,
): MovementManifestRecord {
  return {
    action: 'publish',
    contentVersion: detail.contentVersion,
    digest: digestMovementDetail(detail),
    movementId: detail.movementId,
    reviewRecordPath: `docs/execution/content-reviews/movements/${detail.movementId}-v${detail.contentVersion}.md`,
    sequence,
  };
}

export function reviewedCatalogInput(
  details: readonly MovementDetail[],
  sourceCommitSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
) {
  const authority = createTestReviewAuthority();
  const manifest = details.map((detail, index) =>
    publishRecord(detail, index + 1 === 0 ? 1 : 1),
  );
  const reviewRecords = details.map((detail, index) =>
    createSignedReviewRecord({
      authority,
      contentVersion: detail.contentVersion,
      digest: digestMovementDetail(detail),
      movementId: detail.movementId,
      receipts: [
        safetyReceipt(`safety-${detail.movementId}-${index}`),
        readerReceipt(`reader-${detail.movementId}-${index}`),
      ],
      sourceCommitSha,
    }),
  );

  return {
    allowTestAuthority: true,
    authority,
    manifest,
    published: details,
    reviewRecords,
  };
}

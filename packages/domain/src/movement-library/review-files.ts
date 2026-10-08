import {
  movementContentVersionSchema,
  movementIdSchema,
} from '@fitness-os/schemas';

import type { MovementManifestRecord } from './manifest.js';
import type { MovementReviewRecord } from './review-record.js';

const FIELD = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'm');

export function parseReviewRecordMarkdown(
  markdown: string,
): Pick<
  MovementReviewRecord,
  'contentVersion' | 'digest' | 'movementId' | 'sourceCommitSha'
> {
  const movementId = markdown.match(FIELD('movementId'))?.[1]?.trim();
  const contentVersion = Number(
    markdown.match(FIELD('contentVersion'))?.[1]?.trim(),
  );
  const digest = markdown.match(FIELD('digest'))?.[1]?.trim();
  const sourceCommitSha = markdown.match(FIELD('sourceCommitSha'))?.[1]?.trim();

  if (
    movementId === undefined ||
    digest === undefined ||
    sourceCommitSha === undefined
  ) {
    throw new Error('Review record file is missing required bindings.');
  }

  return {
    contentVersion: movementContentVersionSchema.parse(contentVersion),
    digest,
    movementId: movementIdSchema.parse(movementId),
    sourceCommitSha,
  };
}

export const REVIEW_RECORD_DIRECTORY =
  'docs/execution/content-reviews/movements';

export class ReviewRecordFileBindingError extends Error {
  override readonly name = 'ReviewRecordFileBindingError';
}

export function assertReviewRecordFileMatchesManifest(
  markdown: string,
  record: Pick<
    MovementManifestRecord,
    'contentVersion' | 'digest' | 'movementId'
  >,
): void {
  const parsed = parseReviewRecordMarkdown(markdown);

  if (parsed.movementId !== record.movementId) {
    throw new ReviewRecordFileBindingError(
      'Review record file movementId does not match the manifest record.',
    );
  }

  if (parsed.contentVersion !== record.contentVersion) {
    throw new ReviewRecordFileBindingError(
      'Review record file contentVersion does not match the manifest record.',
    );
  }

  if (parsed.digest !== record.digest) {
    throw new ReviewRecordFileBindingError(
      'Review record file digest does not match the manifest record.',
    );
  }
}

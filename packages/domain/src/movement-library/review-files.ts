import {
  movementContentVersionSchema,
  movementIdSchema,
} from '@fitness-os/schemas';

import type { MovementReviewRecord } from './review-record.js';

const FIELD = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'm');

export function parseReviewRecordMarkdown(
  markdown: string,
): Pick<
  MovementReviewRecord,
  'contentVersion' | 'digest' | 'movementId' | 'sourceCommitSha'
> {
  const movementId = markdown.match(FIELD('movementId'))?.[1]?.trim();
  const contentVersionRaw = markdown
    .match(FIELD('contentVersion'))?.[1]
    ?.trim();
  const digest = markdown.match(FIELD('digest'))?.[1]?.trim();
  const sourceCommitSha = markdown.match(FIELD('sourceCommitSha'))?.[1]?.trim();

  if (
    movementId === undefined ||
    contentVersionRaw === undefined ||
    digest === undefined ||
    sourceCommitSha === undefined
  ) {
    throw new Error('Review record file is missing required bindings.');
  }

  const contentVersion = Number(contentVersionRaw);

  if (Number.isNaN(contentVersion)) {
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

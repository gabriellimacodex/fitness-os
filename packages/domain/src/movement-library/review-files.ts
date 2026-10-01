import {
  movementContentVersionSchema,
  movementIdSchema,
} from '@fitness-os/schemas';

import type { MovementReviewRecord } from './review-record.js';

const FIELD = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'm');

// Matches the exact-artifact binding patterns `verifyReviewRecord` enforces
// in `./review-record.js` (`SHA256_HEX` / `COMMIT_SHA`). A review record file
// binds a durable review to one immutable content digest and source commit;
// a malformed value here must fail parsing rather than propagate an
// unverifiable binding into the manifest/catalog check.
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;

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

  if (
    !DIGEST_PATTERN.test(digest) ||
    !SOURCE_COMMIT_SHA_PATTERN.test(sourceCommitSha)
  ) {
    throw new Error(
      'Review record file has a malformed digest or sourceCommitSha binding.',
    );
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

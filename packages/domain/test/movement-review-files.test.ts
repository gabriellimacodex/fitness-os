import { describe, expect, it } from 'vitest';

import {
  assertReviewRecordFileMatchesManifest,
  parseReviewRecordMarkdown,
  ReviewRecordFileBindingError,
} from '../src/movement-library/review-files.js';

const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'c'.repeat(64);
const SOURCE_COMMIT_SHA = 'b'.repeat(40);

function reviewMarkdown(fields: {
  contentVersion: number;
  digest: string;
  movementId: string;
}): string {
  return `
movementId: ${fields.movementId}
contentVersion: ${fields.contentVersion}
digest: ${fields.digest}
sourceCommitSha: ${SOURCE_COMMIT_SHA}
`;
}

describe('parseReviewRecordMarkdown', () => {
  it('reads the required artifact bindings', () => {
    expect(
      parseReviewRecordMarkdown(
        reviewMarkdown({
          contentVersion: 1,
          digest: DIGEST,
          movementId: 'bodyweight-squat',
        }),
      ),
    ).toMatchObject({
      contentVersion: 1,
      movementId: 'bodyweight-squat',
    });
  });

  it('rejects a file without bindings', () => {
    expect(() => parseReviewRecordMarkdown('# empty')).toThrow(/missing/);
  });
});

describe('assertReviewRecordFileMatchesManifest', () => {
  const manifestRecord = {
    contentVersion: 1,
    digest: DIGEST,
    movementId: 'bodyweight-squat',
  };

  it('accepts a review record file bound to the exact manifest record', () => {
    expect(() =>
      assertReviewRecordFileMatchesManifest(
        reviewMarkdown(manifestRecord),
        manifestRecord,
      ),
    ).not.toThrow();
  });

  it('rejects a review record file for a different movement', () => {
    expect(() =>
      assertReviewRecordFileMatchesManifest(
        reviewMarkdown({ ...manifestRecord, movementId: 'bodyweight-lunge' }),
        manifestRecord,
      ),
    ).toThrow(ReviewRecordFileBindingError);
  });

  it('rejects a review record file for a different content version', () => {
    expect(() =>
      assertReviewRecordFileMatchesManifest(
        reviewMarkdown({ ...manifestRecord, contentVersion: 2 }),
        manifestRecord,
      ),
    ).toThrow(/contentVersion/);
  });

  it('rejects a review record file bound to a different content digest', () => {
    expect(() =>
      assertReviewRecordFileMatchesManifest(
        reviewMarkdown({ ...manifestRecord, digest: OTHER_DIGEST }),
        manifestRecord,
      ),
    ).toThrow(/digest/);
  });
});

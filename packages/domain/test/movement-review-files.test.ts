import { describe, expect, it } from 'vitest';

import { parseReviewRecordMarkdown } from '../src/movement-library/review-files.js';

describe('parseReviewRecordMarkdown', () => {
  it('reads the required artifact bindings', () => {
    expect(
      parseReviewRecordMarkdown(`
movementId: bodyweight-squat
contentVersion: 1
digest: ${'a'.repeat(64)}
sourceCommitSha: ${'b'.repeat(40)}
`),
    ).toMatchObject({
      contentVersion: 1,
      movementId: 'bodyweight-squat',
    });
  });

  it('rejects a file without bindings', () => {
    expect(() => parseReviewRecordMarkdown('# empty')).toThrow(/missing/);
  });

  it('rejects a file missing only contentVersion', () => {
    expect(() =>
      parseReviewRecordMarkdown(`
movementId: bodyweight-squat
digest: ${'a'.repeat(64)}
sourceCommitSha: ${'b'.repeat(40)}
`),
    ).toThrow(/missing/);
  });

  it('rejects a non-numeric contentVersion', () => {
    expect(() =>
      parseReviewRecordMarkdown(`
movementId: bodyweight-squat
contentVersion: not-a-number
digest: ${'a'.repeat(64)}
sourceCommitSha: ${'b'.repeat(40)}
`),
    ).toThrow(/missing/);
  });
});

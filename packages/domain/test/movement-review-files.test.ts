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

  it('rejects a digest that is not exactly 64 lowercase hex characters', () => {
    expect(() =>
      parseReviewRecordMarkdown(`
movementId: bodyweight-squat
contentVersion: 1
digest: ${'a'.repeat(63)}
sourceCommitSha: ${'b'.repeat(40)}
`),
    ).toThrow(/malformed digest/);
  });

  it('rejects a digest containing non-hex characters', () => {
    expect(() =>
      parseReviewRecordMarkdown(`
movementId: bodyweight-squat
contentVersion: 1
digest: ${'A'.repeat(64)}
sourceCommitSha: ${'b'.repeat(40)}
`),
    ).toThrow(/malformed digest/);
  });

  it('rejects a sourceCommitSha that is not exactly 40 lowercase hex characters', () => {
    expect(() =>
      parseReviewRecordMarkdown(`
movementId: bodyweight-squat
contentVersion: 1
digest: ${'a'.repeat(64)}
sourceCommitSha: ${'b'.repeat(39)}
`),
    ).toThrow(/malformed digest/);
  });

  it('rejects a sourceCommitSha containing non-hex characters', () => {
    expect(() =>
      parseReviewRecordMarkdown(`
movementId: bodyweight-squat
contentVersion: 1
digest: ${'a'.repeat(64)}
sourceCommitSha: ${'g'.repeat(40)}
`),
    ).toThrow(/malformed digest/);
  });
});

import { describe, expect, it } from 'vitest';

import {
  assertManifestHistory,
  COMMITTED_MOVEMENT_MANIFEST,
  COMMITTED_PUBLISHED_MOVEMENTS,
  digestMovementDetail,
} from '../src/movement-library/index.js';
import { SQUAT } from './movement-fixtures.js';

const publishedRecord = {
  action: 'publish' as const,
  contentVersion: SQUAT.contentVersion,
  digest: digestMovementDetail(SQUAT),
  movementId: SQUAT.movementId,
  reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v1.md`,
  sequence: 1,
};

describe('committed movement ledger', () => {
  it('starts as an empty version-controlled catalog and manifest', () => {
    expect(COMMITTED_PUBLISHED_MOVEMENTS).toEqual([]);
    expect(COMMITTED_MOVEMENT_MANIFEST).toEqual([]);
    expect(Object.isFrozen(COMMITTED_PUBLISHED_MOVEMENTS)).toBe(true);
    expect(Object.isFrozen(COMMITTED_MOVEMENT_MANIFEST)).toBe(true);
  });

  it('accepts append-only growth from the merge-base ledger', () => {
    expect(() =>
      assertManifestHistory(COMMITTED_MOVEMENT_MANIFEST, [publishedRecord]),
    ).not.toThrow();
  });

  it('rejects mutation, removal, and reorder of existing records', () => {
    const base = [publishedRecord];
    const mutated = [{ ...publishedRecord, digest: '0'.repeat(64) }];
    const removed: typeof base = [];
    const reordered = [
      { ...publishedRecord, sequence: 2, action: 'revise' as const },
      publishedRecord,
    ];

    expect(() => assertManifestHistory(base, mutated)).toThrow(/mutated/);
    expect(() => assertManifestHistory(base, removed)).toThrow(/removed/);
    expect(() => assertManifestHistory(base, reordered)).toThrow(/reordered/);
  });
});

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

  it('rejects reusing the same action at an already-recorded content version', () => {
    const base = [publishedRecord];
    const reused = [
      ...base,
      { ...publishedRecord, sequence: 2, digest: '1'.repeat(64) },
    ];

    expect(() => assertManifestHistory(base, reused)).toThrow(/reused/);
  });

  it('allows a different action at an already-recorded content version', () => {
    const base = [publishedRecord];
    const revised = [
      ...base,
      {
        ...publishedRecord,
        action: 'revise' as const,
        digest: '2'.repeat(64),
        sequence: 2,
      },
    ];

    expect(() => assertManifestHistory(base, revised)).not.toThrow();
  });

  it('does not treat a withdrawn record as blocking reuse of its own action', () => {
    const withdrawn = {
      ...publishedRecord,
      action: 'withdraw' as const,
      reviewRecordPath: null,
      sequence: 2,
    };
    const base = [publishedRecord, withdrawn];
    const republished = [
      ...base,
      {
        ...publishedRecord,
        action: 'republish' as const,
        digest: '3'.repeat(64),
        sequence: 3,
      },
    ];

    expect(() => assertManifestHistory(base, republished)).not.toThrow();
  });

  it('still rejects reusing the pre-withdrawal action at the same content version', () => {
    const withdrawn = {
      ...publishedRecord,
      action: 'withdraw' as const,
      reviewRecordPath: null,
      sequence: 2,
    };
    const base = [publishedRecord, withdrawn];
    const republishedSameAction = [
      ...base,
      { ...publishedRecord, digest: '4'.repeat(64), sequence: 3 },
    ];

    expect(() => assertManifestHistory(base, republishedSameAction)).toThrow(
      /reused/,
    );
  });
});

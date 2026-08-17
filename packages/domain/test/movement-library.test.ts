import { describe, expect, it } from 'vitest';

import { movementDetailSchema } from '@fitness-os/schemas';

import {
  createMovementCatalog,
  createSignedReviewRecord,
  digestMovementDetail,
  getMovementById,
  listMovements,
  MovementCatalogError,
  type MovementManifestRecord,
} from '../src/movement-library/index.js';
import {
  HINGE,
  readerReceipt,
  reviewedCatalogInput,
  safetyReceipt,
  SQUAT,
} from './movement-fixtures.js';

describe('default movement catalog', () => {
  it('lists no published movements', () => {
    expect(listMovements()).toEqual([]);
  });

  it('treats unknown valid identifiers as not found', () => {
    expect(getMovementById(SQUAT.movementId)).toEqual({ status: 'not_found' });
  });

  it('treats malformed identifiers as invalid', () => {
    expect(getMovementById('AB')).toEqual({ status: 'invalid' });
  });
});

describe('createMovementCatalog', () => {
  it('lists published entries in movementId byte order', () => {
    const catalog = createMovementCatalog(reviewedCatalogInput([HINGE, SQUAT]));

    expect(catalog.listMovements().map((item) => item.movementId)).toEqual([
      SQUAT.movementId,
      HINGE.movementId,
    ]);
  });

  it('returns a cloned published detail', () => {
    const catalog = createMovementCatalog(reviewedCatalogInput([SQUAT]));
    const found = catalog.getMovementById(SQUAT.movementId);

    expect(found).toEqual({ status: 'found', value: SQUAT });

    if (found.status === 'found') {
      found.value.steps.push('Do not mutate the catalog.');
    }

    expect(catalog.getMovementById(SQUAT.movementId)).toEqual({
      status: 'found',
      value: SQUAT,
    });
  });

  it('rejects duplicate published identifiers', () => {
    expect(() =>
      createMovementCatalog(reviewedCatalogInput([SQUAT, SQUAT])),
    ).toThrow(MovementCatalogError);
  });

  it('rejects a 101-item catalog', () => {
    const details = Array.from({ length: 101 }, (_, index) =>
      movementDetailSchema.parse({
        ...SQUAT,
        movementId: `movement-${String(index + 1).padStart(3, '0')}`,
      }),
    );

    expect(() => createMovementCatalog(reviewedCatalogInput(details))).toThrow(
      /cannot exceed 100/,
    );
  });

  it('rejects reserved identifier reuse after withdrawal', () => {
    const input = reviewedCatalogInput([SQUAT]);
    const withdraw: MovementManifestRecord = {
      action: 'withdraw',
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      reviewRecordPath: null,
      sequence: 2,
    };

    expect(() =>
      createMovementCatalog({
        ...input,
        manifest: [...input.manifest, withdraw],
      }),
    ).toThrow(/reserved/);
  });

  it('derives the current catalog from the latest lifecycle record', () => {
    const revised = {
      ...SQUAT,
      contentVersion: 2,
      name: 'Bodyweight Squat v2',
    };
    const first = reviewedCatalogInput([SQUAT]);
    const authority = first.authority;
    const reviseRecord: MovementManifestRecord = {
      action: 'revise',
      contentVersion: 2,
      digest: digestMovementDetail(revised),
      movementId: revised.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${revised.movementId}-v2.md`,
      sequence: 2,
    };
    const revisionReview = createSignedReviewRecord({
      authority,
      contentVersion: 2,
      digest: digestMovementDetail(revised),
      movementId: revised.movementId,
      receipts: [
        safetyReceipt('safety-revise-0001'),
        readerReceipt('reader-revise-0001'),
      ],
      sourceCommitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });

    const catalog = createMovementCatalog({
      allowTestAuthority: true,
      authority,
      manifest: [...first.manifest, reviseRecord],
      published: [revised],
      reviewRecords: [...first.reviewRecords, revisionReview],
    });

    expect(catalog.getMovementById(SQUAT.movementId)).toEqual({
      status: 'found',
      value: revised,
    });
  });

  it('rejects digest drift between catalog and manifest', () => {
    const input = reviewedCatalogInput([SQUAT]);

    expect(() =>
      createMovementCatalog({
        ...input,
        published: [{ ...SQUAT, name: 'Changed Without Version' }],
      }),
    ).toThrow(/digest or version drifted/);
  });

  it('rejects a published version without a review record', () => {
    const input = reviewedCatalogInput([SQUAT]);

    expect(() =>
      createMovementCatalog({
        ...input,
        reviewRecords: [],
      }),
    ).toThrow(/durable review record/);
  });

  it('rejects skipped manifest versions', () => {
    const revised = { ...SQUAT, contentVersion: 3, name: 'Skipped Version' };
    const input = reviewedCatalogInput([SQUAT]);

    expect(() =>
      createMovementCatalog({
        ...input,
        manifest: [
          ...input.manifest,
          {
            action: 'revise',
            contentVersion: 3,
            digest: digestMovementDetail(revised),
            movementId: SQUAT.movementId,
            reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v3.md`,
            sequence: 2,
          },
        ],
        published: [revised],
      }),
    ).toThrow(/increment by one/);
  });
});

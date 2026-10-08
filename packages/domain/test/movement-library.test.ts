import { describe, expect, it } from 'vitest';

import { movementDetailSchema } from '@fitness-os/schemas';

import {
  assertValidManifestRecord,
  createMovementCatalog,
  deriveManifestState,
  digestMovementDetail,
  getMovementById,
  listMovements,
  MovementCatalogError,
  type MovementManifestRecord,
} from '../src/movement-library/index.js';
import { createSignedReviewRecord } from '../src/movement-library/review-record.js';
import {
  HINGE,
  publishRecord,
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

  it('excludes a withdrawn movement from catalog lookups', () => {
    const input = reviewedCatalogInput([SQUAT, HINGE]);
    const withdraw: MovementManifestRecord = {
      action: 'withdraw',
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      reviewRecordPath: null,
      sequence: 2,
    };

    const catalog = createMovementCatalog({
      ...input,
      manifest: [...input.manifest, withdraw],
      published: [HINGE],
    });

    expect(catalog.getMovementById(SQUAT.movementId)).toEqual({
      status: 'not_found',
    });
    expect(catalog.listMovements().map((item) => item.movementId)).toEqual([
      HINGE.movementId,
    ]);
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

  it('rejects a review record whose digest does not match the manifest record', () => {
    const input = reviewedCatalogInput([SQUAT]);
    const tamperedReview = createSignedReviewRecord({
      authority: input.authority,
      contentVersion: SQUAT.contentVersion,
      digest: '9'.repeat(64),
      movementId: SQUAT.movementId,
      receipts: [
        safetyReceipt('safety-tampered-digest-01'),
        readerReceipt('reader-tampered-digest-01'),
      ],
      sourceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(() =>
      createMovementCatalog({
        ...input,
        reviewRecords: [tamperedReview],
      }),
    ).toThrow(/bind the exact movement artifact/);
  });

  it('rejects a review receipt nonce reused across two published movements', () => {
    const input = reviewedCatalogInput([SQUAT, HINGE]);
    const sharedNonce = 'safety-shared-across-movements-01';
    const squatReview = createSignedReviewRecord({
      authority: input.authority,
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      receipts: [safetyReceipt(sharedNonce), readerReceipt('reader-squat-01')],
      sourceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const hingeReview = createSignedReviewRecord({
      authority: input.authority,
      contentVersion: HINGE.contentVersion,
      digest: digestMovementDetail(HINGE),
      movementId: HINGE.movementId,
      receipts: [safetyReceipt(sharedNonce), readerReceipt('reader-hinge-01')],
      sourceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(() =>
      createMovementCatalog({
        ...input,
        reviewRecords: [squatReview, hingeReview],
      }),
    ).toThrow(/nonce was reused/);
  });

  it('rejects a published movement absent from the manifest', () => {
    expect(() =>
      createMovementCatalog({ manifest: [], published: [SQUAT] }),
    ).toThrow(/latest manifest lifecycle/);
  });

  it('rejects a current manifest entry with no published detail', () => {
    expect(() =>
      createMovementCatalog({
        manifest: [publishRecord(SQUAT)],
        published: [],
      }),
    ).toThrow(/published catalog detail/);
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

describe('assertValidManifestRecord', () => {
  it('rejects a non-positive sequence', () => {
    const record = publishRecord(SQUAT, 0);

    expect(() => assertValidManifestRecord(record)).toThrow(/positive integer/);
  });

  it('rejects a malformed digest', () => {
    const record: MovementManifestRecord = {
      ...publishRecord(SQUAT, 1),
      digest: 'not-a-valid-digest',
    };

    expect(() => assertValidManifestRecord(record)).toThrow(/malformed/);
  });

  it('rejects a withdrawal record that carries a review path', () => {
    const record: MovementManifestRecord = {
      action: 'withdraw',
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v1.md`,
      sequence: 2,
    };

    expect(() => assertValidManifestRecord(record)).toThrow(
      /must not carry a review path/,
    );
  });

  it('rejects a non-withdrawal record with a mismatched review path', () => {
    const record: MovementManifestRecord = {
      ...publishRecord(SQUAT, 1),
      reviewRecordPath:
        'docs/execution/content-reviews/movements/wrong-id-v1.md',
    };

    expect(() => assertValidManifestRecord(record)).toThrow(
      /does not match the expected record/,
    );
  });
});

describe('deriveManifestState', () => {
  it('rejects a sparse manifest array', () => {
    const publish: MovementManifestRecord = {
      action: 'publish',
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v1.md`,
      sequence: 1,
    };
    const sparse: MovementManifestRecord[] = [];
    sparse[1] = publish;

    expect(sparse).toHaveLength(2);
    expect(() => deriveManifestState(sparse)).toThrow(/sparse/);
  });

  it('accepts a dense manifest array with no holes', () => {
    const publish: MovementManifestRecord = {
      action: 'publish',
      contentVersion: SQUAT.contentVersion,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v1.md`,
      sequence: 1,
    };

    expect(() => deriveManifestState([publish])).not.toThrow();
  });

  it('rejects a movement whose first record does not start at sequence 1', () => {
    const record = publishRecord(SQUAT, 2);

    expect(() => deriveManifestState([record])).toThrow(/publish sequence 1/);
  });

  it('rejects a movement whose first published version is not 1', () => {
    const record: MovementManifestRecord = {
      action: 'publish',
      contentVersion: 2,
      digest: digestMovementDetail(SQUAT),
      movementId: SQUAT.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v2.md`,
      sequence: 1,
    };

    expect(() => deriveManifestState([record])).toThrow(
      /must start at version 1/,
    );
  });

  it('rejects a non-consecutive manifest sequence', () => {
    const first = publishRecord(SQUAT, 1);
    const second: MovementManifestRecord = {
      action: 'revise',
      contentVersion: 2,
      digest: digestMovementDetail({ ...SQUAT, name: 'Revised Squat' }),
      movementId: SQUAT.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v2.md`,
      sequence: 3,
    };

    expect(() => deriveManifestState([first, second])).toThrow(
      /sequences must increment by one/,
    );
  });

  it('rejects a non-republish action following a withdrawal', () => {
    const first = publishRecord(SQUAT, 1);
    const withdraw: MovementManifestRecord = {
      action: 'withdraw',
      contentVersion: first.contentVersion,
      digest: first.digest,
      movementId: SQUAT.movementId,
      reviewRecordPath: null,
      sequence: 2,
    };
    const revise: MovementManifestRecord = {
      action: 'revise',
      contentVersion: 2,
      digest: digestMovementDetail({ ...SQUAT, name: 'Revised Squat' }),
      movementId: SQUAT.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v2.md`,
      sequence: 3,
    };

    expect(() => deriveManifestState([first, withdraw, revise])).toThrow(
      /only be republished/,
    );
  });

  it('rejects a republish action that does not follow a withdrawal', () => {
    const first = publishRecord(SQUAT, 1);
    const republish: MovementManifestRecord = {
      action: 'republish',
      contentVersion: 2,
      digest: digestMovementDetail({ ...SQUAT, name: 'Revised Squat' }),
      movementId: SQUAT.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${SQUAT.movementId}-v2.md`,
      sequence: 2,
    };

    expect(() => deriveManifestState([first, republish])).toThrow(
      /only valid after withdrawal/,
    );
  });

  it('rejects a withdrawal that changes the preceding version or digest', () => {
    const first = publishRecord(SQUAT, 1);
    const withdraw: MovementManifestRecord = {
      action: 'withdraw',
      contentVersion: first.contentVersion + 1,
      digest: first.digest,
      movementId: SQUAT.movementId,
      reviewRecordPath: null,
      sequence: 2,
    };

    expect(() => deriveManifestState([first, withdraw])).toThrow(
      /retain the preceding version and digest/,
    );
  });
});

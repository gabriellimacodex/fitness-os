import {
  movementDetailSchema,
  movementIdSchema,
  movementSummarySchema,
  type MovementDetail,
  type MovementId,
  type MovementSummary,
} from '@fitness-os/schemas';

import { cloneMovementDetail, digestMovementDetail } from './canonical.js';
import { COMMITTED_MOVEMENT_MANIFEST } from './manifest-records.js';
import {
  deriveManifestState,
  type MovementManifestRecord,
} from './manifest.js';
import { COMMITTED_PUBLISHED_MOVEMENTS } from './published.js';
import {
  assertUniqueNonces,
  verifyReviewRecord,
  type MovementReviewRecord,
  type ReviewAuthority,
} from './review-record.js';

export type MovementLookupResult =
  | { status: 'invalid' }
  | { status: 'not_found' }
  | { status: 'found'; value: MovementDetail };

export interface MovementCatalog {
  getMovementById(movementId: string): MovementLookupResult;
  listMovements(): MovementSummary[];
}

export interface MovementCatalogSource {
  authority?: ReviewAuthority;
  allowTestAuthority?: boolean;
  manifest?: readonly MovementManifestRecord[];
  previewWithoutReview?: boolean;
  published?: readonly MovementDetail[];
  reviewRecords?: readonly MovementReviewRecord[];
}

export class MovementCatalogError extends Error {
  override readonly name = 'MovementCatalogError';
}

function toSummary(detail: MovementDetail): MovementSummary {
  return movementSummarySchema.parse({
    contentVersion: detail.contentVersion,
    movementId: detail.movementId,
    name: detail.name,
    summary: detail.summary,
  });
}

export function createMovementCatalog(
  source: MovementCatalogSource = {},
): MovementCatalog {
  const published = source.published ?? COMMITTED_PUBLISHED_MOVEMENTS;
  const manifest = source.manifest ?? COMMITTED_MOVEMENT_MANIFEST;
  const reviewRecords = source.reviewRecords ?? [];

  if (published.length > 100) {
    throw new MovementCatalogError(
      'Published catalogs cannot exceed 100 movements.',
    );
  }

  let derived;

  try {
    derived = deriveManifestState(manifest);
  } catch (error) {
    throw new MovementCatalogError(
      error instanceof Error ? error.message : 'Manifest is invalid.',
    );
  }

  const publishedById = new Map<MovementId, MovementDetail>();

  for (const entry of published) {
    const detail = cloneMovementDetail(movementDetailSchema.parse(entry));
    const latest = derived.current.get(detail.movementId);

    if (publishedById.has(detail.movementId)) {
      throw new MovementCatalogError('Published movement IDs must be unique.');
    }

    if (latest === undefined) {
      if (derived.reservedIds.has(detail.movementId)) {
        throw new MovementCatalogError(
          'Withdrawn movement identifiers remain reserved.',
        );
      }

      throw new MovementCatalogError(
        'Published movements must match the latest manifest lifecycle.',
      );
    }

    if (
      latest.contentVersion !== detail.contentVersion ||
      latest.digest !== digestMovementDetail(detail)
    ) {
      throw new MovementCatalogError(
        'Published movement digest or version drifted from the manifest.',
      );
    }

    publishedById.set(detail.movementId, detail);
  }

  for (const movementId of derived.current.keys()) {
    if (!publishedById.has(movementIdSchema.parse(movementId))) {
      throw new MovementCatalogError(
        'Current manifest entries must have a published catalog detail.',
      );
    }
  }

  const requiredReviews = manifest.filter(
    (record) => record.action !== 'withdraw',
  );

  if (requiredReviews.length > 0 && source.previewWithoutReview !== true) {
    if (source.authority === undefined) {
      throw new MovementCatalogError(
        'Published movements require a review authority.',
      );
    }

    const recordsByPath = new Map(
      reviewRecords.map((record) => [
        `docs/execution/content-reviews/movements/${record.movementId}-v${record.contentVersion}.md`,
        record,
      ]),
    );

    try {
      assertUniqueNonces(reviewRecords);

      for (const record of requiredReviews) {
        const reviewRecord =
          record.reviewRecordPath === null
            ? undefined
            : recordsByPath.get(record.reviewRecordPath);

        if (reviewRecord === undefined) {
          throw new MovementCatalogError(
            'Published movement versions require a durable review record.',
          );
        }

        if (
          reviewRecord.movementId !== record.movementId ||
          reviewRecord.contentVersion !== record.contentVersion ||
          reviewRecord.digest !== record.digest
        ) {
          throw new MovementCatalogError(
            'Review record does not bind the exact movement artifact.',
          );
        }

        verifyReviewRecord(reviewRecord, source.authority, {
          allowTestAuthority: source.allowTestAuthority,
        });
      }
    } catch (error) {
      throw new MovementCatalogError(
        error instanceof Error ? error.message : 'Review evidence is invalid.',
      );
    }
  }

  const summaries = [...publishedById.values()]
    .map(toSummary)
    .sort((left, right) =>
      Buffer.from(left.movementId, 'utf8').compare(
        Buffer.from(right.movementId, 'utf8'),
      ),
    );

  return {
    getMovementById(movementId) {
      const parsed = movementIdSchema.safeParse(movementId);

      if (!parsed.success) {
        return { status: 'invalid' };
      }

      const value = publishedById.get(parsed.data);

      return value === undefined
        ? { status: 'not_found' }
        : { status: 'found', value: cloneMovementDetail(value) };
    },
    listMovements() {
      return summaries.map((summary) => movementSummarySchema.parse(summary));
    },
  };
}

export const movementCatalog = createMovementCatalog({
  previewWithoutReview: true,
});

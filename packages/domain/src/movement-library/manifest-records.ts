import { digestMovementDetail } from './canonical.js';
import type { MovementManifestRecord } from './manifest.js';
import { COMMITTED_PUBLISHED_MOVEMENTS } from './published.js';

export const COMMITTED_MOVEMENT_MANIFEST: readonly MovementManifestRecord[] =
  Object.freeze(
    COMMITTED_PUBLISHED_MOVEMENTS.map((detail) => ({
      action: 'publish' as const,
      contentVersion: detail.contentVersion,
      digest: digestMovementDetail(detail),
      movementId: detail.movementId,
      reviewRecordPath: `docs/execution/content-reviews/movements/${detail.movementId}-v${detail.contentVersion}.md`,
      sequence: 1,
    })),
  );

export function assertManifestHistory(
  previous: readonly MovementManifestRecord[],
  next: readonly MovementManifestRecord[],
): void {
  if (next.length < previous.length) {
    throw new Error('Manifest records cannot be removed.');
  }

  for (const [index, record] of previous.entries()) {
    const candidate = next[index];

    if (candidate === undefined) {
      throw new Error('Manifest records cannot be removed.');
    }

    if (JSON.stringify(candidate) !== JSON.stringify(record)) {
      throw new Error(
        'Existing manifest records cannot be mutated or reordered.',
      );
    }
  }

  const previousIds = new Set(previous.map((record) => record.movementId));

  for (const record of next.slice(previous.length)) {
    const earlier = previous.find(
      (item) =>
        item.movementId === record.movementId &&
        item.contentVersion === record.contentVersion &&
        item.action !== 'withdraw',
    );

    if (earlier !== undefined && earlier.action === record.action) {
      throw new Error('Manifest versions cannot be reused.');
    }

    void previousIds;
  }
}

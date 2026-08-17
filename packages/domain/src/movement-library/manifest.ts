import {
  movementContentVersionSchema,
  movementIdSchema,
} from '@fitness-os/schemas';

export const MOVEMENT_MANIFEST_ACTIONS = [
  'publish',
  'revise',
  'withdraw',
  'republish',
] as const;

export type MovementManifestAction = (typeof MOVEMENT_MANIFEST_ACTIONS)[number];

export interface MovementManifestRecord {
  sequence: number;
  movementId: string;
  contentVersion: number;
  action: MovementManifestAction;
  digest: string;
  reviewRecordPath: string | null;
}

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export function assertValidManifestRecord(
  record: MovementManifestRecord,
): void {
  movementIdSchema.parse(record.movementId);
  movementContentVersionSchema.parse(record.contentVersion);

  if (!Number.isInteger(record.sequence) || record.sequence < 1) {
    throw new Error('Manifest sequence must be a positive integer.');
  }

  if (
    !MOVEMENT_MANIFEST_ACTIONS.includes(record.action) ||
    !DIGEST_PATTERN.test(record.digest)
  ) {
    throw new Error('Manifest record is malformed.');
  }

  if (record.action === 'withdraw') {
    if (record.reviewRecordPath !== null) {
      throw new Error('Withdrawal records must not carry a review path.');
    }

    return;
  }

  if (
    record.reviewRecordPath !==
    `docs/execution/content-reviews/movements/${record.movementId}-v${record.contentVersion}.md`
  ) {
    throw new Error('Manifest review path does not match the expected record.');
  }
}

export function deriveManifestState(
  records: readonly MovementManifestRecord[],
): {
  reservedIds: ReadonlySet<string>;
  current: ReadonlyMap<
    string,
    { contentVersion: number; digest: string; action: MovementManifestAction }
  >;
} {
  const byMovement = new Map<string, MovementManifestRecord[]>();

  for (const [index, record] of records.entries()) {
    assertValidManifestRecord(record);

    if (index > 0 && records[index - 1] === undefined) {
      throw new Error('Manifest records cannot be sparse.');
    }

    const history = byMovement.get(record.movementId) ?? [];
    const previous = history.at(-1);

    if (previous === undefined) {
      if (record.action !== 'publish' || record.sequence !== 1) {
        throw new Error('A new movement must begin with publish sequence 1.');
      }

      if (record.contentVersion !== 1) {
        throw new Error('A newly published movement must start at version 1.');
      }
    } else {
      if (record.sequence !== previous.sequence + 1) {
        throw new Error('Manifest sequences must increment by one.');
      }

      if (previous.action === 'withdraw' && record.action !== 'republish') {
        throw new Error('A withdrawn identifier may only be republished.');
      }

      if (previous.action !== 'withdraw' && record.action === 'republish') {
        throw new Error('Republish is only valid after withdrawal.');
      }

      if (record.action === 'withdraw') {
        if (
          record.contentVersion !== previous.contentVersion ||
          record.digest !== previous.digest
        ) {
          throw new Error(
            'Withdrawal must retain the preceding version and digest.',
          );
        }
      } else if (record.contentVersion !== previous.contentVersion + 1) {
        throw new Error('Content versions must increment by one.');
      }
    }

    history.push(record);
    byMovement.set(record.movementId, history);
  }

  const current = new Map<
    string,
    { contentVersion: number; digest: string; action: MovementManifestAction }
  >();
  const reservedIds = new Set<string>();

  for (const [movementId, history] of byMovement) {
    const latest = history.at(-1);

    if (latest === undefined) {
      continue;
    }

    reservedIds.add(movementId);

    if (latest.action !== 'withdraw') {
      current.set(movementId, {
        action: latest.action,
        contentVersion: latest.contentVersion,
        digest: latest.digest,
      });
    }
  }

  return { current, reservedIds };
}

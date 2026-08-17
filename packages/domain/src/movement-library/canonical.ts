import { createHash } from 'node:crypto';

import { movementDetailSchema, type MovementDetail } from '@fitness-os/schemas';

export function canonicalizeMovementDetail(detail: MovementDetail): string {
  const parsed = movementDetailSchema.parse(detail);

  return JSON.stringify({
    movementId: parsed.movementId,
    contentVersion: parsed.contentVersion,
    name: parsed.name,
    summary: parsed.summary,
    setup: parsed.setup,
    steps: parsed.steps,
    cues: parsed.cues,
    commonMistakes: parsed.commonMistakes,
    safetyNotes: parsed.safetyNotes,
  });
}

export function digestMovementDetail(detail: MovementDetail): string {
  return createHash('sha256')
    .update(canonicalizeMovementDetail(detail), 'utf8')
    .digest('hex');
}

export function cloneMovementDetail(detail: MovementDetail): MovementDetail {
  return movementDetailSchema.parse({
    movementId: detail.movementId,
    contentVersion: detail.contentVersion,
    name: detail.name,
    summary: detail.summary,
    setup: [...detail.setup],
    steps: [...detail.steps],
    cues: [...detail.cues],
    commonMistakes: [...detail.commonMistakes],
    safetyNotes: [...detail.safetyNotes],
  });
}

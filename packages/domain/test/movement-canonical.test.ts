import { describe, expect, it } from 'vitest';

import {
  canonicalizeMovementDetail,
  cloneMovementDetail,
  digestMovementDetail,
} from '../src/movement-library/index.js';
import { SQUAT } from './movement-fixtures.js';

describe('digestMovementDetail', () => {
  it('produces the same digest for two structurally-equal details built independently', () => {
    const first = { ...SQUAT, setup: [...SQUAT.setup] };
    const second = { ...SQUAT, setup: [...SQUAT.setup] };

    expect(digestMovementDetail(first)).toBe(digestMovementDetail(second));
  });

  it('changes when the name changes', () => {
    expect(digestMovementDetail({ ...SQUAT, name: 'Revised Squat' })).not.toBe(
      digestMovementDetail(SQUAT),
    );
  });

  it('changes when a step changes', () => {
    expect(
      digestMovementDetail({
        ...SQUAT,
        steps: ['Lower with control, slowly.', ...SQUAT.steps.slice(1)],
      }),
    ).not.toBe(digestMovementDetail(SQUAT));
  });

  it('changes when a cue changes', () => {
    expect(
      digestMovementDetail({ ...SQUAT, cues: ['Keep the movement fast.'] }),
    ).not.toBe(digestMovementDetail(SQUAT));
  });

  it('changes when a safety note changes', () => {
    expect(
      digestMovementDetail({
        ...SQUAT,
        safetyNotes: [
          'Stop immediately if you feel any discomfort and seek qualified help as appropriate.',
        ],
      }),
    ).not.toBe(digestMovementDetail(SQUAT));
  });
});

describe('canonicalizeMovementDetail', () => {
  it('is a deterministic, order-stable JSON projection consumed by digestMovementDetail', () => {
    expect(canonicalizeMovementDetail(SQUAT)).toBe(
      canonicalizeMovementDetail(SQUAT),
    );
    expect(canonicalizeMovementDetail(SQUAT)).not.toContain('undefined');
  });
});

describe('cloneMovementDetail', () => {
  it('returns a value deeply equal to the input', () => {
    expect(cloneMovementDetail(SQUAT)).toEqual(SQUAT);
  });

  it('returns array fields with different references than the input', () => {
    const clone = cloneMovementDetail(SQUAT);

    expect(clone.setup).not.toBe(SQUAT.setup);
    expect(clone.steps).not.toBe(SQUAT.steps);
    expect(clone.cues).not.toBe(SQUAT.cues);
    expect(clone.commonMistakes).not.toBe(SQUAT.commonMistakes);
    expect(clone.safetyNotes).not.toBe(SQUAT.safetyNotes);
  });

  it('isolates the original from mutation of the returned clone', () => {
    const originalStepsLength = SQUAT.steps.length;
    const clone = cloneMovementDetail(SQUAT);

    clone.steps.push('An extra step only the clone should see.');

    expect(clone.steps.length).toBe(originalStepsLength + 1);
    expect(SQUAT.steps.length).toBe(originalStepsLength);
  });
});

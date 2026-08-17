import { describe, expect, it } from 'vitest';

import {
  movementContentVersionSchema,
  movementDetailParamsSchema,
  movementDetailResponseSchema,
  movementDetailSchema,
  movementEmptyQuerySchema,
  movementIdSchema,
  movementListResponseSchema,
  movementSummarySchema,
  type MovementId,
} from '../src/movement.js';

const summary = {
  movementId: 'bodyweight-squat',
  contentVersion: 1,
  name: 'Bodyweight Squat',
  summary: 'A controlled squat movement using body weight.',
} as const;

const detail = {
  ...summary,
  setup: ['Stand with stable footing.'],
  steps: ['Lower with control.', 'Return to standing.'],
  cues: ['Keep the movement controlled.'],
  commonMistakes: ['Rushing the movement.'],
  safetyNotes: ['Stop if you feel pain, dizziness, or loss of control.'],
} as const;

describe('movementIdSchema', () => {
  it('accepts and brands movement slugs at the exact length boundaries', () => {
    const minimum = 'a-b';
    const maximum = 'a'.repeat(64);

    expect(movementIdSchema.parse(minimum)).toBe(minimum);
    expect(movementIdSchema.parse(maximum)).toBe(maximum);
  });

  it.each([
    'ab',
    'a'.repeat(65),
    'Bodyweight-squat',
    '-bodyweight-squat',
    'bodyweight--squat',
    'bodyweight-squat-',
  ])('rejects an invalid movement slug: %s', (value) => {
    expect(movementIdSchema.safeParse(value).success).toBe(false);
  });
});

describe('movementContentVersionSchema', () => {
  it('accepts the exact positive integer boundaries', () => {
    expect(movementContentVersionSchema.parse(1)).toBe(1);
    expect(movementContentVersionSchema.parse(2_147_483_647)).toBe(
      2_147_483_647,
    );
  });

  it.each([0, 2_147_483_648, 1.5, '1'])(
    'rejects an invalid content version: %s',
    (value) => {
      expect(movementContentVersionSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('movement public read contracts', () => {
  it('accepts exact summary, detail, list, query, and parameter shapes', () => {
    expect(movementSummarySchema.parse(summary)).toEqual(summary);
    expect(movementDetailSchema.parse(detail)).toEqual(detail);
    expect(movementListResponseSchema.parse({ items: [summary] })).toEqual({
      items: [summary],
    });
    expect(movementEmptyQuerySchema.parse({})).toEqual({});
    expect(
      movementDetailParamsSchema.parse({ movementId: summary.movementId }),
    ).toEqual({ movementId: summary.movementId });
    expect(movementDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('rejects unknown fields in every public object and query', () => {
    expect(
      movementSummarySchema.safeParse({ ...summary, unknown: true }).success,
    ).toBe(false);
    expect(
      movementDetailSchema.safeParse({ ...detail, unknown: true }).success,
    ).toBe(false);
    expect(
      movementListResponseSchema.safeParse({ items: [], unknown: true })
        .success,
    ).toBe(false);
    expect(
      movementEmptyQuerySchema.safeParse({ search: 'squat' }).success,
    ).toBe(false);
    expect(
      movementDetailParamsSchema.safeParse({
        movementId: summary.movementId,
        version: 1,
      }).success,
    ).toBe(false);
  });

  it('enforces exact canonical text boundaries', () => {
    const exactMinimum = {
      ...detail,
      name: 'N',
      summary: 'S',
      setup: ['I'],
      steps: ['I'],
      cues: ['I'],
      commonMistakes: ['I'],
      safetyNotes: ['I'],
    };
    const exactMaximum = {
      ...detail,
      name: 'n'.repeat(80),
      summary: 's'.repeat(240),
      setup: ['i'.repeat(300)],
      steps: ['i'.repeat(300)],
      cues: ['i'.repeat(300)],
      commonMistakes: ['i'.repeat(300)],
      safetyNotes: ['i'.repeat(300)],
    };

    expect(movementDetailSchema.parse(exactMinimum)).toEqual(exactMinimum);
    expect(movementDetailSchema.parse(exactMaximum)).toEqual(exactMaximum);

    const invalidDetails = [
      { ...detail, name: '' },
      { ...detail, name: 'n'.repeat(81) },
      { ...detail, summary: '' },
      { ...detail, summary: 's'.repeat(241) },
      { ...detail, setup: [''] },
      { ...detail, setup: ['i'.repeat(301)] },
      { ...detail, name: ' Leading whitespace' },
      { ...detail, name: 'Trailing whitespace ' },
      { ...detail, name: 'Cafe\u0301' },
      { ...detail, name: 'Control\u0000character' },
      { ...detail, name: '<strong>Markup</strong>' },
    ];

    for (const invalid of invalidDetails) {
      expect(movementDetailSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('enforces exact section and list count boundaries', () => {
    const item = 'Controlled instruction.';
    const exactMinimum = {
      ...detail,
      setup: [item],
      steps: [item],
      cues: [item],
      commonMistakes: [item],
      safetyNotes: [item],
    };
    const exactMaximum = {
      ...detail,
      setup: Array.from({ length: 8 }, () => item),
      steps: Array.from({ length: 12 }, () => item),
      cues: Array.from({ length: 8 }, () => item),
      commonMistakes: Array.from({ length: 8 }, () => item),
      safetyNotes: Array.from({ length: 6 }, () => item),
    };

    expect(movementDetailSchema.parse(exactMinimum)).toEqual(exactMinimum);
    expect(movementDetailSchema.parse(exactMaximum)).toEqual(exactMaximum);
    expect(movementListResponseSchema.parse({ items: [] })).toEqual({
      items: [],
    });
    expect(
      movementListResponseSchema.parse({ items: Array(100).fill(summary) })
        .items,
    ).toHaveLength(100);

    const invalidDetails = [
      { ...detail, setup: [] },
      { ...detail, setup: Array(9).fill(item) },
      { ...detail, steps: [] },
      { ...detail, steps: Array(13).fill(item) },
      { ...detail, cues: [] },
      { ...detail, cues: Array(9).fill(item) },
      { ...detail, commonMistakes: [] },
      { ...detail, commonMistakes: Array(9).fill(item) },
      { ...detail, safetyNotes: [] },
      { ...detail, safetyNotes: Array(7).fill(item) },
    ];

    for (const invalid of invalidDetails) {
      expect(movementDetailSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      movementListResponseSchema.safeParse({ items: Array(101).fill(summary) })
        .success,
    ).toBe(false);
  });
});

const parsedMovementId: MovementId = movementIdSchema.parse('bodyweight-squat');
void parsedMovementId;

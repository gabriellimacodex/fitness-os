import { describe, expect, it } from 'vitest';

import {
  catalogManifestSchema,
  catalogReferenceCandidateSchema,
  canonicalCatalogKeySchema,
  exerciseDetailSchema,
  exerciseIdSchema,
  exerciseIdParamsSchema,
  exerciseListPageSchema,
  exerciseListQuerySchema,
  exerciseLifecycleSchema,
  exerciseRevisionParamsSchema,
  exerciseRevisionSchema,
  exerciseRevisionIdSchema,
  exerciseSummarySchema,
  provenanceSchema,
  referenceAssessmentSchema,
  referenceKindSchema,
  referencePurposeSchema,
  referenceCandidateIdSchema,
  taxonomyDimensionKeySchema,
  taxonomyDimensionIdSchema,
  taxonomyDiscoveryPageSchema,
  taxonomyDiscoveryQuerySchema,
  taxonomyDimensionSchema,
  taxonomyTermSchema,
  taxonomyTermLifecycleSchema,
  taxonomyTermIdSchema,
  type ExerciseId,
  type ExerciseRevisionId,
  type ReferenceCandidateId,
  type TaxonomyDimensionId,
  type TaxonomyTermId,
} from '../src/exercise-catalog.js';

const exerciseId = '11111111-1111-4111-8111-111111111111';
const revisionId = '22222222-2222-4222-8222-222222222222';
const dimensionId = '33333333-3333-4333-8333-333333333333';
const equipmentDimensionId = '88888888-8888-4888-8888-888888888888';
const termId = '44444444-4444-4444-8444-444444444444';
const referenceId = '55555555-5555-4555-8555-555555555555';
const recordedAt = '2026-08-16T12:34:56.789Z';

const modalityTerm = {
  id: termId,
  dimensionId,
  dimension: 'modality',
  key: 'strength',
  label: 'Strength',
  meaning: 'A neutral fixture modality.',
  lifecycle: 'active',
  replacedByTermId: null,
} as const;
const equipmentTerm = {
  ...modalityTerm,
  id: '66666666-6666-4666-8666-666666666666',
  dimensionId: equipmentDimensionId,
  dimension: 'equipment',
  key: 'none',
  label: 'None',
  meaning: 'No catalogued equipment.',
} as const;
const reference = {
  id: referenceId,
  kind: 'https_url',
  locator: 'https://example.test/public-catalog-source',
  purpose: 'provenance',
  assessment: 'unassessed',
} as const;
const revision = {
  id: revisionId,
  exerciseId,
  revision: 1,
  displayName: 'Fixture Exercise',
  aliases: ['Fixture Alias'],
  description: 'A neutral catalog fixture description.',
  taxonomy: { modality: modalityTerm, equipment: [equipmentTerm] },
  provenance: {
    originKind: 'derived_from_public_locator',
    recordedAt,
    changeReason: 'Initial catalog publication',
    primaryProvenanceReferenceId: referenceId,
  },
  references: [reference],
  contentHash: 'a'.repeat(64),
  publishedAt: recordedAt,
} as const;

describe('exercise catalog identifiers', () => {
  it('accepts separately branded UUIDv4 identifiers', () => {
    expect(exerciseIdSchema.parse(exerciseId)).toBe(exerciseId);
    expect(exerciseRevisionIdSchema.parse(revisionId)).toBe(revisionId);
    expect(taxonomyDimensionIdSchema.parse(dimensionId)).toBe(dimensionId);
    expect(taxonomyTermIdSchema.parse(termId)).toBe(termId);
    expect(referenceCandidateIdSchema.parse(referenceId)).toBe(referenceId);
  });
});

describe('exercise catalog values', () => {
  it('accepts only frozen lifecycle, taxonomy, provenance, and reference values', () => {
    expect(exerciseLifecycleSchema.parse('active')).toBe('active');
    expect(taxonomyTermLifecycleSchema.parse('replaced')).toBe('replaced');
    expect(taxonomyDimensionKeySchema.parse('equipment')).toBe('equipment');
    expect(referenceKindSchema.parse('doi')).toBe('doi');
    expect(referencePurposeSchema.parse('evidence_candidate')).toBe(
      'evidence_candidate',
    );
    expect(referenceAssessmentSchema.parse('unassessed')).toBe('unassessed');
    expect(canonicalCatalogKeySchema.parse('bodyweight-squat')).toBe(
      'bodyweight-squat',
    );
    expect(
      provenanceSchema.parse({
        originKind: 'internally_curated',
        recordedAt,
        changeReason: 'Initial catalog publication',
        primaryProvenanceReferenceId: null,
      }),
    ).toMatchObject({ originKind: 'internally_curated' });
    expect(
      catalogReferenceCandidateSchema.parse({
        id: referenceId,
        kind: 'doi',
        locator: '10.1000/example.1',
        purpose: 'evidence_candidate',
        assessment: 'unassessed',
      }),
    ).toMatchObject({ assessment: 'unassessed' });
  });
});

describe('exercise catalog public read contracts', () => {
  it('accepts taxonomy, summary, detail, historical revision, page, and query variants', () => {
    expect(
      taxonomyDimensionSchema.parse({
        id: dimensionId,
        key: 'modality',
        label: 'Modality',
      }),
    ).toMatchObject({ key: 'modality' });
    expect(taxonomyTermSchema.parse(modalityTerm)).toEqual(modalityTerm);
    expect(exerciseRevisionSchema.parse(revision)).toEqual(revision);

    const summary = {
      id: exerciseId,
      canonicalKey: 'fixture-exercise',
      currentRevision: 1,
      currentName: 'Fixture Exercise',
      lifecycle: 'active',
      taxonomy: revision.taxonomy,
    } as const;
    expect(exerciseSummarySchema.parse(summary)).toEqual(summary);
    expect(
      exerciseDetailSchema.parse({ ...summary, currentRevision: revision }),
    ).toMatchObject({ id: exerciseId });
    expect(
      exerciseListPageSchema.parse({ items: [summary], nextCursor: null }),
    ).toMatchObject({ nextCursor: null });
    expect(
      taxonomyDiscoveryPageSchema.parse({
        items: [modalityTerm],
        nextCursor: 'eyJpZCI6IjEifQ',
      }),
    ).toMatchObject({ items: [modalityTerm] });

    expect(exerciseIdParamsSchema.parse({ exerciseId })).toEqual({
      exerciseId,
    });
    expect(
      exerciseRevisionParamsSchema.parse({ exerciseId, revision: '1' }),
    ).toEqual({ exerciseId, revision: 1 });
    expect(exerciseListQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(
      exerciseListQuerySchema.parse({
        limit: '100',
        taxonomyTermIds: [termId, equipmentTerm.id],
      }),
    ).toMatchObject({
      limit: 100,
      taxonomyTermIds: [termId, equipmentTerm.id],
    });
    expect(
      taxonomyDiscoveryQuerySchema.parse({ dimension: 'equipment' }),
    ).toEqual({ dimension: 'equipment', lifecycle: 'active', limit: 50 });
  });

  it('rejects unknown fields, invalid bounds, dimensions, cursors, and locators', () => {
    expect(
      exerciseIdParamsSchema.safeParse({ exerciseId, actorId: exerciseId })
        .success,
    ).toBe(false);
    expect(exerciseListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(exerciseListQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(
      exerciseListQuerySchema.safeParse({ cursor: 'not a cursor' }).success,
    ).toBe(false);
    expect(taxonomyDiscoveryQuerySchema.safeParse({}).success).toBe(false);
    expect(
      taxonomyDiscoveryQuerySchema.safeParse({ dimension: 'movement' }).success,
    ).toBe(false);
    expect(
      catalogReferenceCandidateSchema.safeParse({
        ...reference,
        locator: 'http://example.test/source',
      }).success,
    ).toBe(false);
    expect(
      exerciseListPageSchema.parse({ items: [], nextCursor: null }),
    ).toEqual({ items: [], nextCursor: null });
  });

  it('rejects invalid taxonomy assignments and provenance relationships', () => {
    expect(
      exerciseRevisionSchema.safeParse({
        ...revision,
        taxonomy: { modality: equipmentTerm, equipment: [] },
      }).success,
    ).toBe(false);
    expect(
      taxonomyTermSchema.safeParse({
        ...modalityTerm,
        lifecycle: 'replaced',
        replacedByTermId: modalityTerm.id,
      }).success,
    ).toBe(false);
    expect(
      exerciseRevisionSchema.safeParse({
        ...revision,
        taxonomy: {
          modality: modalityTerm,
          equipment: [
            { ...equipmentTerm, dimensionId: modalityTerm.dimensionId },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      exerciseRevisionSchema.safeParse({
        ...revision,
        taxonomy: {
          modality: modalityTerm,
          equipment: [
            equipmentTerm,
            {
              ...equipmentTerm,
              id: '99999999-9999-4999-8999-999999999999',
              dimensionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      exerciseRevisionSchema.safeParse({
        ...revision,
        provenance: {
          ...revision.provenance,
          primaryProvenanceReferenceId: '77777777-7777-4777-8777-777777777777',
        },
      }).success,
    ).toBe(false);
    expect(
      exerciseRevisionSchema.safeParse({
        ...revision,
        provenance: {
          originKind: 'internally_curated',
          recordedAt,
          changeReason: 'Initial catalog publication',
          primaryProvenanceReferenceId: null,
        },
      }).success,
    ).toBe(false);
    expect(
      exerciseDetailSchema.safeParse({
        id: exerciseId,
        canonicalKey: 'catalog-exercise',
        currentName: revision.displayName,
        lifecycle: 'active',
        taxonomy: { modality: modalityTerm, equipment: [] },
        currentRevision: revision,
      }).success,
    ).toBe(false);
  });
});

const manifest = {
  schemaVersion: 'catalog-manifest.v1',
  manifestId: 'initial-catalog',
  taxonomy: {
    modality: [
      {
        key: 'strength',
        label: 'Strength',
        meaning: 'A neutral catalog modality.',
      },
    ],
    equipment: [
      {
        key: 'none',
        label: 'None',
        meaning: 'No catalogued equipment.',
      },
    ],
  },
  exercises: [
    {
      canonicalKey: 'catalog-exercise',
      displayName: 'Catalog Exercise',
      aliases: [],
      description: 'A neutral catalog description.',
      modalityKey: 'strength',
      equipmentKeys: ['none'],
      provenance: {
        originKind: 'derived_from_public_locator',
        changeReason: 'Initial catalog publication',
        primaryProvenanceReferenceKey: 'public-source',
      },
      references: [
        {
          key: 'public-source',
          kind: 'https_url',
          locator: 'https://example.test/public-source',
          purpose: 'provenance',
          assessment: 'unassessed',
        },
      ],
    },
  ],
} as const;

describe('catalog-manifest.v1', () => {
  it('accepts a non-empty manifest with resolvable taxonomy and exact provenance', () => {
    expect(catalogManifestSchema.parse(manifest)).toEqual(manifest);
    expect(
      catalogManifestSchema.safeParse({
        ...manifest,
        exercises: [
          {
            ...manifest.exercises[0],
            provenance: {
              originKind: 'internally_curated',
              changeReason: 'Internally curated fixture',
              primaryProvenanceReferenceKey: null,
            },
            references: [
              {
                ...manifest.exercises[0].references[0],
                purpose: 'evidence_candidate',
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects empty, unresolved, caller-owned, unknown, and invalid provenance input', () => {
    expect(
      catalogManifestSchema.safeParse({ ...manifest, exercises: [] }).success,
    ).toBe(false);
    expect(
      catalogManifestSchema.safeParse({
        ...manifest,
        exercises: [
          { ...manifest.exercises[0], modalityKey: 'unknown-modality' },
        ],
      }).success,
    ).toBe(false);
    expect(
      catalogManifestSchema.safeParse({
        ...manifest,
        createdAt: recordedAt,
      }).success,
    ).toBe(false);
    expect(
      catalogManifestSchema.safeParse({
        ...manifest,
        exercises: [
          {
            ...manifest.exercises[0],
            contentHash: 'a'.repeat(64),
            id: exerciseId,
            publishedAt: recordedAt,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      catalogManifestSchema.safeParse({
        ...manifest,
        exercises: [
          {
            ...manifest.exercises[0],
            references: [
              {
                ...manifest.exercises[0].references[0],
                purpose: 'evidence_candidate',
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      catalogManifestSchema.safeParse({
        ...manifest,
        exercises: [
          {
            ...manifest.exercises[0],
            references: [
              ...manifest.exercises[0].references,
              {
                ...manifest.exercises[0].references[0],
                key: 'second-public-source',
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      catalogManifestSchema.safeParse({
        ...manifest,
        exercises: [
          {
            ...manifest.exercises[0],
            provenance: {
              originKind: 'internally_curated',
              changeReason: 'Internally curated fixture',
              primaryProvenanceReferenceKey: null,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

const parsedExerciseId: ExerciseId = exerciseIdSchema.parse(exerciseId);
const parsedRevisionId: ExerciseRevisionId =
  exerciseRevisionIdSchema.parse(revisionId);
const parsedDimensionId: TaxonomyDimensionId =
  taxonomyDimensionIdSchema.parse(dimensionId);
const parsedTermId: TaxonomyTermId = taxonomyTermIdSchema.parse(termId);
const parsedReferenceId: ReferenceCandidateId =
  referenceCandidateIdSchema.parse(referenceId);

// @ts-expect-error Revision IDs cannot be used as exercise IDs.
const invalidExerciseId: ExerciseId = parsedRevisionId;
// @ts-expect-error Dimension IDs cannot be used as term IDs.
const invalidTermId: TaxonomyTermId = parsedDimensionId;
// @ts-expect-error Reference IDs cannot be used as revision IDs.
const invalidRevisionId: ExerciseRevisionId = parsedReferenceId;
// @ts-expect-error Exercise IDs cannot be used as dimension IDs.
const invalidDimensionId: TaxonomyDimensionId = parsedExerciseId;

void parsedTermId;
void invalidExerciseId;
void invalidTermId;
void invalidRevisionId;
void invalidDimensionId;

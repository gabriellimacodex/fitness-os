import {
  catalogManifestSchema,
  exerciseIdSchema,
  taxonomyDimensionIdSchema,
  taxonomyTermIdSchema,
  type ExerciseDetail,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  canonicalizeExerciseLifecycleInput,
  canonicalizeManifestIngestionInput,
  canonicalizeTaxonomyCreateInput,
  canonicalizeTaxonomyLifecycleInput,
  canonicalizeTaxonomyReplacementInput,
  createExerciseLifecycleCommand,
  createManifestIngestionCommand,
  createPublishExerciseCommand,
  createTaxonomyReplacementCommand,
  createTaxonomyTermCommand,
  createTaxonomyTermLifecycleCommand,
  type ExerciseCatalogCurationRepository,
  type ExerciseLifecycleRepositoryCommand,
  type ExerciseLifecycleResult,
  type ManifestIngestionResult,
  type PublicationSemanticInput,
} from '../src/exercise-catalog/index.js';

const operationId = '30000000-0000-4000-8000-000000000001';
const exerciseId = exerciseIdSchema.parse(
  'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
);
const modalityId = taxonomyTermIdSchema.parse(
  'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
);
const equipmentOneId = taxonomyTermIdSchema.parse(
  'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC',
);
const equipmentTwoId = taxonomyTermIdSchema.parse(
  'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD',
);
const dimensionId = taxonomyDimensionIdSchema.parse(
  'EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE',
);

const publication = {
  target: { canonicalKey: 'fixture-squat', exerciseId },
  expectedCurrentRevision: 1,
  content: {
    displayName: 'Fixture  Squat',
    aliases: ['Fixture Squat', 'Fixture Back Squat'],
    description: 'A neutral  fixture catalog entry.',
    taxonomy: {
      modalityTermId: modalityId,
      equipmentTermIds: [equipmentTwoId, equipmentOneId],
    },
    provenance: {
      originKind: 'internally_curated',
      changeReason: 'Correct  fixture content',
      primaryProvenanceReference: null,
    },
    references: [
      {
        kind: 'https_url',
        locator: 'https://example.com/fixture-b',
        purpose: 'evidence_candidate',
        assessment: 'unassessed',
      },
      {
        kind: 'doi',
        locator: '10.1000/FIXTURE-A',
        purpose: 'evidence_candidate',
        assessment: 'unassessed',
      },
    ],
  },
} satisfies PublicationSemanticInput;

const manifest = catalogManifestSchema.parse({
  schemaVersion: 'catalog-manifest.v1',
  manifestId: 'fixture-catalog',
  taxonomy: {
    modality: [
      {
        key: 'fixture-modality',
        label: 'Fixture  modality',
        meaning: 'A neutral fixture modality.',
      },
    ],
    equipment: [
      {
        key: 'fixture-equipment-b',
        label: 'Fixture equipment B',
        meaning: 'A neutral fixture equipment term.',
      },
      {
        key: 'fixture-equipment-a',
        label: 'Fixture equipment A',
        meaning: 'Another neutral fixture equipment term.',
      },
    ],
  },
  exercises: [
    {
      canonicalKey: 'fixture-squat',
      displayName: 'Fixture Squat',
      aliases: ['Fixture Squat', 'Fixture Back Squat'],
      description: 'A neutral fixture catalog entry.',
      modalityKey: 'fixture-modality',
      equipmentKeys: ['fixture-equipment-b', 'fixture-equipment-a'],
      provenance: {
        originKind: 'internally_curated',
        changeReason: 'Initial fixture publication',
        primaryProvenanceReferenceKey: null,
      },
      references: [
        {
          key: 'fixture-reference-b',
          kind: 'https_url',
          locator: 'https://example.com/b',
          purpose: 'evidence_candidate',
          assessment: 'unassessed',
        },
        {
          key: 'fixture-reference-a',
          kind: 'doi',
          locator: '10.1000/FIXTURE-A',
          purpose: 'evidence_candidate',
          assessment: 'unassessed',
        },
      ],
    },
  ],
});

const expectReady = <Command>(result: {
  readonly status: string;
  readonly command?: Command;
}): Command => {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready' || result.command === undefined) {
    throw new Error('Expected a ready fixture command');
  }
  return result.command;
};

describe('server-owned catalog command factories', () => {
  it('distinguishes schema-distinct whitespace while normalizing UUID casing and permutations', () => {
    const canonical = expectReady(
      createPublishExerciseCommand({ operationId, semanticInput: publication }),
    );
    const lowerPermuted = expectReady(
      createPublishExerciseCommand({
        operationId,
        semanticInput: {
          ...publication,
          target: {
            ...publication.target,
            exerciseId: exerciseIdSchema.parse(exerciseId.toLowerCase()),
          },
          content: {
            ...publication.content,
            aliases: [...publication.content.aliases].reverse(),
            taxonomy: {
              modalityTermId: taxonomyTermIdSchema.parse(
                modalityId.toLowerCase(),
              ),
              equipmentTermIds: [
                taxonomyTermIdSchema.parse(equipmentOneId.toLowerCase()),
                taxonomyTermIdSchema.parse(equipmentTwoId.toLowerCase()),
              ],
            },
            references: [...publication.content.references].reverse(),
          },
        },
      }),
    );
    const collapsed = expectReady(
      createPublishExerciseCommand({
        operationId,
        semanticInput: {
          ...publication,
          content: {
            ...publication.content,
            displayName: 'Fixture Squat',
            description: 'A neutral fixture catalog entry.',
            provenance: {
              ...publication.content.provenance,
              changeReason: 'Correct fixture content',
            },
          },
        },
      }),
    );

    expect(lowerPermuted.operation.digest).toBe(canonical.operation.digest);
    expect(collapsed.operation.digest).not.toBe(canonical.operation.digest);
  });

  it('canonicalizes and hashes every non-publication mutation family in fixed field order', () => {
    const lifecycleInput = {
      exerciseId,
      targetLifecycle: 'archived' as const,
      reason: 'Archive  fixture',
    };
    const createInput = {
      dimensionId,
      dimension: 'equipment' as const,
      key: 'fixture-equipment',
      label: 'Fixture  equipment',
      meaning: 'A neutral fixture term.',
    };
    const taxonomyLifecycleInput = {
      termId: equipmentOneId,
      targetLifecycle: 'archived' as const,
      reason: 'Archive  fixture term',
    };
    const replacementInput = {
      sourceTermId: equipmentOneId,
      targetTermId: equipmentTwoId,
      reason: 'Correct  fixture meaning',
    };

    expect(canonicalizeExerciseLifecycleInput(lifecycleInput)).toBe(
      '{"canonicalizationVersion":"exercise-catalog.v1","exerciseId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","targetLifecycle":"archived","reason":"Archive  fixture"}',
    );
    expect(canonicalizeTaxonomyCreateInput(createInput)).toBe(
      '{"canonicalizationVersion":"exercise-catalog.v1","dimensionId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","dimension":"equipment","key":"fixture-equipment","label":"Fixture  equipment","meaning":"A neutral fixture term."}',
    );
    expect(canonicalizeTaxonomyLifecycleInput(taxonomyLifecycleInput)).toBe(
      '{"canonicalizationVersion":"exercise-catalog.v1","termId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","targetLifecycle":"archived","reason":"Archive  fixture term"}',
    );
    expect(canonicalizeTaxonomyReplacementInput(replacementInput)).toBe(
      '{"canonicalizationVersion":"exercise-catalog.v1","sourceTermId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","targetTermId":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","reason":"Correct  fixture meaning"}',
    );

    const lifecycle = expectReady(
      createExerciseLifecycleCommand({ operationId, ...lifecycleInput }),
    );
    const created = expectReady(
      createTaxonomyTermCommand({ operationId, ...createInput }),
    );
    const archived = expectReady(
      createTaxonomyTermLifecycleCommand({
        operationId,
        ...taxonomyLifecycleInput,
      }),
    );
    const replaced = expectReady(
      createTaxonomyReplacementCommand({ operationId, ...replacementInput }),
    );

    expect(
      new Set([
        lifecycle.operation.digest,
        created.operation.digest,
        archived.operation.digest,
        replaced.operation.digest,
      ]).size,
    ).toBe(4);
  });

  it('validates commands before hashing and returns a non-empty violation tuple', () => {
    const invalid = createPublishExerciseCommand({
      operationId: 'not-a-uuid',
      semanticInput: {
        ...publication,
        target: { ...publication.target, canonicalKey: 'INVALID KEY' },
        content: {
          ...publication.content,
          aliases: ['Duplicate', 'duplicate'],
          provenance: {
            ...publication.content.provenance,
            changeReason: ' ',
          },
          references: [
            {
              kind: 'https_url',
              locator: 'http://example.com/not-https',
              purpose: 'evidence_candidate',
              assessment: 'unassessed',
            },
          ],
        },
      },
    });

    expect(invalid.status).toBe('invalid_command');
    if (invalid.status === 'invalid_command') {
      expect(invalid.violations.length).toBeGreaterThan(0);
      expect(invalid.violations).toEqual(
        expect.arrayContaining([
          'invalid_operation_id',
          'invalid_canonical_key',
          'duplicate_alias',
          'invalid_change_reason',
          'invalid_reference',
        ]),
      );
    }
  });

  it('rejects contradictory initial-versus-next publication guards', () => {
    const invalid = createPublishExerciseCommand({
      operationId,
      semanticInput: {
        ...publication,
        target: { ...publication.target, exerciseId: null },
        expectedCurrentRevision: 1,
      },
    });

    expect(invalid).toEqual({
      status: 'invalid_command',
      violations: ['invalid_publication_target'],
    });
  });

  it('rejects caller-supplied hash fields instead of silently ignoring them', () => {
    const attempted = {
      operationId,
      semanticInput: publication,
      digest: 'caller-owned-digest',
      contentHash: 'caller-owned-content-hash',
    };

    expect(createPublishExerciseCommand(attempted)).toEqual({
      status: 'invalid_command',
      violations: ['unknown_field'],
    });
  });

  it('canonicalizes a validated manifest independently of collection order', () => {
    const permuted = catalogManifestSchema.parse({
      ...manifest,
      taxonomy: {
        ...manifest.taxonomy,
        equipment: [...manifest.taxonomy.equipment].reverse(),
      },
      exercises: manifest.exercises.map((exercise) => ({
        ...exercise,
        aliases: [...exercise.aliases].reverse(),
        equipmentKeys: [...exercise.equipmentKeys].reverse(),
        references: [...exercise.references].reverse(),
      })),
    });
    const first = expectReady(
      createManifestIngestionCommand({ operationId, manifest }),
    );
    const second = expectReady(
      createManifestIngestionCommand({ operationId, manifest: permuted }),
    );

    expect(canonicalizeManifestIngestionInput(permuted)).toBe(
      canonicalizeManifestIngestionInput(manifest),
    );
    expect(second.operation.digest).toBe(first.operation.digest);
  });
});

describe('curation port command and result safety', () => {
  it('adds manifest ingestion and prevents structurally forged commands', () => {
    const repository = {
      publishExercise: async () => {
        throw new Error('fixture');
      },
      setExerciseLifecycle: async () => {
        throw new Error('fixture');
      },
      createTaxonomyTerm: async () => {
        throw new Error('fixture');
      },
      setTaxonomyTermLifecycle: async () => {
        throw new Error('fixture');
      },
      replaceTaxonomyTerm: async () => {
        throw new Error('fixture');
      },
      ingestManifest: async () => {
        throw new Error('fixture');
      },
    } satisfies ExerciseCatalogCurationRepository;

    // @ts-expect-error The private server-owned brand is factory-only.
    const forged: ExerciseLifecycleRepositoryCommand = {};
    const active = {} as ExerciseDetail & { readonly lifecycle: 'active' };
    const contradictory: ExerciseLifecycleResult = {
      status: 'exercise_archived',
      replayed: false,
      // @ts-expect-error Archived success cannot contain an active detail.
      exercise: active,
    };
    const manifestResult: ManifestIngestionResult = {
      status: 'manifest_ingested',
      replayed: false,
      manifestId: 'fixture-catalog',
      exerciseCount: 1,
      taxonomyTermCount: 3,
    };

    expect(Object.keys(repository)).toContain('ingestManifest');
    expect(forged).toEqual({});
    expect(contradictory.status).toBe('exercise_archived');
    expect(manifestResult.status).toBe('manifest_ingested');
  });
});

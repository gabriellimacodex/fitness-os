import { describe, expect, it } from 'vitest';
import {
  catalogReferenceCandidateSchema,
  exerciseIdSchema,
  exerciseTaxonomyAssignmentsSchema,
  provenanceSchema,
  taxonomyTermSchema,
  taxonomyTermIdSchema,
} from '@fitness-os/schemas';

import {
  canonicalizePublicationInput,
  createExerciseLifecycleCommand,
  createPublishExerciseCommand,
  hashPublicationContent,
  hashPublicationOperation,
  resolveCatalogOperation,
  validatePublicationInvariants,
  validateTaxonomyReplacement,
  type ExerciseCatalogCurationRepository,
  type ExerciseKnowledgeReader,
  type PublicationSemanticInput,
  type PublishExerciseResult,
} from '../src/exercise-catalog/index.js';

const publication = {
  target: {
    canonicalKey: 'fixture-squat',
    exerciseId: null,
  },
  expectedCurrentRevision: null,
  content: {
    displayName: 'Fixture Squat',
    aliases: ['Fixture Back Squat', 'Fixture Squat'],
    description: 'A neutral fixture catalog entry.',
    taxonomy: {
      modalityTermId: taxonomyTermIdSchema.parse(
        '10000000-0000-4000-8000-000000000001',
      ),
      equipmentTermIds: [
        taxonomyTermIdSchema.parse('20000000-0000-4000-8000-000000000002'),
        taxonomyTermIdSchema.parse('20000000-0000-4000-8000-000000000001'),
      ],
    },
    provenance: {
      originKind: 'internally_curated',
      changeReason: 'Initial fixture publication',
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

describe('catalog canonicalization', () => {
  it('uses a fixed field order and sorts order-insensitive publication content', () => {
    const permuted: PublicationSemanticInput = {
      ...publication,
      content: {
        ...publication.content,
        aliases: [...publication.content.aliases].reverse(),
        taxonomy: {
          ...publication.content.taxonomy,
          equipmentTermIds: [
            ...publication.content.taxonomy.equipmentTermIds,
          ].reverse(),
        },
        references: [...publication.content.references].reverse(),
      },
    };

    expect(canonicalizePublicationInput(permuted)).toBe(
      canonicalizePublicationInput(publication),
    );
    expect(canonicalizePublicationInput(publication)).toBe(
      '{"canonicalizationVersion":"exercise-catalog.v1","target":{"canonicalKey":"fixture-squat","exerciseId":null},"expectedCurrentRevision":null,"content":{"displayName":"Fixture Squat","aliases":["Fixture Back Squat","Fixture Squat"],"description":"A neutral fixture catalog entry.","taxonomy":{"modalityTermId":"10000000-0000-4000-8000-000000000001","equipmentTermIds":["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"]},"provenance":{"originKind":"internally_curated","changeReason":"Initial fixture publication","primaryProvenanceReference":null},"references":[{"kind":"doi","locator":"10.1000/fixture-a","purpose":"evidence_candidate","assessment":"unassessed"},{"kind":"https_url","locator":"https://example.com/fixture-b","purpose":"evidence_candidate","assessment":"unassessed"}]}}',
    );
  });

  it('hashes every operation guard while keeping the revision content hash independent', () => {
    const staleGuardAttempt: PublicationSemanticInput = {
      ...publication,
      expectedCurrentRevision: 1,
    };

    expect(hashPublicationOperation(publication)).toBe(
      '8989955694f56ddb9fe212d4dcc8388f17d32726472c3d421d19cc1770414fd5',
    );
    expect(hashPublicationOperation(staleGuardAttempt)).not.toBe(
      hashPublicationOperation(publication),
    );
    expect(hashPublicationContent(staleGuardAttempt)).toBe(
      hashPublicationContent(publication),
    );
  });

  it('isolates namespaces and rejects a same-key retry with different semantic input', () => {
    const operationId = '30000000-0000-4000-8000-000000000001';
    const publish = createPublishExerciseCommand({
      operationId,
      semanticInput: publication,
    });
    const changed = createPublishExerciseCommand({
      operationId,
      semanticInput: {
        ...publication,
        content: {
          ...publication.content,
          description: 'A changed neutral fixture catalog entry.',
        },
      },
    });
    const lifecycle = createExerciseLifecycleCommand({
      operationId,
      exerciseId: exerciseIdSchema.parse(
        '30000000-0000-4000-8000-000000000002',
      ),
      targetLifecycle: 'archived',
      reason: 'Archive fixture exercise',
    });
    if (
      publish.status !== 'ready' ||
      changed.status !== 'ready' ||
      lifecycle.status !== 'ready'
    ) {
      throw new Error('Expected ready fixture commands');
    }
    const attempt = publish.command.operation;
    const prior = {
      key: attempt.key,
      canonicalizationVersion: attempt.canonicalizationVersion,
      digest: attempt.digest,
      result: { exerciseId: 'fixture-id', revision: 1 },
    };

    expect(lifecycle.command.operation.key).not.toBe(attempt.key);
    expect(resolveCatalogOperation(prior, attempt)).toEqual({
      status: 'replayed',
      result: prior.result,
    });
    expect(resolveCatalogOperation(prior, changed.command.operation)).toEqual({
      status: 'operation_input_mismatch',
      key: attempt.key,
    });
    const crossNamespace = resolveCatalogOperation(
      prior,
      lifecycle.command.operation,
    );
    expect(crossNamespace.status).toBe('new_operation');
    if (crossNamespace.status === 'new_operation') {
      expect(crossNamespace.operation.key).toBe(
        lifecycle.command.operation.key,
      );
    }
  });
});

describe('publication invariants', () => {
  it('rejects taxonomy terms that are not active at publication time', () => {
    const taxonomy = exerciseTaxonomyAssignmentsSchema.parse({
      modality: {
        id: '10000000-0000-4000-8000-000000000001',
        dimensionId: '10000000-0000-4000-8000-000000000010',
        dimension: 'modality',
        key: 'fixture-modality',
        label: 'Fixture modality',
        meaning: 'Synthetic modality used by tests.',
        lifecycle: 'archived',
        replacedByTermId: null,
      },
      equipment: [],
    });
    const provenance = provenanceSchema.parse({
      originKind: 'internally_curated',
      recordedAt: '2026-01-01T00:00:00.000Z',
      changeReason: 'Fixture publication',
      primaryProvenanceReferenceId: null,
    });

    expect(
      validatePublicationInvariants({ taxonomy, provenance, references: [] }),
    ).toEqual({
      status: 'invalid_publication',
      violations: ['modality_term_not_active'],
    });
  });

  it('does not accept an evidence candidate as derived provenance', () => {
    const taxonomy = exerciseTaxonomyAssignmentsSchema.parse({
      modality: {
        id: '10000000-0000-4000-8000-000000000001',
        dimensionId: '10000000-0000-4000-8000-000000000010',
        dimension: 'modality',
        key: 'fixture-modality',
        label: 'Fixture modality',
        meaning: 'Synthetic modality used by tests.',
        lifecycle: 'active',
        replacedByTermId: null,
      },
      equipment: [],
    });
    const reference = catalogReferenceCandidateSchema.parse({
      id: '40000000-0000-4000-8000-000000000001',
      kind: 'doi',
      locator: '10.1000/fixture',
      purpose: 'evidence_candidate',
      assessment: 'unassessed',
    });
    const provenance = provenanceSchema.parse({
      originKind: 'derived_from_public_locator',
      recordedAt: '2026-01-01T00:00:00.000Z',
      changeReason: 'Fixture publication',
      primaryProvenanceReferenceId: reference.id,
    });

    expect(
      validatePublicationInvariants({
        taxonomy,
        provenance,
        references: [reference],
      }),
    ).toEqual({
      status: 'invalid_publication',
      violations: ['derived_provenance_reference_missing_or_ambiguous'],
    });
  });
});

describe('taxonomy replacement invariants', () => {
  it('rejects self replacement', () => {
    const term = taxonomyTermSchema.parse({
      id: '50000000-0000-4000-8000-000000000001',
      dimensionId: '50000000-0000-4000-8000-000000000010',
      dimension: 'equipment',
      key: 'fixture-source',
      label: 'Fixture source',
      meaning: 'Synthetic equipment term used by tests.',
      lifecycle: 'active',
      replacedByTermId: null,
    });

    expect(
      validateTaxonomyReplacement({
        source: term,
        target: term,
        sourceSuccessorId: null,
        targetPredecessorId: null,
        targetSuccessorPath: [],
      }),
    ).toEqual({ status: 'invalid_replacement', reason: 'self_replacement' });
  });

  it('rejects replacement across taxonomy dimensions', () => {
    const source = taxonomyTermSchema.parse({
      id: '50000000-0000-4000-8000-000000000001',
      dimensionId: '50000000-0000-4000-8000-000000000010',
      dimension: 'equipment',
      key: 'fixture-source',
      label: 'Fixture source',
      meaning: 'Synthetic equipment term used by tests.',
      lifecycle: 'active',
      replacedByTermId: null,
    });
    const target = taxonomyTermSchema.parse({
      id: '50000000-0000-4000-8000-000000000002',
      dimensionId: '50000000-0000-4000-8000-000000000020',
      dimension: 'modality',
      key: 'fixture-target',
      label: 'Fixture target',
      meaning: 'Synthetic modality term used by tests.',
      lifecycle: 'active',
      replacedByTermId: null,
    });

    expect(
      validateTaxonomyReplacement({
        source,
        target,
        sourceSuccessorId: null,
        targetPredecessorId: null,
        targetSuccessorPath: [],
      }),
    ).toEqual({
      status: 'invalid_replacement',
      reason: 'cross_dimension_replacement',
    });
  });

  it('enforces an active, acyclic, one-to-one replacement chain', () => {
    const source = taxonomyTermSchema.parse({
      id: '50000000-0000-4000-8000-000000000001',
      dimensionId: '50000000-0000-4000-8000-000000000010',
      dimension: 'equipment',
      key: 'fixture-source',
      label: 'Fixture source',
      meaning: 'Synthetic equipment term used by tests.',
      lifecycle: 'active',
      replacedByTermId: null,
    });
    const target = taxonomyTermSchema.parse({
      ...source,
      id: '50000000-0000-4000-8000-000000000002',
      key: 'fixture-target',
      label: 'Fixture target',
    });
    const archivedTarget = taxonomyTermSchema.parse({
      ...target,
      lifecycle: 'archived',
    });
    const archivedSource = taxonomyTermSchema.parse({
      ...source,
      lifecycle: 'archived',
    });
    const context = {
      source,
      target,
      sourceSuccessorId: null,
      targetPredecessorId: null,
      targetSuccessorPath: [],
    } as const;

    expect([
      validateTaxonomyReplacement({
        ...context,
        source: archivedSource,
      }),
      validateTaxonomyReplacement({ ...context, target: archivedTarget }),
      validateTaxonomyReplacement({
        ...context,
        sourceSuccessorId: target.id,
      }),
      validateTaxonomyReplacement({
        ...context,
        targetPredecessorId: source.id,
      }),
      validateTaxonomyReplacement({
        ...context,
        targetSuccessorPath: [source.id],
      }),
    ]).toEqual([
      { status: 'invalid_replacement', reason: 'source_term_not_active' },
      { status: 'invalid_replacement', reason: 'target_term_not_active' },
      {
        status: 'invalid_replacement',
        reason: 'source_already_has_successor',
      },
      {
        status: 'invalid_replacement',
        reason: 'target_already_has_predecessor',
      },
      { status: 'invalid_replacement', reason: 'replacement_cycle' },
    ]);
  });
});

describe('catalog ports', () => {
  it('keeps read and mutation capabilities explicit and separate', () => {
    const reader = {
      listExercises: async () => {
        throw new Error('fixture');
      },
      getCurrentExercise: async () => {
        throw new Error('fixture');
      },
      getExerciseRevision: async () => {
        throw new Error('fixture');
      },
      listTaxonomy: async () => {
        throw new Error('fixture');
      },
    } satisfies ExerciseKnowledgeReader;
    const curation = {
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
    const stale: PublishExerciseResult = {
      status: 'stale_revision',
      expectedCurrentRevision: 1,
      actualCurrentRevision: 2,
    };

    expect(Object.keys(reader)).toEqual([
      'listExercises',
      'getCurrentExercise',
      'getExerciseRevision',
      'listTaxonomy',
    ]);
    expect(Object.keys(curation)).not.toContain('deleteExercise');
    expect(stale.status).toBe('stale_revision');
  });
});

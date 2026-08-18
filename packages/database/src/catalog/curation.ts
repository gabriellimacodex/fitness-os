import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import {
  hashPublicationContent,
  validatePublicationInvariants,
  validateTaxonomyReplacement,
  type CreateTaxonomyTermRepositoryCommand,
  type CreateTaxonomyTermResult,
  type ExerciseCatalogCurationRepository,
  type ExerciseLifecycleRepositoryCommand,
  type ExerciseLifecycleResult,
  type ManifestIngestionRepositoryCommand,
  type ManifestIngestionResult,
  type PublicationSemanticInput,
  type PublishExerciseRepositoryCommand,
  type PublishExerciseResult,
  type ReplaceTaxonomyTermRepositoryCommand,
  type ReplaceTaxonomyTermResult,
  type TaxonomyTermLifecycleRepositoryCommand,
  type TaxonomyTermLifecycleResult,
} from '@fitness-os/domain';
import {
  exerciseDetailSchema,
  exerciseIdSchema,
  exerciseRevisionIdSchema,
  referenceCandidateIdSchema,
  taxonomyTermIdSchema,
  taxonomyTermSchema,
  type CatalogManifest,
  type CatalogReferenceCandidate,
  type ExerciseDetail,
  type ExerciseId,
  type Provenance,
  type TaxonomyTerm,
  type TaxonomyTermId,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { canonicalizeLedgerJson } from './canonical-json.js';
import { signLedgerResult, type LedgerKeyRing } from './ledger-keyring.js';
import { resolveCatalogOperation } from './operation-ledger.js';
import {
  SEEDED_TAXONOMY_DIMENSIONS,
  catalogOperations,
  exerciseLifecycleEvents,
  exerciseReferenceCandidates,
  exerciseRevisionReferences,
  exerciseRevisionTaxonomyTerms,
  exerciseRevisions,
  exercises,
  taxonomyDimensions,
  taxonomyLifecycleEvents,
  taxonomyTerms,
} from './tables.js';

type CatalogTx = Parameters<
  Parameters<PostgresConnection['db']['transaction']>[0]
>[0];

function nowIso(): string {
  return new Date().toISOString();
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint_name' in error &&
    error.constraint_name === constraint
  ) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    isUniqueViolation(error.cause, constraint)
  );
}

function asIngestedResult(value: unknown): ManifestIngestionResult | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    'status' in value &&
    (value as { status: string }).status === 'manifest_ingested' &&
    'manifestId' in value &&
    'exerciseCount' in value &&
    'taxonomyTermCount' in value
  ) {
    const typed = value as {
      manifestId: string;
      exerciseCount: number;
      taxonomyTermCount: number;
    };
    return {
      status: 'manifest_ingested',
      replayed: true,
      manifestId: typed.manifestId,
      exerciseCount: typed.exerciseCount,
      taxonomyTermCount: typed.taxonomyTermCount,
    };
  }
  return null;
}

function asPublishedResult(value: unknown): PublishExerciseResult | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    'status' in value &&
    (value as { status: string }).status === 'published' &&
    'exercise' in value
  ) {
    const exercise = exerciseDetailSchema.parse(
      (value as { exercise: unknown }).exercise,
    );
    return { status: 'published', replayed: true, exercise };
  }
  return null;
}

function asExerciseLifecycleResult(
  value: unknown,
): ExerciseLifecycleResult | null {
  if (value === null || typeof value !== 'object' || !('status' in value)) {
    return null;
  }
  const status = (value as { status: string }).status;
  if (status !== 'exercise_archived' && status !== 'exercise_reactivated') {
    return null;
  }
  if (!('exercise' in value)) {
    return null;
  }
  const exercise = exerciseDetailSchema.parse(
    (value as { exercise: unknown }).exercise,
  );
  if (status === 'exercise_archived') {
    if (exercise.lifecycle !== 'archived') {
      return null;
    }
    return {
      status: 'exercise_archived',
      replayed: true,
      exercise: exercise as ExerciseDetail & { lifecycle: 'archived' },
    };
  }
  if (exercise.lifecycle !== 'active') {
    return null;
  }
  return {
    status: 'exercise_reactivated',
    replayed: true,
    exercise: exercise as ExerciseDetail & { lifecycle: 'active' },
  };
}

function asCreateTaxonomyResult(
  value: unknown,
): CreateTaxonomyTermResult | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    'status' in value &&
    (value as { status: string }).status === 'taxonomy_term_created' &&
    'term' in value
  ) {
    const term = taxonomyTermSchema.parse((value as { term: unknown }).term);
    if (term.lifecycle !== 'active') {
      return null;
    }
    return {
      status: 'taxonomy_term_created',
      replayed: true,
      term: term as TaxonomyTerm & { lifecycle: 'active' },
    };
  }
  return null;
}

function asTaxonomyLifecycleResult(
  value: unknown,
): TaxonomyTermLifecycleResult | null {
  if (value === null || typeof value !== 'object' || !('status' in value)) {
    return null;
  }
  const status = (value as { status: string }).status;
  if (
    status !== 'taxonomy_term_archived' &&
    status !== 'taxonomy_term_reactivated'
  ) {
    return null;
  }
  if (!('term' in value)) {
    return null;
  }
  const term = taxonomyTermSchema.parse((value as { term: unknown }).term);
  if (status === 'taxonomy_term_archived') {
    if (term.lifecycle !== 'archived') {
      return null;
    }
    return {
      status: 'taxonomy_term_archived',
      replayed: true,
      term: term as TaxonomyTerm & { lifecycle: 'archived' },
    };
  }
  if (term.lifecycle !== 'active') {
    return null;
  }
  return {
    status: 'taxonomy_term_reactivated',
    replayed: true,
    term: term as TaxonomyTerm & { lifecycle: 'active' },
  };
}

function asReplaceTaxonomyResult(
  value: unknown,
): ReplaceTaxonomyTermResult | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    'status' in value &&
    (value as { status: string }).status === 'taxonomy_term_replaced' &&
    'source' in value &&
    'target' in value
  ) {
    const source = taxonomyTermSchema.parse(
      (value as { source: unknown }).source,
    );
    const target = taxonomyTermSchema.parse(
      (value as { target: unknown }).target,
    );
    if (source.lifecycle !== 'replaced' || target.lifecycle !== 'active') {
      return null;
    }
    return {
      status: 'taxonomy_term_replaced',
      replayed: true,
      source: source as TaxonomyTerm & { lifecycle: 'replaced' },
      target: target as TaxonomyTerm & { lifecycle: 'active' },
    };
  }
  return null;
}

async function commitLedgerAndRun<Result>(
  connection: PostgresConnection,
  ring: LedgerKeyRing,
  input: {
    operationKey: string;
    namespace:
      | 'exercise.publish'
      | 'exercise.lifecycle'
      | 'taxonomy.create'
      | 'taxonomy.lifecycle'
      | 'taxonomy.replace'
      | 'manifest.ingest';
    canonicalizationVersion: string;
    inputDigest: string;
    stamped: string;
    resultPayload: Result;
    write: (tx: CatalogTx, ledgerOperationId: string) => Promise<void>;
  },
): Promise<Result> {
  const canonicalResult = canonicalizeLedgerJson(input.resultPayload);
  const signed = signLedgerResult(ring, canonicalResult);
  if (typeof signed === 'string') {
    throw new Error(`Catalog ledger signing failure: ${signed}`);
  }

  const ledgerOperationId = randomUUID();

  await connection.db.transaction(async (tx) => {
    await tx.insert(catalogOperations).values({
      id: ledgerOperationId,
      operationKey: input.operationKey,
      namespace: input.namespace,
      canonicalizationVersion: input.canonicalizationVersion,
      inputDigest: input.inputDigest,
      status: 'committed',
      resultPayload: JSON.parse(canonicalResult) as unknown,
      resultIntegrityKeyId: signed.keyId,
      resultIntegrityDigest: signed.digest,
      createdAt: input.stamped,
    });
    await input.write(tx, ledgerOperationId);
  });

  return input.resultPayload;
}

async function loadTerm(
  tx: CatalogTx | PostgresConnection['db'],
  termId: string,
): Promise<TaxonomyTerm | null> {
  const [row] = await tx
    .select({
      id: taxonomyTerms.id,
      dimensionId: taxonomyTerms.dimensionId,
      key: taxonomyTerms.key,
      label: taxonomyTerms.label,
      meaning: taxonomyTerms.meaning,
      lifecycle: taxonomyTerms.lifecycle,
      replacedByTermId: taxonomyTerms.replacedByTermId,
      dimensionKey: taxonomyDimensions.key,
    })
    .from(taxonomyTerms)
    .innerJoin(
      taxonomyDimensions,
      eq(taxonomyTerms.dimensionId, taxonomyDimensions.id),
    )
    .where(eq(taxonomyTerms.id, termId))
    .limit(1);

  if (row === undefined) {
    return null;
  }

  return taxonomyTermSchema.parse({
    id: row.id,
    dimensionId: row.dimensionId,
    dimension: row.dimensionKey,
    key: row.key,
    label: row.label,
    meaning: row.meaning,
    lifecycle: row.lifecycle,
    replacedByTermId: row.replacedByTermId,
  });
}

async function loadExerciseDetail(
  tx: CatalogTx | PostgresConnection['db'],
  exerciseId: ExerciseId,
): Promise<ExerciseDetail | null> {
  const [row] = await tx
    .select()
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);

  if (row === undefined || row.currentRevisionId === null) {
    return null;
  }

  const [revision] = await tx
    .select()
    .from(exerciseRevisions)
    .where(eq(exerciseRevisions.id, row.currentRevisionId))
    .limit(1);

  if (revision === undefined) {
    return null;
  }

  const links = await tx
    .select({ termId: exerciseRevisionTaxonomyTerms.termId })
    .from(exerciseRevisionTaxonomyTerms)
    .where(eq(exerciseRevisionTaxonomyTerms.revisionId, revision.id));

  const terms = (
    await Promise.all(links.map((link) => loadTerm(tx, link.termId)))
  ).filter((term): term is TaxonomyTerm => term !== null);

  const modality = terms.find((term) => term.dimension === 'modality');
  if (modality === undefined) {
    throw new Error('Revision is missing a modality assignment');
  }

  const referenceLinks = await tx
    .select({
      referenceId: exerciseRevisionReferences.referenceId,
      purpose: exerciseRevisionReferences.purpose,
    })
    .from(exerciseRevisionReferences)
    .where(eq(exerciseRevisionReferences.revisionId, revision.id));

  const references: CatalogReferenceCandidate[] = [];
  for (const link of referenceLinks) {
    const [candidate] = await tx
      .select()
      .from(exerciseReferenceCandidates)
      .where(eq(exerciseReferenceCandidates.id, link.referenceId))
      .limit(1);
    if (candidate === undefined) {
      continue;
    }
    references.push({
      id: referenceCandidateIdSchema.parse(candidate.id),
      kind: candidate.kind,
      locator: candidate.locator,
      purpose: candidate.purpose,
      assessment: candidate.assessment,
    } as CatalogReferenceCandidate);
  }

  return exerciseDetailSchema.parse({
    id: row.id,
    canonicalKey: row.canonicalKey,
    currentName: revision.displayName,
    lifecycle: row.lifecycle,
    taxonomy: {
      modality,
      equipment: terms.filter((term) => term.dimension === 'equipment'),
    },
    currentRevision: {
      id: revision.id,
      exerciseId: revision.exerciseId,
      revision: revision.revision,
      displayName: revision.displayName,
      aliases: revision.aliases,
      description: revision.description,
      taxonomy: {
        modality,
        equipment: terms.filter((term) => term.dimension === 'equipment'),
      },
      provenance: {
        originKind: revision.originKind,
        recordedAt: new Date(revision.recordedAt).toISOString(),
        changeReason: revision.changeReason,
        primaryProvenanceReferenceId: revision.primaryProvenanceReferenceId,
      },
      references,
      contentHash: revision.contentHash,
      publishedAt: new Date(revision.publishedAt).toISOString(),
    },
  });
}

async function allocateReference(
  tx: CatalogTx,
  input: {
    kind: string;
    locator: string;
    purpose: string;
  },
): Promise<{ id: string; isNew: boolean }> {
  const [existing] = await tx
    .select()
    .from(exerciseReferenceCandidates)
    .where(
      and(
        eq(exerciseReferenceCandidates.kind, input.kind),
        eq(exerciseReferenceCandidates.locator, input.locator),
        eq(exerciseReferenceCandidates.purpose, input.purpose),
      ),
    )
    .limit(1);

  if (existing !== undefined) {
    return { id: existing.id, isNew: false };
  }

  return { id: randomUUID(), isNew: true };
}

function buildProvenance(
  originKind: 'internally_curated' | 'derived_from_public_locator',
  stamped: string,
  changeReason: string,
  primaryProvenanceReferenceId: string | null,
): Provenance {
  if (originKind === 'internally_curated') {
    return {
      originKind: 'internally_curated',
      recordedAt: stamped,
      changeReason,
      primaryProvenanceReferenceId: null,
    };
  }
  if (primaryProvenanceReferenceId === null) {
    throw new Error('Derived provenance requires a primary reference id');
  }
  return {
    originKind: 'derived_from_public_locator',
    recordedAt: stamped,
    changeReason,
    primaryProvenanceReferenceId: referenceCandidateIdSchema.parse(
      primaryProvenanceReferenceId,
    ),
  };
}

async function loadSuccessorPath(
  tx: CatalogTx,
  startTermId: string,
): Promise<TaxonomyTermId[]> {
  const path: TaxonomyTermId[] = [];
  let currentId: string | null = startTermId;
  const seen = new Set<string>();

  while (currentId !== null) {
    if (seen.has(currentId)) {
      break;
    }
    seen.add(currentId);
    const [row] = await tx
      .select({
        replacedByTermId: taxonomyTerms.replacedByTermId,
      })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.id, currentId))
      .limit(1);
    if (row === undefined || row.replacedByTermId === null) {
      break;
    }
    const nextId = taxonomyTermIdSchema.parse(row.replacedByTermId);
    path.push(nextId);
    currentId = nextId;
  }

  return path;
}

export function createExerciseCatalogCuration(
  connection: PostgresConnection,
  ring: LedgerKeyRing,
): ExerciseCatalogCurationRepository {
  return {
    publishExercise: async (
      command: PublishExerciseRepositoryCommand,
    ): Promise<PublishExerciseResult> => {
      const resolved = await resolveCatalogOperation(connection, ring, {
        operationKey: command.operation.key,
        namespace: 'exercise.publish',
        canonicalizationVersion: command.operation.canonicalizationVersion,
        inputDigest: command.operation.digest,
      });

      if (resolved.status === 'operation_input_mismatch') {
        return {
          status: 'operation_input_mismatch',
          key: command.operation.key,
        };
      }

      if (resolved.status === 'replayed') {
        return (
          asPublishedResult(resolved.operation.resultPayload) ?? {
            status: 'operation_input_mismatch',
            key: command.operation.key,
          }
        );
      }

      if (resolved.status === 'integrity_failure') {
        throw new Error(`Catalog ledger integrity failure: ${resolved.reason}`);
      }

      const stamped = nowIso();
      const semantic = command.semanticInput;
      const contentHash = hashPublicationContent(semantic);

      try {
        return await connection.db.transaction(async (tx) => {
          let exerciseId: ExerciseId;
          let nextRevision: number;
          let previousLifecycle: string | null = null;
          let currentLifecycle: 'active' | 'archived' = 'active';

          if (semantic.target.exerciseId === null) {
            const [existingByKey] = await tx
              .select()
              .from(exercises)
              .where(eq(exercises.canonicalKey, semantic.target.canonicalKey))
              .for('update')
              .limit(1);

            if (existingByKey !== undefined) {
              return {
                status: 'canonical_key_conflict' as const,
                canonicalKey: semantic.target.canonicalKey,
              };
            }

            if (semantic.expectedCurrentRevision !== null) {
              return {
                status: 'stale_revision' as const,
                expectedCurrentRevision: semantic.expectedCurrentRevision,
                actualCurrentRevision: null,
              };
            }

            exerciseId = exerciseIdSchema.parse(randomUUID());
            nextRevision = 1;
          } else {
            const [existing] = await tx
              .select()
              .from(exercises)
              .where(eq(exercises.id, semantic.target.exerciseId))
              .for('update')
              .limit(1);

            if (existing === undefined) {
              return {
                status: 'stale_revision' as const,
                expectedCurrentRevision: semantic.expectedCurrentRevision,
                actualCurrentRevision: null,
              };
            }

            if (existing.canonicalKey !== semantic.target.canonicalKey) {
              return {
                status: 'canonical_key_conflict' as const,
                canonicalKey: semantic.target.canonicalKey,
              };
            }

            if (
              existing.currentRevisionNumber !==
              semantic.expectedCurrentRevision
            ) {
              return {
                status: 'stale_revision' as const,
                expectedCurrentRevision: semantic.expectedCurrentRevision,
                actualCurrentRevision: existing.currentRevisionNumber,
              };
            }

            exerciseId = exerciseIdSchema.parse(existing.id);
            nextRevision = existing.currentRevisionNumber + 1;
            previousLifecycle = existing.lifecycle;
            currentLifecycle = existing.lifecycle as 'active' | 'archived';
          }

          const modalityTerm = await loadTerm(
            tx,
            semantic.content.taxonomy.modalityTermId,
          );
          const equipmentTerms: TaxonomyTerm[] = [];
          for (const termId of semantic.content.taxonomy.equipmentTermIds) {
            const term = await loadTerm(tx, termId);
            if (term === null || term.dimension !== 'equipment') {
              return {
                status: 'invalid_publication' as const,
                violations: ['equipment_term_not_active' as const],
              };
            }
            equipmentTerms.push(term);
          }

          if (modalityTerm === null || modalityTerm.dimension !== 'modality') {
            return {
              status: 'invalid_publication' as const,
              violations: ['modality_term_not_active' as const],
            };
          }

          const allocatedReferences: {
            record: CatalogReferenceCandidate;
            isNew: boolean;
            kind: string;
            locator: string;
            purpose: string;
          }[] = [];
          for (const reference of semantic.content.references) {
            const allocated = await allocateReference(tx, {
              kind: reference.kind,
              locator: reference.locator,
              purpose: reference.purpose,
            });
            allocatedReferences.push({
              record: {
                id: referenceCandidateIdSchema.parse(allocated.id),
                kind: reference.kind,
                locator: reference.locator,
                purpose: reference.purpose,
                assessment: 'unassessed',
              } as CatalogReferenceCandidate,
              isNew: allocated.isNew,
              kind: reference.kind,
              locator: reference.locator,
              purpose: reference.purpose,
            });
          }
          const referenceRecords = allocatedReferences.map(
            (entry) => entry.record,
          );

          let primaryProvenanceReferenceId: string | null = null;
          if (semantic.content.provenance.primaryProvenanceReference !== null) {
            const primary =
              semantic.content.provenance.primaryProvenanceReference;
            const match = referenceRecords.find(
              (reference) =>
                reference.purpose === 'provenance' &&
                reference.kind === primary.kind &&
                reference.locator === primary.locator,
            );
            primaryProvenanceReferenceId = match?.id ?? null;
          }

          let provenance: Provenance;
          try {
            provenance = buildProvenance(
              semantic.content.provenance.originKind,
              stamped,
              semantic.content.provenance.changeReason,
              primaryProvenanceReferenceId,
            );
          } catch {
            return {
              status: 'invalid_publication' as const,
              violations: [
                'derived_provenance_reference_missing_or_ambiguous' as const,
              ],
            };
          }

          const invariant = validatePublicationInvariants({
            taxonomy: {
              modality: modalityTerm,
              equipment: equipmentTerms,
            },
            provenance,
            references: referenceRecords,
          });

          if (invariant.status === 'invalid_publication') {
            return {
              status: 'invalid_publication' as const,
              violations: invariant.violations,
            };
          }

          const revisionId = exerciseRevisionIdSchema.parse(randomUUID());
          const ledgerOperationId = randomUUID();

          const exerciseDetail: ExerciseDetail = exerciseDetailSchema.parse({
            id: exerciseId,
            canonicalKey: semantic.target.canonicalKey,
            currentName: semantic.content.displayName,
            lifecycle: currentLifecycle,
            taxonomy: {
              modality: modalityTerm,
              equipment: equipmentTerms,
            },
            currentRevision: {
              id: revisionId,
              exerciseId,
              revision: nextRevision,
              displayName: semantic.content.displayName,
              aliases: [...semantic.content.aliases],
              description: semantic.content.description,
              taxonomy: {
                modality: modalityTerm,
                equipment: equipmentTerms,
              },
              provenance,
              references: referenceRecords,
              contentHash,
              publishedAt: stamped,
            },
          });

          const resultPayload: PublishExerciseResult = {
            status: 'published',
            replayed: false,
            exercise: exerciseDetail,
          };

          const canonicalResult = canonicalizeLedgerJson(resultPayload);
          const signed = signLedgerResult(ring, canonicalResult);
          if (typeof signed === 'string') {
            throw new Error(`Catalog ledger signing failure: ${signed}`);
          }

          await tx.insert(catalogOperations).values({
            id: ledgerOperationId,
            operationKey: command.operation.key,
            namespace: 'exercise.publish',
            canonicalizationVersion: command.operation.canonicalizationVersion,
            inputDigest: command.operation.digest,
            status: 'committed',
            resultPayload: JSON.parse(canonicalResult) as unknown,
            resultIntegrityKeyId: signed.keyId,
            resultIntegrityDigest: signed.digest,
            createdAt: stamped,
          });

          if (semantic.target.exerciseId === null) {
            await tx.insert(exercises).values({
              id: exerciseId,
              canonicalKey: semantic.target.canonicalKey,
              lifecycle: 'active',
              currentRevisionId: null,
              currentRevisionNumber: nextRevision,
              createdAt: stamped,
              updatedAt: stamped,
            });
          }

          for (const entry of allocatedReferences) {
            if (!entry.isNew) {
              continue;
            }
            await tx.insert(exerciseReferenceCandidates).values({
              id: entry.record.id,
              kind: entry.kind,
              locator: entry.locator,
              purpose: entry.purpose,
              assessment: 'unassessed',
              createdAt: stamped,
            });
          }

          await tx.insert(exerciseRevisions).values({
            id: revisionId,
            exerciseId,
            revision: nextRevision,
            displayName: semantic.content.displayName,
            aliases: [...semantic.content.aliases],
            description: semantic.content.description,
            originKind: semantic.content.provenance.originKind,
            changeReason: semantic.content.provenance.changeReason,
            recordedAt: stamped,
            primaryProvenanceReferenceId,
            contentHash,
            publishedAt: stamped,
            operationId: ledgerOperationId,
          });

          await tx
            .update(exercises)
            .set({
              currentRevisionId: revisionId,
              currentRevisionNumber: nextRevision,
              updatedAt: stamped,
            })
            .where(eq(exercises.id, exerciseId));

          await tx.insert(exerciseRevisionTaxonomyTerms).values([
            { revisionId, termId: modalityTerm.id },
            ...equipmentTerms.map((term) => ({
              revisionId,
              termId: term.id,
            })),
          ]);

          for (const reference of referenceRecords) {
            await tx.insert(exerciseRevisionReferences).values({
              revisionId,
              referenceId: reference.id,
              purpose: reference.purpose,
            });
          }

          await tx.insert(exerciseLifecycleEvents).values({
            id: randomUUID(),
            operationId: ledgerOperationId,
            exerciseId,
            eventKind: 'published',
            reason: semantic.content.provenance.changeReason,
            previousLifecycle,
            nextLifecycle: currentLifecycle,
            recordedAt: stamped,
          });

          return resultPayload;
        });
      } catch (error) {
        if (isUniqueViolation(error, 'exercise_canonical_key_unique')) {
          return {
            status: 'canonical_key_conflict',
            canonicalKey: semantic.target.canonicalKey,
          };
        }
        if (
          isUniqueViolation(
            error,
            'exercise_reference_candidate_kind_locator_purpose_unique',
          )
        ) {
          throw new Error(
            'Catalog reference candidate race; retry the publish operation',
          );
        }
        throw error;
      }
    },

    setExerciseLifecycle: async (
      command: ExerciseLifecycleRepositoryCommand,
    ): Promise<ExerciseLifecycleResult> => {
      const resolved = await resolveCatalogOperation(connection, ring, {
        operationKey: command.operation.key,
        namespace: 'exercise.lifecycle',
        canonicalizationVersion: command.operation.canonicalizationVersion,
        inputDigest: command.operation.digest,
      });

      if (resolved.status === 'operation_input_mismatch') {
        return {
          status: 'operation_input_mismatch',
          key: command.operation.key,
        };
      }

      if (resolved.status === 'replayed') {
        return (
          asExerciseLifecycleResult(resolved.operation.resultPayload) ?? {
            status: 'operation_input_mismatch',
            key: command.operation.key,
          }
        );
      }

      if (resolved.status === 'integrity_failure') {
        throw new Error(`Catalog ledger integrity failure: ${resolved.reason}`);
      }

      const stamped = nowIso();

      return await connection.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(exercises)
          .where(eq(exercises.id, command.exerciseId))
          .for('update')
          .limit(1);

        if (existing === undefined) {
          return {
            status: 'exercise_not_found',
            exerciseId: command.exerciseId,
          };
        }

        const previousLifecycle = existing.lifecycle as 'active' | 'archived';
        const alreadyAtTarget = previousLifecycle === command.targetLifecycle;
        const detail = await loadExerciseDetail(
          tx,
          exerciseIdSchema.parse(command.exerciseId),
        );
        if (detail === null) {
          throw new Error('Exercise detail missing for lifecycle update');
        }

        const nextDetail = exerciseDetailSchema.parse({
          ...detail,
          lifecycle: command.targetLifecycle,
        });

        const resultPayload: ExerciseLifecycleResult =
          command.targetLifecycle === 'archived'
            ? {
                status: 'exercise_archived',
                replayed: false,
                exercise: nextDetail as ExerciseDetail & {
                  lifecycle: 'archived';
                },
              }
            : {
                status: 'exercise_reactivated',
                replayed: false,
                exercise: nextDetail as ExerciseDetail & {
                  lifecycle: 'active';
                },
              };

        const canonicalResult = canonicalizeLedgerJson(resultPayload);
        const signed = signLedgerResult(ring, canonicalResult);
        if (typeof signed === 'string') {
          throw new Error(`Catalog ledger signing failure: ${signed}`);
        }

        const ledgerOperationId = randomUUID();
        await tx.insert(catalogOperations).values({
          id: ledgerOperationId,
          operationKey: command.operation.key,
          namespace: 'exercise.lifecycle',
          canonicalizationVersion: command.operation.canonicalizationVersion,
          inputDigest: command.operation.digest,
          status: 'committed',
          resultPayload: JSON.parse(canonicalResult) as unknown,
          resultIntegrityKeyId: signed.keyId,
          resultIntegrityDigest: signed.digest,
          createdAt: stamped,
        });

        if (!alreadyAtTarget) {
          await tx
            .update(exercises)
            .set({
              lifecycle: command.targetLifecycle,
              updatedAt: stamped,
            })
            .where(eq(exercises.id, command.exerciseId));

          await tx.insert(exerciseLifecycleEvents).values({
            id: randomUUID(),
            operationId: ledgerOperationId,
            exerciseId: command.exerciseId,
            eventKind:
              command.targetLifecycle === 'archived'
                ? 'archived'
                : 'reactivated',
            reason: command.reason,
            previousLifecycle,
            nextLifecycle: command.targetLifecycle,
            recordedAt: stamped,
          });
        }

        return resultPayload;
      });
    },

    createTaxonomyTerm: async (
      command: CreateTaxonomyTermRepositoryCommand,
    ): Promise<CreateTaxonomyTermResult> => {
      const resolved = await resolveCatalogOperation(connection, ring, {
        operationKey: command.operation.key,
        namespace: 'taxonomy.create',
        canonicalizationVersion: command.operation.canonicalizationVersion,
        inputDigest: command.operation.digest,
      });

      if (resolved.status === 'operation_input_mismatch') {
        return {
          status: 'operation_input_mismatch',
          key: command.operation.key,
        };
      }

      if (resolved.status === 'replayed') {
        return (
          asCreateTaxonomyResult(resolved.operation.resultPayload) ?? {
            status: 'operation_input_mismatch',
            key: command.operation.key,
          }
        );
      }

      if (resolved.status === 'integrity_failure') {
        throw new Error(`Catalog ledger integrity failure: ${resolved.reason}`);
      }

      const seeded = SEEDED_TAXONOMY_DIMENSIONS[command.dimension];
      if (seeded.id !== command.dimensionId) {
        throw new Error(
          `Taxonomy dimension id does not match key ${command.dimension}`,
        );
      }

      const stamped = nowIso();
      const termId = taxonomyTermIdSchema.parse(randomUUID());
      const term = taxonomyTermSchema.parse({
        id: termId,
        dimensionId: command.dimensionId,
        dimension: command.dimension,
        key: command.key,
        label: command.label,
        meaning: command.meaning,
        lifecycle: 'active',
        replacedByTermId: null,
      });

      const resultPayload: CreateTaxonomyTermResult = {
        status: 'taxonomy_term_created',
        replayed: false,
        term: term as TaxonomyTerm & { lifecycle: 'active' },
      };

      try {
        await commitLedgerAndRun(connection, ring, {
          operationKey: command.operation.key,
          namespace: 'taxonomy.create',
          canonicalizationVersion: command.operation.canonicalizationVersion,
          inputDigest: command.operation.digest,
          stamped,
          resultPayload,
          write: async (tx, ledgerOperationId) => {
            await tx.insert(taxonomyTerms).values({
              id: termId,
              dimensionId: command.dimensionId,
              key: command.key,
              label: command.label,
              meaning: command.meaning,
              lifecycle: 'active',
              replacedByTermId: null,
              operationId: ledgerOperationId,
              createdAt: stamped,
              updatedAt: stamped,
            });
            await tx.insert(taxonomyLifecycleEvents).values({
              id: randomUUID(),
              operationId: ledgerOperationId,
              termId,
              eventKind: 'created',
              reason: 'Taxonomy term created',
              previousLifecycle: null,
              nextLifecycle: 'active',
              recordedAt: stamped,
            });
          },
        });
      } catch (error) {
        if (isUniqueViolation(error, 'taxonomy_term_dimension_key_unique')) {
          return {
            status: 'taxonomy_key_conflict',
            dimensionId: command.dimensionId,
            key: command.key,
          };
        }
        throw error;
      }

      return resultPayload;
    },

    setTaxonomyTermLifecycle: async (
      command: TaxonomyTermLifecycleRepositoryCommand,
    ): Promise<TaxonomyTermLifecycleResult> => {
      const resolved = await resolveCatalogOperation(connection, ring, {
        operationKey: command.operation.key,
        namespace: 'taxonomy.lifecycle',
        canonicalizationVersion: command.operation.canonicalizationVersion,
        inputDigest: command.operation.digest,
      });

      if (resolved.status === 'operation_input_mismatch') {
        return {
          status: 'operation_input_mismatch',
          key: command.operation.key,
        };
      }

      if (resolved.status === 'replayed') {
        return (
          asTaxonomyLifecycleResult(resolved.operation.resultPayload) ?? {
            status: 'operation_input_mismatch',
            key: command.operation.key,
          }
        );
      }

      if (resolved.status === 'integrity_failure') {
        throw new Error(`Catalog ledger integrity failure: ${resolved.reason}`);
      }

      const stamped = nowIso();

      return await connection.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(taxonomyTerms)
          .where(eq(taxonomyTerms.id, command.termId))
          .for('update')
          .limit(1);

        if (existing === undefined) {
          return {
            status: 'taxonomy_term_not_found',
            termId: command.termId,
          };
        }

        if (
          existing.lifecycle === 'replaced' ||
          existing.replacedByTermId !== null
        ) {
          return {
            status: 'replaced_term_cannot_reactivate',
            termId: command.termId,
          };
        }

        const previousLifecycle = existing.lifecycle as 'active' | 'archived';
        const alreadyAtTarget = previousLifecycle === command.targetLifecycle;
        const current = await loadTerm(tx, command.termId);
        if (current === null) {
          throw new Error('Taxonomy term missing for lifecycle update');
        }

        const term = taxonomyTermSchema.parse({
          ...current,
          lifecycle: command.targetLifecycle,
          replacedByTermId: null,
        });

        const resultPayload: TaxonomyTermLifecycleResult =
          command.targetLifecycle === 'archived'
            ? {
                status: 'taxonomy_term_archived',
                replayed: false,
                term: term as TaxonomyTerm & { lifecycle: 'archived' },
              }
            : {
                status: 'taxonomy_term_reactivated',
                replayed: false,
                term: term as TaxonomyTerm & { lifecycle: 'active' },
              };

        const canonicalResult = canonicalizeLedgerJson(resultPayload);
        const signed = signLedgerResult(ring, canonicalResult);
        if (typeof signed === 'string') {
          throw new Error(`Catalog ledger signing failure: ${signed}`);
        }

        const ledgerOperationId = randomUUID();
        await tx.insert(catalogOperations).values({
          id: ledgerOperationId,
          operationKey: command.operation.key,
          namespace: 'taxonomy.lifecycle',
          canonicalizationVersion: command.operation.canonicalizationVersion,
          inputDigest: command.operation.digest,
          status: 'committed',
          resultPayload: JSON.parse(canonicalResult) as unknown,
          resultIntegrityKeyId: signed.keyId,
          resultIntegrityDigest: signed.digest,
          createdAt: stamped,
        });

        if (!alreadyAtTarget) {
          await tx
            .update(taxonomyTerms)
            .set({
              lifecycle: command.targetLifecycle,
              updatedAt: stamped,
            })
            .where(eq(taxonomyTerms.id, command.termId));

          // Schema check allows created|archived|replaced only (no reactivated).
          await tx.insert(taxonomyLifecycleEvents).values({
            id: randomUUID(),
            operationId: ledgerOperationId,
            termId: command.termId,
            eventKind:
              command.targetLifecycle === 'archived' ? 'archived' : 'created',
            reason: command.reason,
            previousLifecycle,
            nextLifecycle: command.targetLifecycle,
            recordedAt: stamped,
          });
        }

        return resultPayload;
      });
    },

    replaceTaxonomyTerm: async (
      command: ReplaceTaxonomyTermRepositoryCommand,
    ): Promise<ReplaceTaxonomyTermResult> => {
      const resolved = await resolveCatalogOperation(connection, ring, {
        operationKey: command.operation.key,
        namespace: 'taxonomy.replace',
        canonicalizationVersion: command.operation.canonicalizationVersion,
        inputDigest: command.operation.digest,
      });

      if (resolved.status === 'operation_input_mismatch') {
        return {
          status: 'operation_input_mismatch',
          key: command.operation.key,
        };
      }

      if (resolved.status === 'replayed') {
        return (
          asReplaceTaxonomyResult(resolved.operation.resultPayload) ?? {
            status: 'operation_input_mismatch',
            key: command.operation.key,
          }
        );
      }

      if (resolved.status === 'integrity_failure') {
        throw new Error(`Catalog ledger integrity failure: ${resolved.reason}`);
      }

      const stamped = nowIso();

      return await connection.db.transaction(async (tx) => {
        const lockIds = [command.sourceTermId, command.targetTermId].sort();
        for (const id of lockIds) {
          await tx
            .select({ id: taxonomyTerms.id })
            .from(taxonomyTerms)
            .where(eq(taxonomyTerms.id, id))
            .for('update')
            .limit(1);
        }

        const source = await loadTerm(tx, command.sourceTermId);
        const target = await loadTerm(tx, command.targetTermId);

        if (source === null) {
          return {
            status: 'taxonomy_term_not_found',
            termId: command.sourceTermId,
          };
        }
        if (target === null) {
          return {
            status: 'taxonomy_term_not_found',
            termId: command.targetTermId,
          };
        }

        const [predecessor] = await tx
          .select({ id: taxonomyTerms.id })
          .from(taxonomyTerms)
          .where(eq(taxonomyTerms.replacedByTermId, command.targetTermId))
          .limit(1);

        const validation = validateTaxonomyReplacement({
          source,
          target,
          sourceSuccessorId: source.replacedByTermId,
          targetPredecessorId:
            predecessor === undefined
              ? null
              : taxonomyTermIdSchema.parse(predecessor.id),
          targetSuccessorPath: await loadSuccessorPath(
            tx,
            command.targetTermId,
          ),
        });

        if (validation.status === 'invalid_replacement') {
          return {
            status: 'invalid_replacement',
            reason: validation.reason,
          };
        }

        const replacedSource = taxonomyTermSchema.parse({
          ...source,
          lifecycle: 'replaced',
          replacedByTermId: command.targetTermId,
        });
        const activeTarget = target;

        const resultPayload: ReplaceTaxonomyTermResult = {
          status: 'taxonomy_term_replaced',
          replayed: false,
          source: replacedSource as TaxonomyTerm & { lifecycle: 'replaced' },
          target: activeTarget as TaxonomyTerm & { lifecycle: 'active' },
        };

        const canonicalResult = canonicalizeLedgerJson(resultPayload);
        const signed = signLedgerResult(ring, canonicalResult);
        if (typeof signed === 'string') {
          throw new Error(`Catalog ledger signing failure: ${signed}`);
        }

        const ledgerOperationId = randomUUID();
        await tx.insert(catalogOperations).values({
          id: ledgerOperationId,
          operationKey: command.operation.key,
          namespace: 'taxonomy.replace',
          canonicalizationVersion: command.operation.canonicalizationVersion,
          inputDigest: command.operation.digest,
          status: 'committed',
          resultPayload: JSON.parse(canonicalResult) as unknown,
          resultIntegrityKeyId: signed.keyId,
          resultIntegrityDigest: signed.digest,
          createdAt: stamped,
        });

        await tx
          .update(taxonomyTerms)
          .set({
            lifecycle: 'replaced',
            replacedByTermId: command.targetTermId,
            updatedAt: stamped,
          })
          .where(eq(taxonomyTerms.id, command.sourceTermId));

        await tx.insert(taxonomyLifecycleEvents).values({
          id: randomUUID(),
          operationId: ledgerOperationId,
          termId: command.sourceTermId,
          eventKind: 'replaced',
          reason: command.reason,
          previousLifecycle: 'active',
          nextLifecycle: 'replaced',
          recordedAt: stamped,
        });

        return resultPayload;
      });
    },

    ingestManifest: async (command: ManifestIngestionRepositoryCommand) => {
      const resolved = await resolveCatalogOperation(connection, ring, {
        operationKey: command.operation.key,
        namespace: 'manifest.ingest',
        canonicalizationVersion: command.operation.canonicalizationVersion,
        inputDigest: command.operation.digest,
      });

      if (resolved.status === 'operation_input_mismatch') {
        return {
          status: 'operation_input_mismatch',
          key: command.operation.key,
        };
      }

      if (resolved.status === 'replayed') {
        return (
          asIngestedResult(resolved.operation.resultPayload) ?? {
            status: 'manifest_ingested',
            replayed: true,
            manifestId: command.manifest.manifestId,
            exerciseCount: command.manifest.exercises.length,
            taxonomyTermCount:
              command.manifest.taxonomy.modality.length +
              command.manifest.taxonomy.equipment.length,
          }
        );
      }

      if (resolved.status === 'integrity_failure') {
        throw new Error(`Catalog ledger integrity failure: ${resolved.reason}`);
      }

      const stamped = nowIso();
      const resultPayload: ManifestIngestionResult = {
        status: 'manifest_ingested',
        replayed: false,
        manifestId: command.manifest.manifestId,
        exerciseCount: command.manifest.exercises.length,
        taxonomyTermCount:
          command.manifest.taxonomy.modality.length +
          command.manifest.taxonomy.equipment.length,
      };
      const canonicalResult = canonicalizeLedgerJson(resultPayload);
      const signed = signLedgerResult(ring, canonicalResult);
      if (typeof signed === 'string') {
        throw new Error(`Catalog ledger signing failure: ${signed}`);
      }

      const ledgerOperationId = randomUUID();
      const termIdsByKey = new Map<string, string>();

      await connection.db.transaction(async (tx) => {
        await tx.insert(catalogOperations).values({
          id: ledgerOperationId,
          operationKey: command.operation.key,
          namespace: 'manifest.ingest',
          canonicalizationVersion: command.operation.canonicalizationVersion,
          inputDigest: command.operation.digest,
          status: 'committed',
          resultPayload: JSON.parse(canonicalResult) as unknown,
          resultIntegrityKeyId: signed.keyId,
          resultIntegrityDigest: signed.digest,
          createdAt: stamped,
        });

        const insertDimensionTerms = async (
          dimension: 'modality' | 'equipment',
          terms: CatalogManifest['taxonomy']['modality'],
        ) => {
          const dimensionId = SEEDED_TAXONOMY_DIMENSIONS[dimension].id;
          for (const term of terms) {
            const termId = taxonomyTermIdSchema.parse(randomUUID());
            termIdsByKey.set(`${dimension}:${term.key}`, termId);
            await tx.insert(taxonomyTerms).values({
              id: termId,
              dimensionId,
              key: term.key,
              label: term.label,
              meaning: term.meaning,
              lifecycle: 'active',
              replacedByTermId: null,
              operationId: ledgerOperationId,
              createdAt: stamped,
              updatedAt: stamped,
            });
            await tx.insert(taxonomyLifecycleEvents).values({
              id: randomUUID(),
              operationId: ledgerOperationId,
              termId,
              eventKind: 'created',
              reason: 'Manifest ingestion',
              previousLifecycle: null,
              nextLifecycle: 'active',
              recordedAt: stamped,
            });
          }
        };

        await insertDimensionTerms(
          'modality',
          command.manifest.taxonomy.modality,
        );
        await insertDimensionTerms(
          'equipment',
          command.manifest.taxonomy.equipment,
        );

        for (const exercise of command.manifest.exercises) {
          const modalityTermId = termIdsByKey.get(
            `modality:${exercise.modalityKey}`,
          );
          if (modalityTermId === undefined) {
            throw new Error(`Missing modality term ${exercise.modalityKey}`);
          }
          const equipmentTermIds = exercise.equipmentKeys.map((key) => {
            const id = termIdsByKey.get(`equipment:${key}`);
            if (id === undefined) {
              throw new Error(`Missing equipment term ${key}`);
            }
            return id;
          });

          const exerciseId = exerciseIdSchema.parse(randomUUID());
          const revisionId = exerciseRevisionIdSchema.parse(randomUUID());
          const publicationInput: PublicationSemanticInput = {
            target: { canonicalKey: exercise.canonicalKey, exerciseId: null },
            expectedCurrentRevision: null,
            content: {
              displayName: exercise.displayName,
              aliases: exercise.aliases,
              description: exercise.description,
              taxonomy: {
                modalityTermId: taxonomyTermIdSchema.parse(modalityTermId),
                equipmentTermIds: equipmentTermIds.map((id) =>
                  taxonomyTermIdSchema.parse(id),
                ),
              },
              provenance: {
                originKind: exercise.provenance.originKind,
                changeReason: exercise.provenance.changeReason,
                primaryProvenanceReference: null,
              },
              references: [],
            },
          };

          await tx.insert(exercises).values({
            id: exerciseId,
            canonicalKey: exercise.canonicalKey,
            lifecycle: 'active',
            currentRevisionId: null,
            currentRevisionNumber: 1,
            createdAt: stamped,
            updatedAt: stamped,
          });

          await tx.insert(exerciseRevisions).values({
            id: revisionId,
            exerciseId,
            revision: 1,
            displayName: exercise.displayName,
            aliases: [...exercise.aliases],
            description: exercise.description,
            originKind: exercise.provenance.originKind,
            changeReason: exercise.provenance.changeReason,
            recordedAt: stamped,
            primaryProvenanceReferenceId: null,
            contentHash: hashPublicationContent(publicationInput),
            publishedAt: stamped,
            operationId: ledgerOperationId,
          });

          await tx
            .update(exercises)
            .set({
              currentRevisionId: revisionId,
              currentRevisionNumber: 1,
              updatedAt: stamped,
            })
            .where(eq(exercises.id, exerciseId));

          await tx
            .insert(exerciseRevisionTaxonomyTerms)
            .values([
              { revisionId, termId: modalityTermId },
              ...equipmentTermIds.map((termId) => ({ revisionId, termId })),
            ]);

          await tx.insert(exerciseLifecycleEvents).values({
            id: randomUUID(),
            operationId: ledgerOperationId,
            exerciseId,
            eventKind: 'published',
            reason: exercise.provenance.changeReason,
            previousLifecycle: null,
            nextLifecycle: 'active',
            recordedAt: stamped,
          });
        }
      });

      return resultPayload;
    },
  };
}

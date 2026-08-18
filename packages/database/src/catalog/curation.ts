import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import {
  hashPublicationContent,
  type ExerciseCatalogCurationRepository,
  type ManifestIngestionRepositoryCommand,
  type ManifestIngestionResult,
  type PublicationSemanticInput,
} from '@fitness-os/domain';
import {
  exerciseIdSchema,
  exerciseRevisionIdSchema,
  taxonomyTermIdSchema,
  type CatalogManifest,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { canonicalizeLedgerJson } from './canonical-json.js';
import { signLedgerResult, type LedgerKeyRing } from './ledger-keyring.js';
import { resolveCatalogOperation } from './operation-ledger.js';
import {
  SEEDED_TAXONOMY_DIMENSIONS,
  catalogOperations,
  exerciseLifecycleEvents,
  exerciseRevisionTaxonomyTerms,
  exerciseRevisions,
  exercises,
  taxonomyLifecycleEvents,
  taxonomyTerms,
} from './tables.js';

function nowIso(): string {
  return new Date().toISOString();
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

export function createExerciseCatalogCuration(
  connection: PostgresConnection,
  ring: LedgerKeyRing,
): ExerciseCatalogCurationRepository {
  const notImplemented = async () => {
    throw new Error('Catalog mutation not implemented in this slice');
  };

  return {
    publishExercise: notImplemented,
    setExerciseLifecycle: notImplemented,
    createTaxonomyTerm: notImplemented,
    setTaxonomyTermLifecycle: notImplemented,
    replaceTaxonomyTerm: notImplemented,

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

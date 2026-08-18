import { and, asc, eq, gt, type SQL } from 'drizzle-orm';
import type { ExerciseKnowledgeReader } from '@fitness-os/domain';
import {
  exerciseDetailSchema,
  exerciseListPageSchema,
  exerciseRevisionSchema,
  taxonomyDiscoveryPageSchema,
  taxonomyTermSchema,
  type ExerciseId,
  type ExerciseListQuery,
  type TaxonomyDiscoveryQuery,
  type TaxonomyTerm,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import {
  exerciseRevisionTaxonomyTerms,
  exerciseRevisions,
  exercises,
  taxonomyDimensions,
  taxonomyTerms,
} from './tables.js';

async function loadTermById(
  connection: PostgresConnection,
  termId: string,
): Promise<TaxonomyTerm | null> {
  const [row] = await connection.db
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

async function loadAssignments(
  connection: PostgresConnection,
  revisionId: string,
) {
  const links = await connection.db
    .select({ termId: exerciseRevisionTaxonomyTerms.termId })
    .from(exerciseRevisionTaxonomyTerms)
    .where(eq(exerciseRevisionTaxonomyTerms.revisionId, revisionId));

  const terms = (
    await Promise.all(
      links.map((link) => loadTermById(connection, link.termId)),
    )
  ).filter((term): term is TaxonomyTerm => term !== null);

  const modality = terms.find((term) => term.dimension === 'modality');
  if (modality === undefined) {
    throw new Error('Revision is missing a modality assignment');
  }

  return {
    modality,
    equipment: terms.filter((term) => term.dimension === 'equipment'),
  };
}

async function loadRevisionDetail(
  connection: PostgresConnection,
  revisionId: string,
) {
  const [row] = await connection.db
    .select()
    .from(exerciseRevisions)
    .where(eq(exerciseRevisions.id, revisionId))
    .limit(1);

  if (row === undefined) {
    return null;
  }

  const taxonomy = await loadAssignments(connection, row.id);

  return exerciseRevisionSchema.parse({
    id: row.id,
    exerciseId: row.exerciseId,
    revision: row.revision,
    displayName: row.displayName,
    aliases: row.aliases,
    description: row.description,
    taxonomy,
    provenance: {
      originKind: row.originKind,
      recordedAt: new Date(row.recordedAt).toISOString(),
      changeReason: row.changeReason,
      primaryProvenanceReferenceId: row.primaryProvenanceReferenceId,
    },
    references: [],
    contentHash: row.contentHash,
    publishedAt: new Date(row.publishedAt).toISOString(),
  });
}

export function createExerciseCatalogReader(
  connection: PostgresConnection,
): ExerciseKnowledgeReader {
  return {
    listExercises: async (query: ExerciseListQuery) => {
      const filters: SQL[] = [eq(exercises.lifecycle, 'active')];
      if (query.cursor !== undefined) {
        filters.push(gt(exercises.id, query.cursor));
      }

      let rows = await connection.db
        .select()
        .from(exercises)
        .where(and(...filters))
        .orderBy(asc(exercises.id))
        .limit(query.limit + 1);

      if (query.taxonomyTermIds !== undefined) {
        const required = query.taxonomyTermIds;
        const filtered = [];
        for (const row of rows) {
          if (row.currentRevisionId === null) {
            continue;
          }
          const links = await connection.db
            .select({ termId: exerciseRevisionTaxonomyTerms.termId })
            .from(exerciseRevisionTaxonomyTerms)
            .where(
              eq(
                exerciseRevisionTaxonomyTerms.revisionId,
                row.currentRevisionId,
              ),
            );
          const assigned = new Set(links.map((link) => link.termId));
          if (required.every((termId) => assigned.has(termId))) {
            filtered.push(row);
          }
        }
        rows = filtered;
      }

      const pageRows = rows.slice(0, query.limit);
      const items = [];

      for (const row of pageRows) {
        if (row.currentRevisionId === null) {
          continue;
        }
        const revision = await loadRevisionDetail(
          connection,
          row.currentRevisionId,
        );
        if (revision === null) {
          continue;
        }
        items.push({
          id: row.id,
          canonicalKey: row.canonicalKey,
          currentRevision: row.currentRevisionNumber,
          currentName: revision.displayName,
          lifecycle: row.lifecycle,
          taxonomy: revision.taxonomy,
        });
      }

      const nextCursor =
        rows.length > query.limit && pageRows.length > 0
          ? pageRows[pageRows.length - 1]!.id
          : null;

      return exerciseListPageSchema.parse({ items, nextCursor });
    },

    getCurrentExercise: async (exerciseId: ExerciseId) => {
      const [row] = await connection.db
        .select()
        .from(exercises)
        .where(eq(exercises.id, exerciseId))
        .limit(1);

      if (row === undefined || row.currentRevisionId === null) {
        return null;
      }

      const revision = await loadRevisionDetail(
        connection,
        row.currentRevisionId,
      );
      if (revision === null) {
        return null;
      }

      return exerciseDetailSchema.parse({
        id: row.id,
        canonicalKey: row.canonicalKey,
        currentName: revision.displayName,
        lifecycle: row.lifecycle,
        taxonomy: revision.taxonomy,
        currentRevision: revision,
      });
    },

    getExerciseRevision: async (exerciseId: ExerciseId, revision: number) => {
      const [row] = await connection.db
        .select()
        .from(exerciseRevisions)
        .where(
          and(
            eq(exerciseRevisions.exerciseId, exerciseId),
            eq(exerciseRevisions.revision, revision),
          ),
        )
        .limit(1);

      if (row === undefined) {
        return null;
      }

      return loadRevisionDetail(connection, row.id);
    },

    listTaxonomy: async (query: TaxonomyDiscoveryQuery) => {
      const filters: SQL[] = [eq(taxonomyDimensions.key, query.dimension)];
      if (query.lifecycle !== 'all') {
        filters.push(eq(taxonomyTerms.lifecycle, query.lifecycle));
      }
      if (query.cursor !== undefined) {
        filters.push(gt(taxonomyTerms.id, query.cursor));
      }

      const rows = await connection.db
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
        .where(and(...filters))
        .orderBy(asc(taxonomyTerms.id))
        .limit(query.limit + 1);

      const page = rows.slice(0, query.limit);
      const items = page.map((row) =>
        taxonomyTermSchema.parse({
          id: row.id,
          dimensionId: row.dimensionId,
          dimension: row.dimensionKey,
          key: row.key,
          label: row.label,
          meaning: row.meaning,
          lifecycle: row.lifecycle,
          replacedByTermId: row.replacedByTermId,
        }),
      );

      return taxonomyDiscoveryPageSchema.parse({
        items,
        nextCursor:
          rows.length > query.limit && page.length > 0
            ? page[page.length - 1]!.id
            : null,
      });
    },
  };
}

import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Seeded by migration 0001; stable across environments. */
export const SEEDED_TAXONOMY_DIMENSIONS = {
  modality: {
    id: 'a1000001-0000-4000-8000-000000000001',
    key: 'modality',
    label: 'Modality',
  },
  equipment: {
    id: 'a1000002-0000-4000-8000-000000000002',
    key: 'equipment',
    label: 'Equipment',
  },
} as const;

/**
 * Global idempotency ledger. Result integrity uses the ledger key ring
 * (Option A), never the presentation cursor secret.
 */
export const catalogOperations = pgTable(
  'catalog_operation',
  {
    id: uuid('id').primaryKey(),
    operationKey: text('operation_key').notNull(),
    namespace: text('namespace').notNull(),
    canonicalizationVersion: text('canonicalization_version').notNull(),
    inputDigest: text('input_digest').notNull(),
    status: text('status').notNull(),
    resultPayload: jsonb('result_payload').notNull(),
    resultIntegrityKeyId: text('result_integrity_key_id').notNull(),
    resultIntegrityDigest: text('result_integrity_digest').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    uniqueIndex('catalog_operation_operation_key_unique').on(
      table.operationKey,
    ),
    check(
      'catalog_operation_namespace_check',
      sql`${table.namespace} IN (
        'exercise.publish',
        'exercise.lifecycle',
        'taxonomy.create',
        'taxonomy.lifecycle',
        'taxonomy.replace',
        'manifest.ingest'
      )`,
    ),
    check(
      'catalog_operation_status_check',
      sql`${table.status} IN ('committed')`,
    ),
    check(
      'catalog_operation_input_digest_check',
      sql`${table.inputDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'catalog_operation_result_integrity_digest_check',
      sql`${table.resultIntegrityDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'catalog_operation_result_integrity_key_id_check',
      sql`char_length(${table.resultIntegrityKeyId}) BETWEEN 1 AND 128`,
    ),
    index('catalog_operation_created_at_idx').on(table.createdAt),
  ],
);

export const taxonomyDimensions = pgTable(
  'taxonomy_dimension',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    label: text('label').notNull(),
  },
  (table) => [
    uniqueIndex('taxonomy_dimension_key_unique').on(table.key),
    check(
      'taxonomy_dimension_key_check',
      sql`${table.key} IN ('modality', 'equipment')`,
    ),
    check(
      'taxonomy_dimension_label_check',
      sql`char_length(${table.label}) BETWEEN 1 AND 120`,
    ),
  ],
);

export const taxonomyTerms = pgTable(
  'taxonomy_term',
  {
    id: uuid('id').primaryKey(),
    dimensionId: uuid('dimension_id')
      .notNull()
      .references(() => taxonomyDimensions.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    meaning: text('meaning').notNull(),
    lifecycle: text('lifecycle').notNull(),
    replacedByTermId: uuid('replaced_by_term_id'),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => catalogOperations.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    uniqueIndex('taxonomy_term_dimension_key_unique').on(
      table.dimensionId,
      table.key,
    ),
    uniqueIndex('taxonomy_term_replaced_by_unique')
      .on(table.replacedByTermId)
      .where(sql`${table.replacedByTermId} IS NOT NULL`),
    check(
      'taxonomy_term_lifecycle_check',
      sql`${table.lifecycle} IN ('active', 'archived', 'replaced')`,
    ),
    check(
      'taxonomy_term_key_check',
      sql`${table.key} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(${table.key}) BETWEEN 1 AND 64`,
    ),
    check(
      'taxonomy_term_label_check',
      sql`char_length(${table.label}) BETWEEN 1 AND 120`,
    ),
    check(
      'taxonomy_term_meaning_check',
      sql`char_length(${table.meaning}) BETWEEN 1 AND 1000`,
    ),
    check(
      'taxonomy_term_replacement_shape_check',
      sql`(
        (${table.lifecycle} = 'replaced' AND ${table.replacedByTermId} IS NOT NULL AND ${table.replacedByTermId} <> ${table.id})
        OR
        (${table.lifecycle} <> 'replaced' AND ${table.replacedByTermId} IS NULL)
      )`,
    ),
    foreignKey({
      columns: [table.replacedByTermId],
      foreignColumns: [table.id],
      name: 'taxonomy_term_replaced_by_term_id_taxonomy_term_id_fk',
    }).onDelete('restrict'),
    index('taxonomy_term_dimension_lifecycle_idx').on(
      table.dimensionId,
      table.lifecycle,
    ),
  ],
);

export const exerciseReferenceCandidates = pgTable(
  'exercise_reference_candidate',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    locator: text('locator').notNull(),
    purpose: text('purpose').notNull(),
    assessment: text('assessment').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    uniqueIndex('exercise_reference_candidate_kind_locator_purpose_unique').on(
      table.kind,
      table.locator,
      table.purpose,
    ),
    check(
      'exercise_reference_candidate_kind_check',
      sql`${table.kind} IN ('doi', 'https_url')`,
    ),
    check(
      'exercise_reference_candidate_purpose_check',
      sql`${table.purpose} IN ('provenance', 'evidence_candidate')`,
    ),
    check(
      'exercise_reference_candidate_assessment_check',
      sql`${table.assessment} = 'unassessed'`,
    ),
    check(
      'exercise_reference_candidate_locator_check',
      sql`char_length(${table.locator}) BETWEEN 1 AND 2048`,
    ),
  ],
);

export const exercises = pgTable(
  'exercise',
  {
    id: uuid('id').primaryKey(),
    canonicalKey: text('canonical_key').notNull(),
    lifecycle: text('lifecycle').notNull(),
    currentRevisionId: uuid('current_revision_id'),
    currentRevisionNumber: integer('current_revision_number').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    uniqueIndex('exercise_canonical_key_unique').on(table.canonicalKey),
    check(
      'exercise_lifecycle_check',
      sql`${table.lifecycle} IN ('active', 'archived')`,
    ),
    check(
      'exercise_canonical_key_check',
      sql`${table.canonicalKey} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(${table.canonicalKey}) BETWEEN 1 AND 64`,
    ),
    check(
      'exercise_current_revision_number_check',
      sql`${table.currentRevisionNumber} >= 1`,
    ),
    index('exercise_lifecycle_id_idx').on(table.lifecycle, table.id),
  ],
);

export const exerciseRevisions = pgTable(
  'exercise_revision',
  {
    id: uuid('id').primaryKey(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull(),
    displayName: text('display_name').notNull(),
    aliases: jsonb('aliases').$type<string[]>().notNull(),
    description: text('description').notNull(),
    originKind: text('origin_kind').notNull(),
    changeReason: text('change_reason').notNull(),
    recordedAt: timestamp('recorded_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    primaryProvenanceReferenceId: uuid('primary_provenance_reference_id'),
    contentHash: text('content_hash').notNull(),
    publishedAt: timestamp('published_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => catalogOperations.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('exercise_revision_exercise_revision_unique').on(
      table.exerciseId,
      table.revision,
    ),
    check('exercise_revision_revision_check', sql`${table.revision} >= 1`),
    check(
      'exercise_revision_display_name_check',
      sql`char_length(${table.displayName}) BETWEEN 1 AND 120`,
    ),
    check(
      'exercise_revision_description_check',
      sql`char_length(${table.description}) BETWEEN 1 AND 1000`,
    ),
    check(
      'exercise_revision_origin_kind_check',
      sql`${table.originKind} IN ('internally_curated', 'derived_from_public_locator')`,
    ),
    check(
      'exercise_revision_change_reason_check',
      sql`char_length(${table.changeReason}) BETWEEN 1 AND 500`,
    ),
    check(
      'exercise_revision_content_hash_check',
      sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'exercise_revision_provenance_shape_check',
      sql`(
        (${table.originKind} = 'internally_curated' AND ${table.primaryProvenanceReferenceId} IS NULL)
        OR
        (${table.originKind} = 'derived_from_public_locator' AND ${table.primaryProvenanceReferenceId} IS NOT NULL)
      )`,
    ),
    foreignKey({
      columns: [table.primaryProvenanceReferenceId],
      foreignColumns: [exerciseReferenceCandidates.id],
      name: 'exercise_revision_primary_provenance_reference_id_fk',
    }).onDelete('restrict'),
    index('exercise_revision_exercise_id_idx').on(table.exerciseId),
  ],
);

export const exerciseRevisionTaxonomyTerms = pgTable(
  'exercise_revision_taxonomy_term',
  {
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => exerciseRevisions.id, { onDelete: 'restrict' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => taxonomyTerms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('exercise_revision_taxonomy_term_unique').on(
      table.revisionId,
      table.termId,
    ),
    index('exercise_revision_taxonomy_term_term_idx').on(table.termId),
  ],
);

export const exerciseRevisionReferences = pgTable(
  'exercise_revision_reference',
  {
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => exerciseRevisions.id, { onDelete: 'restrict' }),
    referenceId: uuid('reference_id')
      .notNull()
      .references(() => exerciseReferenceCandidates.id, {
        onDelete: 'restrict',
      }),
    purpose: text('purpose').notNull(),
  },
  (table) => [
    uniqueIndex('exercise_revision_reference_unique').on(
      table.revisionId,
      table.referenceId,
      table.purpose,
    ),
    check(
      'exercise_revision_reference_purpose_check',
      sql`${table.purpose} IN ('provenance', 'evidence_candidate')`,
    ),
  ],
);

export const exerciseLifecycleEvents = pgTable(
  'exercise_lifecycle_event',
  {
    id: uuid('id').primaryKey(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => catalogOperations.id, { onDelete: 'restrict' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    eventKind: text('event_kind').notNull(),
    reason: text('reason').notNull(),
    previousLifecycle: text('previous_lifecycle'),
    nextLifecycle: text('next_lifecycle').notNull(),
    recordedAt: timestamp('recorded_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      'exercise_lifecycle_event_kind_check',
      sql`${table.eventKind} IN ('published', 'archived', 'reactivated')`,
    ),
    check(
      'exercise_lifecycle_event_reason_check',
      sql`char_length(${table.reason}) BETWEEN 1 AND 500`,
    ),
    check(
      'exercise_lifecycle_event_next_lifecycle_check',
      sql`${table.nextLifecycle} IN ('active', 'archived')`,
    ),
    index('exercise_lifecycle_event_exercise_recorded_idx').on(
      table.exerciseId,
      table.recordedAt,
    ),
  ],
);

export const taxonomyLifecycleEvents = pgTable(
  'taxonomy_lifecycle_event',
  {
    id: uuid('id').primaryKey(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => catalogOperations.id, { onDelete: 'restrict' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => taxonomyTerms.id, { onDelete: 'restrict' }),
    eventKind: text('event_kind').notNull(),
    reason: text('reason').notNull(),
    previousLifecycle: text('previous_lifecycle'),
    nextLifecycle: text('next_lifecycle').notNull(),
    recordedAt: timestamp('recorded_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      'taxonomy_lifecycle_event_kind_check',
      sql`${table.eventKind} IN ('created', 'archived', 'replaced')`,
    ),
    check(
      'taxonomy_lifecycle_event_reason_check',
      sql`char_length(${table.reason}) BETWEEN 1 AND 500`,
    ),
    check(
      'taxonomy_lifecycle_event_next_lifecycle_check',
      sql`${table.nextLifecycle} IN ('active', 'archived', 'replaced')`,
    ),
    index('taxonomy_lifecycle_event_term_recorded_idx').on(
      table.termId,
      table.recordedAt,
    ),
  ],
);

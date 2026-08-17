import { z } from 'zod';

export const exerciseIdSchema = z.uuidv4().brand<'ExerciseId'>();
export const exerciseRevisionIdSchema = z
  .uuidv4()
  .brand<'ExerciseRevisionId'>();
export const taxonomyDimensionIdSchema = z
  .uuidv4()
  .brand<'TaxonomyDimensionId'>();
export const taxonomyTermIdSchema = z.uuidv4().brand<'TaxonomyTermId'>();
export const referenceCandidateIdSchema = z
  .uuidv4()
  .brand<'ReferenceCandidateId'>();

const canonicalUtcTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
  }, 'Expected a canonical UTC timestamp with millisecond precision');

const boundedTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => value.normalize('NFC') === value, 'Expected NFC text');

export const canonicalCatalogKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const exerciseLifecycleSchema = z.enum(['active', 'archived']);
export const taxonomyTermLifecycleSchema = z.enum([
  'active',
  'archived',
  'replaced',
]);
export const taxonomyDimensionKeySchema = z.enum(['modality', 'equipment']);
export const originKindSchema = z.enum([
  'internally_curated',
  'derived_from_public_locator',
]);
export const referenceKindSchema = z.enum(['doi', 'https_url']);
export const referencePurposeSchema = z.enum([
  'provenance',
  'evidence_candidate',
]);
export const referenceAssessmentSchema = z.literal('unassessed');

const provenanceBaseShape = {
  recordedAt: canonicalUtcTimestampSchema,
  changeReason: boundedTextSchema(500),
};

export const provenanceSchema = z.discriminatedUnion('originKind', [
  z
    .object({
      originKind: z.literal('internally_curated'),
      ...provenanceBaseShape,
      primaryProvenanceReferenceId: z.null(),
    })
    .strict(),
  z
    .object({
      originKind: z.literal('derived_from_public_locator'),
      ...provenanceBaseShape,
      primaryProvenanceReferenceId: referenceCandidateIdSchema,
    })
    .strict(),
]);

const referenceBaseShape = {
  id: referenceCandidateIdSchema,
  purpose: referencePurposeSchema,
  assessment: referenceAssessmentSchema,
};

export const catalogReferenceCandidateSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...referenceBaseShape,
      kind: z.literal('doi'),
      locator: z
        .string()
        .min(7)
        .max(255)
        .regex(/^10\.\d{4,9}\/\S+$/i),
    })
    .strict(),
  z
    .object({
      ...referenceBaseShape,
      kind: z.literal('https_url'),
      locator: z
        .url()
        .max(2048)
        .refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === 'https:' &&
            url.username === '' &&
            url.password === ''
          );
        }, 'Expected an HTTPS URL without credentials'),
    })
    .strict(),
]);

const displayNameSchema = boundedTextSchema(120);
const labelSchema = boundedTextSchema(120);
const descriptionSchema = boundedTextSchema(1_000);
const aliasesSchema = z
  .array(boundedTextSchema(120))
  .max(20)
  .superRefine((aliases, context) => {
    const normalized = aliases.map((alias) => alias.toLocaleLowerCase('en-US'));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: 'custom',
        message: 'Aliases must be unique after normalization',
      });
    }
  });

export const taxonomyDimensionSchema = z
  .object({
    id: taxonomyDimensionIdSchema,
    key: taxonomyDimensionKeySchema,
    label: labelSchema,
  })
  .strict();

const taxonomyTermBaseShape = {
  id: taxonomyTermIdSchema,
  dimensionId: taxonomyDimensionIdSchema,
  dimension: taxonomyDimensionKeySchema,
  key: canonicalCatalogKeySchema,
  label: labelSchema,
  meaning: descriptionSchema,
};

export const taxonomyTermSchema = z.discriminatedUnion('lifecycle', [
  z
    .object({
      ...taxonomyTermBaseShape,
      lifecycle: z.literal('active'),
      replacedByTermId: z.null(),
    })
    .strict(),
  z
    .object({
      ...taxonomyTermBaseShape,
      lifecycle: z.literal('archived'),
      replacedByTermId: z.null(),
    })
    .strict(),
  z
    .object({
      ...taxonomyTermBaseShape,
      lifecycle: z.literal('replaced'),
      replacedByTermId: taxonomyTermIdSchema,
    })
    .strict(),
]);

export const exerciseTaxonomyAssignmentsSchema = z
  .object({
    modality: taxonomyTermSchema,
    equipment: z.array(taxonomyTermSchema).max(32),
  })
  .strict()
  .superRefine((taxonomy, context) => {
    if (taxonomy.modality.dimension !== 'modality') {
      context.addIssue({
        code: 'custom',
        message: 'The modality assignment must use the modality dimension',
        path: ['modality'],
      });
    }
    const equipmentIds = taxonomy.equipment.map((term) => term.id);
    if (taxonomy.equipment.some((term) => term.dimension !== 'equipment')) {
      context.addIssue({
        code: 'custom',
        message: 'Equipment assignments must use the equipment dimension',
        path: ['equipment'],
      });
    }
    if (new Set(equipmentIds).size !== equipmentIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Equipment assignments must be unique',
        path: ['equipment'],
      });
    }
  });

export const exerciseRevisionSchema = z
  .object({
    id: exerciseRevisionIdSchema,
    exerciseId: exerciseIdSchema,
    revision: z.number().int().positive(),
    displayName: displayNameSchema,
    aliases: aliasesSchema,
    description: descriptionSchema,
    taxonomy: exerciseTaxonomyAssignmentsSchema,
    provenance: provenanceSchema,
    references: z.array(catalogReferenceCandidateSchema).max(20),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    publishedAt: canonicalUtcTimestampSchema,
  })
  .strict()
  .superRefine((revision, context) => {
    const referenceIds = revision.references.map((reference) => reference.id);
    if (new Set(referenceIds).size !== referenceIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Reference candidates must have unique IDs',
        path: ['references'],
      });
    }
    const provenanceReferences = revision.references.filter(
      (reference) => reference.purpose === 'provenance',
    );
    if (revision.provenance.originKind === 'internally_curated') {
      if (provenanceReferences.length !== 0) {
        context.addIssue({
          code: 'custom',
          message: 'Internally curated revisions cannot carry provenance links',
          path: ['references'],
        });
      }
    } else if (
      provenanceReferences.length !== 1 ||
      provenanceReferences[0]?.id !==
        revision.provenance.primaryProvenanceReferenceId
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Derived provenance must link exactly one associated provenance reference',
        path: ['provenance', 'primaryProvenanceReferenceId'],
      });
    }
  });

export const exerciseSummarySchema = z
  .object({
    id: exerciseIdSchema,
    canonicalKey: canonicalCatalogKeySchema,
    currentRevision: z.number().int().positive(),
    currentName: displayNameSchema,
    lifecycle: exerciseLifecycleSchema,
    taxonomy: exerciseTaxonomyAssignmentsSchema,
  })
  .strict();

export const exerciseDetailSchema = z
  .object({
    id: exerciseIdSchema,
    canonicalKey: canonicalCatalogKeySchema,
    currentName: displayNameSchema,
    lifecycle: exerciseLifecycleSchema,
    taxonomy: exerciseTaxonomyAssignmentsSchema,
    currentRevision: exerciseRevisionSchema,
  })
  .strict()
  .superRefine((detail, context) => {
    const detailEquipment = detail.taxonomy.equipment.map((term) => term.id);
    const revisionEquipment = detail.currentRevision.taxonomy.equipment.map(
      (term) => term.id,
    );
    if (
      detail.currentRevision.exerciseId !== detail.id ||
      detail.currentRevision.displayName !== detail.currentName ||
      detail.taxonomy.modality.id !==
        detail.currentRevision.taxonomy.modality.id ||
      detailEquipment.length !== revisionEquipment.length ||
      detailEquipment.some((id, index) => id !== revisionEquipment[index])
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Current revision must belong to and describe the exercise',
        path: ['currentRevision'],
      });
    }
  });

export const catalogCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

export const exerciseListPageSchema = z
  .object({
    items: z.array(exerciseSummarySchema).max(100),
    nextCursor: catalogCursorSchema.nullable(),
  })
  .strict();

export const taxonomyDiscoveryPageSchema = z
  .object({
    items: z.array(taxonomyTermSchema).max(100),
    nextCursor: catalogCursorSchema.nullable(),
  })
  .strict();

const taxonomyTermIdFilterSchema = z
  .union([
    taxonomyTermIdSchema.transform((id) => [id]),
    z.array(taxonomyTermIdSchema).min(1).max(20),
  ])
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Taxonomy filters must be unique',
      });
    }
  });

export const exerciseListQuerySchema = z
  .object({
    cursor: catalogCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    taxonomyTermIds: taxonomyTermIdFilterSchema.optional(),
  })
  .strict();

export const taxonomyDiscoveryQuerySchema = z
  .object({
    dimension: taxonomyDimensionKeySchema,
    lifecycle: z.enum(['active', 'archived', 'all']).default('active'),
    cursor: catalogCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const exerciseIdParamsSchema = z
  .object({ exerciseId: exerciseIdSchema })
  .strict();

export const exerciseRevisionParamsSchema = z
  .object({
    exerciseId: exerciseIdSchema,
    revision: z.coerce.number().int().positive(),
  })
  .strict();

const manifestTaxonomyTermSchema = z
  .object({
    key: canonicalCatalogKeySchema,
    label: labelSchema,
    meaning: descriptionSchema,
  })
  .strict();

const manifestReferenceBaseShape = {
  key: canonicalCatalogKeySchema,
  purpose: referencePurposeSchema,
  assessment: referenceAssessmentSchema,
};

const manifestReferenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...manifestReferenceBaseShape,
      kind: z.literal('doi'),
      locator: z
        .string()
        .min(7)
        .max(255)
        .regex(/^10\.\d{4,9}\/\S+$/i),
    })
    .strict(),
  z
    .object({
      ...manifestReferenceBaseShape,
      kind: z.literal('https_url'),
      locator: z
        .url()
        .max(2048)
        .refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === 'https:' &&
            url.username === '' &&
            url.password === ''
          );
        }, 'Expected an HTTPS URL without credentials'),
    })
    .strict(),
]);

const manifestProvenanceSchema = z.discriminatedUnion('originKind', [
  z
    .object({
      originKind: z.literal('internally_curated'),
      changeReason: boundedTextSchema(500),
      primaryProvenanceReferenceKey: z.null(),
    })
    .strict(),
  z
    .object({
      originKind: z.literal('derived_from_public_locator'),
      changeReason: boundedTextSchema(500),
      primaryProvenanceReferenceKey: canonicalCatalogKeySchema,
    })
    .strict(),
]);

const manifestExerciseSchema = z
  .object({
    canonicalKey: canonicalCatalogKeySchema,
    displayName: displayNameSchema,
    aliases: aliasesSchema,
    description: descriptionSchema,
    modalityKey: canonicalCatalogKeySchema,
    equipmentKeys: z.array(canonicalCatalogKeySchema).max(32),
    provenance: manifestProvenanceSchema,
    references: z.array(manifestReferenceSchema).max(20),
  })
  .strict()
  .superRefine((exercise, context) => {
    if (
      new Set(exercise.equipmentKeys).size !== exercise.equipmentKeys.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Equipment keys must be unique',
        path: ['equipmentKeys'],
      });
    }
    const referenceKeys = exercise.references.map((reference) => reference.key);
    if (new Set(referenceKeys).size !== referenceKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Reference keys must be unique',
        path: ['references'],
      });
    }
    const provenanceReferences = exercise.references.filter(
      (reference) => reference.purpose === 'provenance',
    );
    if (exercise.provenance.originKind === 'derived_from_public_locator') {
      const primary = exercise.references.find(
        (reference) =>
          reference.key === exercise.provenance.primaryProvenanceReferenceKey,
      );
      if (
        primary?.purpose !== 'provenance' ||
        provenanceReferences.length !== 1
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Derived provenance must link exactly one associated provenance reference',
          path: ['provenance', 'primaryProvenanceReferenceKey'],
        });
      }
    } else if (provenanceReferences.length !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'Internally curated content cannot carry provenance links',
        path: ['references'],
      });
    }
  });

export const catalogManifestSchema = z
  .object({
    schemaVersion: z.literal('catalog-manifest.v1'),
    manifestId: canonicalCatalogKeySchema,
    taxonomy: z
      .object({
        modality: z.array(manifestTaxonomyTermSchema).min(1).max(1_000),
        equipment: z.array(manifestTaxonomyTermSchema).min(1).max(1_000),
      })
      .strict(),
    exercises: z.array(manifestExerciseSchema).min(1).max(1_000),
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const dimension of ['modality', 'equipment'] as const) {
      const keys = manifest.taxonomy[dimension].map((term) => term.key);
      if (new Set(keys).size !== keys.length) {
        context.addIssue({
          code: 'custom',
          message: `${dimension} taxonomy keys must be unique`,
          path: ['taxonomy', dimension],
        });
      }
    }

    const exerciseKeys = manifest.exercises.map(
      (exercise) => exercise.canonicalKey,
    );
    if (new Set(exerciseKeys).size !== exerciseKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Exercise canonical keys must be unique',
        path: ['exercises'],
      });
    }

    const modalityKeys = new Set(
      manifest.taxonomy.modality.map((term) => term.key),
    );
    const equipmentKeys = new Set(
      manifest.taxonomy.equipment.map((term) => term.key),
    );
    manifest.exercises.forEach((exercise, index) => {
      if (!modalityKeys.has(exercise.modalityKey)) {
        context.addIssue({
          code: 'custom',
          message: 'Exercise modality key must resolve in the manifest',
          path: ['exercises', index, 'modalityKey'],
        });
      }
      exercise.equipmentKeys.forEach((key, equipmentIndex) => {
        if (!equipmentKeys.has(key)) {
          context.addIssue({
            code: 'custom',
            message: 'Exercise equipment key must resolve in the manifest',
            path: ['exercises', index, 'equipmentKeys', equipmentIndex],
          });
        }
      });
    });
  });

export type ExerciseId = z.infer<typeof exerciseIdSchema>;
export type ExerciseRevisionId = z.infer<typeof exerciseRevisionIdSchema>;
export type TaxonomyDimensionId = z.infer<typeof taxonomyDimensionIdSchema>;
export type TaxonomyTermId = z.infer<typeof taxonomyTermIdSchema>;
export type ReferenceCandidateId = z.infer<typeof referenceCandidateIdSchema>;
export type ExerciseLifecycle = z.infer<typeof exerciseLifecycleSchema>;
export type TaxonomyTermLifecycle = z.infer<typeof taxonomyTermLifecycleSchema>;
export type TaxonomyDimensionKey = z.infer<typeof taxonomyDimensionKeySchema>;
export type OriginKind = z.infer<typeof originKindSchema>;
export type ReferenceKind = z.infer<typeof referenceKindSchema>;
export type ReferencePurpose = z.infer<typeof referencePurposeSchema>;
export type ReferenceAssessment = z.infer<typeof referenceAssessmentSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type CatalogReferenceCandidate = z.infer<
  typeof catalogReferenceCandidateSchema
>;
export type TaxonomyDimension = z.infer<typeof taxonomyDimensionSchema>;
export type TaxonomyTerm = z.infer<typeof taxonomyTermSchema>;
export type ExerciseTaxonomyAssignments = z.infer<
  typeof exerciseTaxonomyAssignmentsSchema
>;
export type ExerciseRevision = z.infer<typeof exerciseRevisionSchema>;
export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>;
export type ExerciseDetail = z.infer<typeof exerciseDetailSchema>;
export type ExerciseListPage = z.infer<typeof exerciseListPageSchema>;
export type TaxonomyDiscoveryPage = z.infer<typeof taxonomyDiscoveryPageSchema>;
export type ExerciseListQuery = z.infer<typeof exerciseListQuerySchema>;
export type TaxonomyDiscoveryQuery = z.infer<
  typeof taxonomyDiscoveryQuerySchema
>;
export type ExerciseIdParams = z.infer<typeof exerciseIdParamsSchema>;
export type ExerciseRevisionParams = z.infer<
  typeof exerciseRevisionParamsSchema
>;
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

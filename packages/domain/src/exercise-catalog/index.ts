import { createHash } from 'node:crypto';

import type {
  CatalogReferenceCandidate,
  ExerciseDetail,
  ExerciseId,
  ExerciseLifecycle,
  ExerciseListPage,
  ExerciseListQuery,
  ExerciseRevision,
  ExerciseTaxonomyAssignments,
  OriginKind,
  Provenance,
  ReferenceAssessment,
  ReferenceKind,
  ReferencePurpose,
  TaxonomyDimensionId,
  TaxonomyDimensionKey,
  TaxonomyDiscoveryPage,
  TaxonomyDiscoveryQuery,
  TaxonomyTermId,
  TaxonomyTerm,
} from '@fitness-os/schemas';

export const CATALOG_CANONICALIZATION_VERSION = 'exercise-catalog.v1' as const;

declare const catalogInputDigestBrand: unique symbol;
declare const catalogContentHashBrand: unique symbol;
declare const catalogOperationKeyBrand: unique symbol;

export type CatalogInputDigest = string & {
  readonly [catalogInputDigestBrand]: true;
};
export type CatalogContentHash = string & {
  readonly [catalogContentHashBrand]: true;
};
export type CatalogOperationNamespace =
  | 'exercise.publish'
  | 'exercise.lifecycle'
  | 'taxonomy.create'
  | 'taxonomy.lifecycle'
  | 'taxonomy.replace'
  | 'manifest.ingest';
export type CatalogOperationKey = string & {
  readonly [catalogOperationKeyBrand]: true;
};

export interface CatalogOperationAttempt {
  readonly key: CatalogOperationKey;
  readonly canonicalizationVersion: typeof CATALOG_CANONICALIZATION_VERSION;
  readonly digest: CatalogInputDigest;
}

export interface CommittedCatalogOperation<
  Result,
> extends CatalogOperationAttempt {
  readonly result: Result;
}

export type CatalogOperationResolution<Result> =
  | {
      readonly status: 'new_operation';
      readonly operation: CatalogOperationAttempt;
    }
  | { readonly status: 'replayed'; readonly result: Result }
  | {
      readonly status: 'operation_input_mismatch';
      readonly key: CatalogOperationKey;
    };

const operationUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createCatalogOperationKey = (
  namespace: CatalogOperationNamespace,
  operationId: string,
): CatalogOperationKey => {
  if (!operationUuidPattern.test(operationId)) {
    throw new TypeError('Catalog operation ID must be a UUIDv4');
  }
  return `${namespace}:${operationId.toLowerCase()}` as CatalogOperationKey;
};

export const createPublishOperationKey = (operationId: string) =>
  createCatalogOperationKey('exercise.publish', operationId);
export const createExerciseLifecycleOperationKey = (operationId: string) =>
  createCatalogOperationKey('exercise.lifecycle', operationId);
export const createTaxonomyCreateOperationKey = (operationId: string) =>
  createCatalogOperationKey('taxonomy.create', operationId);
export const createTaxonomyLifecycleOperationKey = (operationId: string) =>
  createCatalogOperationKey('taxonomy.lifecycle', operationId);
export const createTaxonomyReplaceOperationKey = (operationId: string) =>
  createCatalogOperationKey('taxonomy.replace', operationId);
export const createManifestIngestOperationKey = (operationId: string) =>
  createCatalogOperationKey('manifest.ingest', operationId);

export const resolveCatalogOperation = <Result>(
  committed: CommittedCatalogOperation<Result> | null,
  attempted: CatalogOperationAttempt,
): CatalogOperationResolution<Result> => {
  if (committed === null || committed.key !== attempted.key) {
    return { status: 'new_operation', operation: attempted };
  }
  if (
    committed.canonicalizationVersion !== attempted.canonicalizationVersion ||
    committed.digest !== attempted.digest
  ) {
    return { status: 'operation_input_mismatch', key: attempted.key };
  }
  return { status: 'replayed', result: committed.result };
};

export interface PublicationReferenceInput {
  readonly kind: ReferenceKind;
  readonly locator: string;
  readonly purpose: ReferencePurpose;
  readonly assessment: ReferenceAssessment;
}

export interface PublicationProvenanceInput {
  readonly originKind: OriginKind;
  readonly changeReason: string;
  readonly primaryProvenanceReference: Pick<
    PublicationReferenceInput,
    'kind' | 'locator'
  > | null;
}

export interface PublicationContentInput {
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly taxonomy: {
    readonly modalityTermId: TaxonomyTermId;
    readonly equipmentTermIds: readonly TaxonomyTermId[];
  };
  readonly provenance: PublicationProvenanceInput;
  readonly references: readonly PublicationReferenceInput[];
}

export interface PublicationSemanticInput {
  readonly target: {
    readonly canonicalKey: string;
    readonly exerciseId: ExerciseId | null;
  };
  readonly expectedCurrentRevision: number | null;
  readonly content: PublicationContentInput;
}

export interface PublishExerciseRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly semanticInput: PublicationSemanticInput;
  readonly contentHash: CatalogContentHash;
}

export interface ExerciseLifecycleRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly exerciseId: ExerciseId;
  readonly targetLifecycle: ExerciseLifecycle;
  readonly reason: string;
}

export interface CreateTaxonomyTermRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly dimensionId: TaxonomyDimensionId;
  readonly dimension: TaxonomyDimensionKey;
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
}

export interface TaxonomyTermLifecycleRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly termId: TaxonomyTermId;
  readonly targetLifecycle: 'active' | 'archived';
  readonly reason: string;
}

export interface ReplaceTaxonomyTermRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly sourceTermId: TaxonomyTermId;
  readonly targetTermId: TaxonomyTermId;
  readonly reason: string;
}

export type OperationInputMismatchResult = {
  readonly status: 'operation_input_mismatch';
  readonly key: CatalogOperationKey;
};

export type PublishExerciseResult =
  | {
      readonly status: 'published';
      readonly replayed: boolean;
      readonly exercise: ExerciseDetail;
    }
  | {
      readonly status: 'stale_revision';
      readonly expectedCurrentRevision: number | null;
      readonly actualCurrentRevision: number | null;
    }
  | {
      readonly status: 'canonical_key_conflict';
      readonly canonicalKey: string;
    }
  | {
      readonly status: 'invalid_publication';
      readonly violations: readonly PublicationViolation[];
    }
  | OperationInputMismatchResult;

export type ExerciseLifecycleResult =
  | {
      readonly status: 'exercise_lifecycle_changed';
      readonly replayed: boolean;
      readonly exercise: ExerciseDetail;
    }
  | { readonly status: 'exercise_not_found'; readonly exerciseId: ExerciseId }
  | OperationInputMismatchResult;

export type CreateTaxonomyTermResult =
  | {
      readonly status: 'taxonomy_term_created';
      readonly replayed: boolean;
      readonly term: TaxonomyTerm;
    }
  | {
      readonly status: 'taxonomy_key_conflict';
      readonly dimensionId: TaxonomyDimensionId;
      readonly key: string;
    }
  | OperationInputMismatchResult;

export type TaxonomyTermLifecycleResult =
  | {
      readonly status: 'taxonomy_term_lifecycle_changed';
      readonly replayed: boolean;
      readonly term: TaxonomyTerm;
    }
  | {
      readonly status: 'taxonomy_term_not_found';
      readonly termId: TaxonomyTermId;
    }
  | {
      readonly status: 'replaced_term_cannot_reactivate';
      readonly termId: TaxonomyTermId;
    }
  | OperationInputMismatchResult;

export type ReplaceTaxonomyTermResult =
  | {
      readonly status: 'taxonomy_term_replaced';
      readonly replayed: boolean;
      readonly source: TaxonomyTerm;
      readonly target: TaxonomyTerm;
    }
  | {
      readonly status: 'taxonomy_term_not_found';
      readonly termId: TaxonomyTermId;
    }
  | {
      readonly status: 'invalid_replacement';
      readonly reason: TaxonomyReplacementFailure;
    }
  | OperationInputMismatchResult;

export interface ExerciseKnowledgeReader {
  listExercises(query: ExerciseListQuery): Promise<ExerciseListPage>;
  getCurrentExercise(exerciseId: ExerciseId): Promise<ExerciseDetail | null>;
  getExerciseRevision(
    exerciseId: ExerciseId,
    revision: number,
  ): Promise<ExerciseRevision | null>;
  listTaxonomy(query: TaxonomyDiscoveryQuery): Promise<TaxonomyDiscoveryPage>;
}

export interface ExerciseCatalogCurationRepository {
  publishExercise(
    command: PublishExerciseRepositoryCommand,
  ): Promise<PublishExerciseResult>;
  setExerciseLifecycle(
    command: ExerciseLifecycleRepositoryCommand,
  ): Promise<ExerciseLifecycleResult>;
  createTaxonomyTerm(
    command: CreateTaxonomyTermRepositoryCommand,
  ): Promise<CreateTaxonomyTermResult>;
  setTaxonomyTermLifecycle(
    command: TaxonomyTermLifecycleRepositoryCommand,
  ): Promise<TaxonomyTermLifecycleResult>;
  replaceTaxonomyTerm(
    command: ReplaceTaxonomyTermRepositoryCommand,
  ): Promise<ReplaceTaxonomyTermResult>;
}

export type PublicationViolation =
  | 'modality_term_not_active'
  | 'equipment_term_not_active'
  | 'internally_curated_provenance_reference'
  | 'derived_provenance_reference_missing_or_ambiguous';

export type PublicationInvariantResult =
  | { readonly status: 'valid' }
  | {
      readonly status: 'invalid_publication';
      readonly violations: readonly PublicationViolation[];
    };

export const validatePublicationInvariants = (input: {
  readonly taxonomy: ExerciseTaxonomyAssignments;
  readonly provenance: Provenance;
  readonly references: readonly CatalogReferenceCandidate[];
}): PublicationInvariantResult => {
  const violations: PublicationViolation[] = [];
  if (input.taxonomy.modality.lifecycle !== 'active') {
    violations.push('modality_term_not_active');
  }
  if (input.taxonomy.equipment.some((term) => term.lifecycle !== 'active')) {
    violations.push('equipment_term_not_active');
  }
  const provenanceReferences = input.references.filter(
    (reference) => reference.purpose === 'provenance',
  );
  if (
    input.provenance.originKind === 'internally_curated' &&
    provenanceReferences.length !== 0
  ) {
    violations.push('internally_curated_provenance_reference');
  }
  if (
    input.provenance.originKind === 'derived_from_public_locator' &&
    (provenanceReferences.length !== 1 ||
      provenanceReferences[0]?.id !==
        input.provenance.primaryProvenanceReferenceId)
  ) {
    violations.push('derived_provenance_reference_missing_or_ambiguous');
  }
  return violations.length === 0
    ? { status: 'valid' }
    : { status: 'invalid_publication', violations };
};

export type TaxonomyReplacementFailure =
  | 'self_replacement'
  | 'cross_dimension_replacement'
  | 'source_term_not_active'
  | 'target_term_not_active'
  | 'source_already_has_successor'
  | 'target_already_has_predecessor'
  | 'replacement_cycle';

export type TaxonomyReplacementResult =
  | { readonly status: 'valid' }
  | {
      readonly status: 'invalid_replacement';
      readonly reason: TaxonomyReplacementFailure;
    };

export const validateTaxonomyReplacement = (input: {
  readonly source: TaxonomyTerm;
  readonly target: TaxonomyTerm;
  readonly sourceSuccessorId: TaxonomyTermId | null;
  readonly targetPredecessorId: TaxonomyTermId | null;
  readonly targetSuccessorPath: readonly TaxonomyTermId[];
}): TaxonomyReplacementResult => {
  if (input.source.id === input.target.id) {
    return { status: 'invalid_replacement', reason: 'self_replacement' };
  }
  if (
    input.source.dimensionId !== input.target.dimensionId ||
    input.source.dimension !== input.target.dimension
  ) {
    return {
      status: 'invalid_replacement',
      reason: 'cross_dimension_replacement',
    };
  }
  if (input.source.lifecycle !== 'active') {
    return { status: 'invalid_replacement', reason: 'source_term_not_active' };
  }
  if (input.target.lifecycle !== 'active') {
    return { status: 'invalid_replacement', reason: 'target_term_not_active' };
  }
  if (input.sourceSuccessorId !== null) {
    return {
      status: 'invalid_replacement',
      reason: 'source_already_has_successor',
    };
  }
  if (input.targetPredecessorId !== null) {
    return {
      status: 'invalid_replacement',
      reason: 'target_already_has_predecessor',
    };
  }
  if (input.targetSuccessorPath.includes(input.source.id)) {
    return { status: 'invalid_replacement', reason: 'replacement_cycle' };
  }
  return { status: 'valid' };
};

const compareBytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

const normalizeText = (value: string): string =>
  value.normalize('NFC').trim().replace(/\s+/gu, ' ');

const canonicalLocator = (
  reference: Pick<PublicationReferenceInput, 'kind' | 'locator'>,
): string => {
  const locator = reference.locator.normalize('NFC').trim();
  return reference.kind === 'doi'
    ? locator.toLowerCase()
    : new URL(locator).href;
};

export const canonicalizePublicationInput = (
  input: PublicationSemanticInput,
): string => {
  const references = input.content.references
    .map((reference) => ({
      kind: reference.kind,
      locator: canonicalLocator(reference),
      purpose: reference.purpose,
      assessment: reference.assessment,
    }))
    .sort((left, right) =>
      compareBytes(
        `${left.kind}\u0000${left.locator}\u0000${left.purpose}`,
        `${right.kind}\u0000${right.locator}\u0000${right.purpose}`,
      ),
    );

  const primaryProvenanceReference =
    input.content.provenance.primaryProvenanceReference === null
      ? null
      : {
          kind: input.content.provenance.primaryProvenanceReference.kind,
          locator: canonicalLocator(
            input.content.provenance.primaryProvenanceReference,
          ),
        };

  return JSON.stringify({
    canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
    target: {
      canonicalKey: input.target.canonicalKey,
      exerciseId: input.target.exerciseId,
    },
    expectedCurrentRevision: input.expectedCurrentRevision,
    content: {
      displayName: normalizeText(input.content.displayName),
      aliases: input.content.aliases.map(normalizeText).sort(compareBytes),
      description: normalizeText(input.content.description),
      taxonomy: {
        modalityTermId: input.content.taxonomy.modalityTermId,
        equipmentTermIds: [...input.content.taxonomy.equipmentTermIds].sort(
          compareBytes,
        ),
      },
      provenance: {
        originKind: input.content.provenance.originKind,
        changeReason: normalizeText(input.content.provenance.changeReason),
        primaryProvenanceReference,
      },
      references,
    },
  });
};

const sha256 = (canonicalInput: string): string =>
  createHash('sha256').update(canonicalInput, 'utf8').digest('hex');

export const hashPublicationOperation = (
  input: PublicationSemanticInput,
): CatalogInputDigest =>
  sha256(canonicalizePublicationInput(input)) as CatalogInputDigest;

export const hashPublicationContent = (
  input: PublicationSemanticInput,
): CatalogContentHash => {
  const canonicalOperation = JSON.parse(
    canonicalizePublicationInput(input),
  ) as { readonly content: unknown };
  return sha256(
    JSON.stringify({
      canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
      content: canonicalOperation.content,
    }),
  ) as CatalogContentHash;
};

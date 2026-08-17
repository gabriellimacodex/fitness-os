import { createHash } from 'node:crypto';

import {
  canonicalCatalogKeySchema,
  catalogManifestSchema,
  exerciseIdSchema,
  exerciseLifecycleSchema,
  taxonomyDimensionIdSchema,
  taxonomyDimensionKeySchema,
  taxonomyTermIdSchema,
} from '@fitness-os/schemas';
import type {
  CatalogManifest,
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
const serverOwnedCommandBrand: unique symbol = Symbol(
  'server-owned-catalog-command',
);
const catalogOperationAttemptBrand: unique symbol = Symbol(
  'server-owned-catalog-operation-attempt',
);

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
  readonly [catalogOperationAttemptBrand]: true;
  readonly key: CatalogOperationKey;
  readonly canonicalizationVersion: typeof CATALOG_CANONICALIZATION_VERSION;
  readonly digest: CatalogInputDigest;
}

export interface CommittedCatalogOperation<Result> {
  readonly key: CatalogOperationKey;
  readonly canonicalizationVersion: typeof CATALOG_CANONICALIZATION_VERSION;
  readonly digest: CatalogInputDigest;
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

export interface ExerciseLifecycleSemanticInput {
  readonly exerciseId: ExerciseId;
  readonly targetLifecycle: ExerciseLifecycle;
  readonly reason: string;
}

export interface TaxonomyCreateSemanticInput {
  readonly dimensionId: TaxonomyDimensionId;
  readonly dimension: TaxonomyDimensionKey;
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
}

export interface TaxonomyLifecycleSemanticInput {
  readonly termId: TaxonomyTermId;
  readonly targetLifecycle: 'active' | 'archived';
  readonly reason: string;
}

export interface TaxonomyReplacementSemanticInput {
  readonly sourceTermId: TaxonomyTermId;
  readonly targetTermId: TaxonomyTermId;
  readonly reason: string;
}

interface ServerOwnedRepositoryCommand {
  readonly [serverOwnedCommandBrand]: true;
}

const deepFreeze = <Value>(value: Value): Value => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
};

const markServerOwned = <Command extends object>(
  command: Command,
): Command & ServerOwnedRepositoryCommand => {
  Object.defineProperty(command, serverOwnedCommandBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return deepFreeze(command) as Command & ServerOwnedRepositoryCommand;
};

export interface PublishExerciseRepositoryCommand extends ServerOwnedRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly semanticInput: PublicationSemanticInput;
  readonly contentHash: CatalogContentHash;
}

export interface ExerciseLifecycleRepositoryCommand extends ServerOwnedRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly exerciseId: ExerciseId;
  readonly targetLifecycle: ExerciseLifecycle;
  readonly reason: string;
}

export interface CreateTaxonomyTermRepositoryCommand extends ServerOwnedRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly dimensionId: TaxonomyDimensionId;
  readonly dimension: TaxonomyDimensionKey;
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
}

export interface TaxonomyTermLifecycleRepositoryCommand extends ServerOwnedRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly termId: TaxonomyTermId;
  readonly targetLifecycle: 'active' | 'archived';
  readonly reason: string;
}

export interface ReplaceTaxonomyTermRepositoryCommand extends ServerOwnedRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly sourceTermId: TaxonomyTermId;
  readonly targetTermId: TaxonomyTermId;
  readonly reason: string;
}

export interface ManifestIngestionRepositoryCommand extends ServerOwnedRepositoryCommand {
  readonly operation: CatalogOperationAttempt;
  readonly manifest: CatalogManifest;
}

export type CatalogCommandViolation =
  | 'invalid_command_shape'
  | 'invalid_operation_id'
  | 'unknown_field'
  | 'invalid_canonical_key'
  | 'invalid_exercise_id'
  | 'invalid_expected_current_revision'
  | 'invalid_publication_target'
  | 'invalid_display_name'
  | 'invalid_alias'
  | 'duplicate_alias'
  | 'invalid_description'
  | 'invalid_taxonomy_assignment'
  | 'duplicate_taxonomy_assignment'
  | 'invalid_change_reason'
  | 'invalid_provenance'
  | 'invalid_reference'
  | 'duplicate_reference'
  | 'invalid_lifecycle'
  | 'invalid_taxonomy_dimension'
  | 'invalid_taxonomy_term_id'
  | 'self_replacement'
  | 'invalid_manifest';

export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];
export type CatalogCommandViolations =
  NonEmptyReadonlyArray<CatalogCommandViolation>;

export type CatalogCommandFactoryResult<Command> =
  | { readonly status: 'ready'; readonly command: Command }
  | {
      readonly status: 'invalid_command';
      readonly violations: CatalogCommandViolations;
    };

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
      readonly violations: NonEmptyReadonlyArray<PublicationViolation>;
    }
  | OperationInputMismatchResult;

export type ExerciseLifecycleResult =
  | {
      readonly status: 'exercise_archived';
      readonly replayed: boolean;
      readonly exercise: ExerciseDetail & { readonly lifecycle: 'archived' };
    }
  | {
      readonly status: 'exercise_reactivated';
      readonly replayed: boolean;
      readonly exercise: ExerciseDetail & { readonly lifecycle: 'active' };
    }
  | { readonly status: 'exercise_not_found'; readonly exerciseId: ExerciseId }
  | OperationInputMismatchResult;

export type CreateTaxonomyTermResult =
  | {
      readonly status: 'taxonomy_term_created';
      readonly replayed: boolean;
      readonly term: TaxonomyTerm & { readonly lifecycle: 'active' };
    }
  | {
      readonly status: 'taxonomy_key_conflict';
      readonly dimensionId: TaxonomyDimensionId;
      readonly key: string;
    }
  | OperationInputMismatchResult;

export type TaxonomyTermLifecycleResult =
  | {
      readonly status: 'taxonomy_term_archived';
      readonly replayed: boolean;
      readonly term: TaxonomyTerm & { readonly lifecycle: 'archived' };
    }
  | {
      readonly status: 'taxonomy_term_reactivated';
      readonly replayed: boolean;
      readonly term: TaxonomyTerm & { readonly lifecycle: 'active' };
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
      readonly source: TaxonomyTerm & { readonly lifecycle: 'replaced' };
      readonly target: TaxonomyTerm & { readonly lifecycle: 'active' };
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

export type ManifestIngestionResult =
  | {
      readonly status: 'manifest_ingested';
      readonly replayed: boolean;
      readonly manifestId: string;
      readonly exerciseCount: number;
      readonly taxonomyTermCount: number;
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
  ingestManifest(
    command: ManifestIngestionRepositoryCommand,
  ): Promise<ManifestIngestionResult>;
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
      readonly violations: NonEmptyReadonlyArray<PublicationViolation>;
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
  const firstViolation = violations[0];
  return firstViolation === undefined
    ? { status: 'valid' }
    : {
        status: 'invalid_publication',
        violations: [firstViolation, ...violations.slice(1)],
      };
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

const normalizeText = (value: string): string => value.normalize('NFC').trim();

const canonicalUuid = (value: string): string => value.toLowerCase();

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
      exerciseId:
        input.target.exerciseId === null
          ? null
          : canonicalUuid(input.target.exerciseId),
    },
    expectedCurrentRevision: input.expectedCurrentRevision,
    content: {
      displayName: normalizeText(input.content.displayName),
      aliases: input.content.aliases.map(normalizeText).sort(compareBytes),
      description: normalizeText(input.content.description),
      taxonomy: {
        modalityTermId: canonicalUuid(input.content.taxonomy.modalityTermId),
        equipmentTermIds: input.content.taxonomy.equipmentTermIds
          .map(canonicalUuid)
          .sort(compareBytes),
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasOnlyKeys = (
  value: object,
  expectedKeys: readonly string[],
): boolean => {
  const expected = new Set(expectedKeys);
  return Object.keys(value).every((key) => expected.has(key));
};

const validateText = (value: unknown, maximum: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    trimmed.length <= maximum &&
    trimmed.normalize('NFC') === trimmed
    ? trimmed
    : null;
};

const invalidCommand = <Command>(
  violations: CatalogCommandViolation[],
): CatalogCommandFactoryResult<Command> => {
  const first = violations[0];
  if (first === undefined) {
    throw new TypeError('Invalid command requires at least one violation');
  }
  return {
    status: 'invalid_command',
    violations: [first, ...violations.slice(1)],
  };
};

const canonicalExerciseId = (value: string): ExerciseId =>
  exerciseIdSchema.parse(canonicalUuid(value));
const canonicalTaxonomyTermId = (value: string): TaxonomyTermId =>
  taxonomyTermIdSchema.parse(canonicalUuid(value));
const canonicalTaxonomyDimensionId = (value: string): TaxonomyDimensionId =>
  taxonomyDimensionIdSchema.parse(canonicalUuid(value));

const referenceIsValid = (
  reference: unknown,
): reference is PublicationReferenceInput => {
  if (
    !isRecord(reference) ||
    !hasOnlyKeys(reference, ['kind', 'locator', 'purpose', 'assessment']) ||
    typeof reference.kind !== 'string' ||
    typeof reference.locator !== 'string' ||
    typeof reference.purpose !== 'string' ||
    typeof reference.assessment !== 'string' ||
    !['provenance', 'evidence_candidate'].includes(reference.purpose) ||
    reference.assessment !== 'unassessed'
  ) {
    return false;
  }
  if (reference.kind === 'doi') {
    return (
      reference.locator.length >= 7 &&
      reference.locator.length <= 255 &&
      /^10\.\d{4,9}\/\S+$/i.test(reference.locator)
    );
  }
  if (reference.kind !== 'https_url' || reference.locator.length > 2_048) {
    return false;
  }
  try {
    const url = new URL(reference.locator);
    return (
      url.protocol === 'https:' && url.username === '' && url.password === ''
    );
  } catch {
    return false;
  }
};

const hasPublicationRuntimeShape = (
  input: unknown,
): input is PublicationSemanticInput => {
  if (!isRecord(input)) return false;
  const target = input.target;
  const content = input.content;
  if (!isRecord(target) || !isRecord(content)) return false;
  const taxonomy = content.taxonomy;
  const provenance = content.provenance;
  const references = content.references;
  if (
    !isRecord(taxonomy) ||
    !isRecord(provenance) ||
    !Array.isArray(content.aliases) ||
    !Array.isArray(taxonomy.equipmentTermIds) ||
    !Array.isArray(references)
  ) {
    return false;
  }
  const primary = provenance.primaryProvenanceReference;
  return (
    typeof target.canonicalKey === 'string' &&
    (target.exerciseId === null || typeof target.exerciseId === 'string') &&
    (input.expectedCurrentRevision === null ||
      typeof input.expectedCurrentRevision === 'number') &&
    typeof content.displayName === 'string' &&
    content.aliases.every((alias) => typeof alias === 'string') &&
    typeof content.description === 'string' &&
    typeof taxonomy.modalityTermId === 'string' &&
    taxonomy.equipmentTermIds.every((termId) => typeof termId === 'string') &&
    typeof provenance.originKind === 'string' &&
    typeof provenance.changeReason === 'string' &&
    (primary === null ||
      (isRecord(primary) &&
        typeof primary.kind === 'string' &&
        typeof primary.locator === 'string')) &&
    references.every(
      (reference) =>
        isRecord(reference) &&
        typeof reference.kind === 'string' &&
        typeof reference.locator === 'string' &&
        typeof reference.purpose === 'string' &&
        typeof reference.assessment === 'string',
    )
  );
};

const validatePublicationSemanticInput = (
  input: unknown,
):
  | { readonly status: 'valid'; readonly value: PublicationSemanticInput }
  | {
      readonly status: 'invalid';
      readonly violations: CatalogCommandViolation[];
    } => {
  const violations: CatalogCommandViolation[] = [];
  if (!hasPublicationRuntimeShape(input)) {
    return { status: 'invalid', violations: ['invalid_command_shape'] };
  }
  if (
    !hasOnlyKeys(input, ['target', 'expectedCurrentRevision', 'content']) ||
    !hasOnlyKeys(input.target, ['canonicalKey', 'exerciseId']) ||
    !hasOnlyKeys(input.content, [
      'displayName',
      'aliases',
      'description',
      'taxonomy',
      'provenance',
      'references',
    ]) ||
    !hasOnlyKeys(input.content.taxonomy, [
      'modalityTermId',
      'equipmentTermIds',
    ]) ||
    !hasOnlyKeys(input.content.provenance, [
      'originKind',
      'changeReason',
      'primaryProvenanceReference',
    ])
  ) {
    violations.push('unknown_field');
  }

  if (!canonicalCatalogKeySchema.safeParse(input.target.canonicalKey).success) {
    violations.push('invalid_canonical_key');
  }
  if (
    input.target.exerciseId !== null &&
    !exerciseIdSchema.safeParse(input.target.exerciseId).success
  ) {
    violations.push('invalid_exercise_id');
  }
  if (
    input.expectedCurrentRevision !== null &&
    (!Number.isInteger(input.expectedCurrentRevision) ||
      input.expectedCurrentRevision <= 0)
  ) {
    violations.push('invalid_expected_current_revision');
  }
  if (
    (input.target.exerciseId === null) !==
    (input.expectedCurrentRevision === null)
  ) {
    violations.push('invalid_publication_target');
  }

  const displayName = validateText(input.content.displayName, 120);
  const description = validateText(input.content.description, 1_000);
  const aliases = input.content.aliases.map((alias) =>
    validateText(alias, 120),
  );
  const changeReason = validateText(input.content.provenance.changeReason, 500);
  if (displayName === null) violations.push('invalid_display_name');
  if (description === null) violations.push('invalid_description');
  if (
    input.content.aliases.length > 20 ||
    aliases.some((alias) => alias === null)
  ) {
    violations.push('invalid_alias');
  }
  const normalizedAliases = aliases.filter(
    (alias): alias is string => alias !== null,
  );
  if (
    new Set(normalizedAliases.map((alias) => alias.toLocaleLowerCase('en-US')))
      .size !== normalizedAliases.length
  ) {
    violations.push('duplicate_alias');
  }
  if (changeReason === null) violations.push('invalid_change_reason');

  const modalityValid = taxonomyTermIdSchema.safeParse(
    input.content.taxonomy.modalityTermId,
  ).success;
  const equipmentValid =
    input.content.taxonomy.equipmentTermIds.length <= 32 &&
    input.content.taxonomy.equipmentTermIds.every(
      (termId) => taxonomyTermIdSchema.safeParse(termId).success,
    );
  if (!modalityValid || !equipmentValid) {
    violations.push('invalid_taxonomy_assignment');
  }
  const canonicalEquipmentIds =
    input.content.taxonomy.equipmentTermIds.map(canonicalUuid);
  if (new Set(canonicalEquipmentIds).size !== canonicalEquipmentIds.length) {
    violations.push('duplicate_taxonomy_assignment');
  }

  const referencesValid =
    input.content.references.length <= 20 &&
    input.content.references.every(referenceIsValid);
  if (!referencesValid) violations.push('invalid_reference');
  const validReferences = input.content.references.filter(referenceIsValid);
  const referenceKeys = validReferences.map(
    (reference) =>
      `${reference.kind}\u0000${canonicalLocator(reference)}\u0000${reference.purpose}`,
  );
  if (new Set(referenceKeys).size !== referenceKeys.length) {
    violations.push('duplicate_reference');
  }

  const provenance = input.content.provenance;
  const primary = provenance.primaryProvenanceReference;
  const primaryValid =
    primary === null ||
    (hasOnlyKeys(primary, ['kind', 'locator']) &&
      referenceIsValid({
        ...primary,
        purpose: 'provenance',
        assessment: 'unassessed',
      }));
  const provenanceReferences = validReferences.filter(
    (reference) => reference.purpose === 'provenance',
  );
  if (
    !primaryValid ||
    (provenance.originKind === 'internally_curated' &&
      (primary !== null || provenanceReferences.length !== 0)) ||
    (provenance.originKind === 'derived_from_public_locator' &&
      (primary === null ||
        provenanceReferences.length !== 1 ||
        provenanceReferences[0]?.kind !== primary.kind ||
        canonicalLocator(provenanceReferences[0]) !==
          canonicalLocator(primary))) ||
    !['internally_curated', 'derived_from_public_locator'].includes(
      provenance.originKind,
    )
  ) {
    violations.push('invalid_provenance');
  }

  if (violations.length > 0) {
    return { status: 'invalid', violations };
  }

  const normalizedPrimary =
    primary === null
      ? null
      : { kind: primary.kind, locator: canonicalLocator(primary) };
  return {
    status: 'valid',
    value: {
      target: {
        canonicalKey: input.target.canonicalKey,
        exerciseId:
          input.target.exerciseId === null
            ? null
            : canonicalExerciseId(input.target.exerciseId),
      },
      expectedCurrentRevision: input.expectedCurrentRevision,
      content: {
        displayName: displayName as string,
        aliases: normalizedAliases,
        description: description as string,
        taxonomy: {
          modalityTermId: canonicalTaxonomyTermId(
            input.content.taxonomy.modalityTermId,
          ),
          equipmentTermIds: input.content.taxonomy.equipmentTermIds.map(
            canonicalTaxonomyTermId,
          ),
        },
        provenance: {
          originKind: provenance.originKind,
          changeReason: changeReason as string,
          primaryProvenanceReference: normalizedPrimary,
        },
        references: validReferences.map((reference) => ({
          ...reference,
          locator: canonicalLocator(reference),
        })),
      },
    },
  };
};

const createOperationAttempt = (
  key: CatalogOperationKey,
  digest: CatalogInputDigest,
): CatalogOperationAttempt =>
  Object.freeze({
    [catalogOperationAttemptBrand]: true as const,
    key,
    canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
    digest,
  });

export const createPublishExerciseCommand = (
  input: unknown,
): CatalogCommandFactoryResult<PublishExerciseRepositoryCommand> => {
  if (!isRecord(input)) {
    return invalidCommand(['invalid_command_shape']);
  }
  const validation = validatePublicationSemanticInput(input.semanticInput);
  const violations =
    validation.status === 'invalid' ? [...validation.violations] : [];
  if (!hasOnlyKeys(input, ['operationId', 'semanticInput'])) {
    violations.unshift('unknown_field');
  }
  if (
    typeof input.operationId !== 'string' ||
    !operationUuidPattern.test(input.operationId)
  ) {
    violations.unshift('invalid_operation_id');
  }
  if (violations.length > 0 || validation.status === 'invalid') {
    return invalidCommand(violations);
  }
  const semanticInput = deepFreeze(validation.value);
  return {
    status: 'ready',
    command: markServerOwned({
      operation: createOperationAttempt(
        createPublishOperationKey(input.operationId as string),
        hashPublicationOperation(semanticInput),
      ),
      semanticInput,
      contentHash: hashPublicationContent(semanticInput),
    }),
  };
};

export const canonicalizeExerciseLifecycleInput = (
  input: ExerciseLifecycleSemanticInput,
): string =>
  JSON.stringify({
    canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
    exerciseId: canonicalUuid(input.exerciseId),
    targetLifecycle: input.targetLifecycle,
    reason: normalizeText(input.reason),
  });

export const canonicalizeTaxonomyCreateInput = (
  input: TaxonomyCreateSemanticInput,
): string =>
  JSON.stringify({
    canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
    dimensionId: canonicalUuid(input.dimensionId),
    dimension: input.dimension,
    key: input.key,
    label: normalizeText(input.label),
    meaning: normalizeText(input.meaning),
  });

export const canonicalizeTaxonomyLifecycleInput = (
  input: TaxonomyLifecycleSemanticInput,
): string =>
  JSON.stringify({
    canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
    termId: canonicalUuid(input.termId),
    targetLifecycle: input.targetLifecycle,
    reason: normalizeText(input.reason),
  });

export const canonicalizeTaxonomyReplacementInput = (
  input: TaxonomyReplacementSemanticInput,
): string =>
  JSON.stringify({
    canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
    sourceTermId: canonicalUuid(input.sourceTermId),
    targetTermId: canonicalUuid(input.targetTermId),
    reason: normalizeText(input.reason),
  });

const hashCanonicalInput = (canonicalInput: string): CatalogInputDigest =>
  sha256(canonicalInput) as CatalogInputDigest;

export const hashExerciseLifecycleOperation = (
  input: ExerciseLifecycleSemanticInput,
): CatalogInputDigest =>
  hashCanonicalInput(canonicalizeExerciseLifecycleInput(input));
export const hashTaxonomyCreateOperation = (
  input: TaxonomyCreateSemanticInput,
): CatalogInputDigest =>
  hashCanonicalInput(canonicalizeTaxonomyCreateInput(input));
export const hashTaxonomyLifecycleOperation = (
  input: TaxonomyLifecycleSemanticInput,
): CatalogInputDigest =>
  hashCanonicalInput(canonicalizeTaxonomyLifecycleInput(input));
export const hashTaxonomyReplacementOperation = (
  input: TaxonomyReplacementSemanticInput,
): CatalogInputDigest =>
  hashCanonicalInput(canonicalizeTaxonomyReplacementInput(input));

const validateOperationId = (
  operationId: unknown,
  violations: CatalogCommandViolation[],
): void => {
  if (
    typeof operationId !== 'string' ||
    !operationUuidPattern.test(operationId)
  ) {
    violations.push('invalid_operation_id');
  }
};

export const createExerciseLifecycleCommand = (
  input: unknown,
): CatalogCommandFactoryResult<ExerciseLifecycleRepositoryCommand> => {
  if (!isRecord(input)) {
    return invalidCommand(['invalid_command_shape']);
  }
  const violations: CatalogCommandViolation[] = [];
  validateOperationId(input.operationId, violations);
  if (
    !hasOnlyKeys(input, [
      'operationId',
      'exerciseId',
      'targetLifecycle',
      'reason',
    ])
  )
    violations.push('unknown_field');
  const exerciseId = exerciseIdSchema.safeParse(input.exerciseId);
  const targetLifecycle = exerciseLifecycleSchema.safeParse(
    input.targetLifecycle,
  );
  if (!exerciseId.success) violations.push('invalid_exercise_id');
  if (!targetLifecycle.success) violations.push('invalid_lifecycle');
  const reason = validateText(input.reason, 500);
  if (reason === null) violations.push('invalid_change_reason');
  if (violations.length > 0) return invalidCommand(violations);
  if (!exerciseId.success || !targetLifecycle.success || reason === null) {
    return invalidCommand(['invalid_command_shape']);
  }
  const semanticInput: ExerciseLifecycleSemanticInput = {
    exerciseId: canonicalExerciseId(exerciseId.data),
    targetLifecycle: targetLifecycle.data,
    reason,
  };
  return {
    status: 'ready',
    command: markServerOwned({
      operation: createOperationAttempt(
        createExerciseLifecycleOperationKey(input.operationId as string),
        hashExerciseLifecycleOperation(semanticInput),
      ),
      ...semanticInput,
    }),
  };
};

export const createTaxonomyTermCommand = (
  input: unknown,
): CatalogCommandFactoryResult<CreateTaxonomyTermRepositoryCommand> => {
  if (!isRecord(input)) {
    return invalidCommand(['invalid_command_shape']);
  }
  const violations: CatalogCommandViolation[] = [];
  validateOperationId(input.operationId, violations);
  if (
    !hasOnlyKeys(input, [
      'operationId',
      'dimensionId',
      'dimension',
      'key',
      'label',
      'meaning',
    ])
  )
    violations.push('unknown_field');
  const dimensionId = taxonomyDimensionIdSchema.safeParse(input.dimensionId);
  const dimension = taxonomyDimensionKeySchema.safeParse(input.dimension);
  const key = canonicalCatalogKeySchema.safeParse(input.key);
  if (!dimensionId.success || !dimension.success)
    violations.push('invalid_taxonomy_dimension');
  if (!key.success) violations.push('invalid_canonical_key');
  const label = validateText(input.label, 120);
  const meaning = validateText(input.meaning, 1_000);
  if (label === null) violations.push('invalid_display_name');
  if (meaning === null) violations.push('invalid_description');
  if (violations.length > 0) return invalidCommand(violations);
  if (
    !dimensionId.success ||
    !dimension.success ||
    !key.success ||
    label === null ||
    meaning === null
  ) {
    return invalidCommand(['invalid_command_shape']);
  }
  const semanticInput: TaxonomyCreateSemanticInput = {
    dimensionId: canonicalTaxonomyDimensionId(dimensionId.data),
    dimension: dimension.data,
    key: key.data,
    label,
    meaning,
  };
  return {
    status: 'ready',
    command: markServerOwned({
      operation: createOperationAttempt(
        createTaxonomyCreateOperationKey(input.operationId as string),
        hashTaxonomyCreateOperation(semanticInput),
      ),
      ...semanticInput,
    }),
  };
};

export const createTaxonomyTermLifecycleCommand = (
  input: unknown,
): CatalogCommandFactoryResult<TaxonomyTermLifecycleRepositoryCommand> => {
  if (!isRecord(input)) {
    return invalidCommand(['invalid_command_shape']);
  }
  const violations: CatalogCommandViolation[] = [];
  validateOperationId(input.operationId, violations);
  if (
    !hasOnlyKeys(input, ['operationId', 'termId', 'targetLifecycle', 'reason'])
  )
    violations.push('unknown_field');
  const termId = taxonomyTermIdSchema.safeParse(input.termId);
  const targetLifecycle =
    input.targetLifecycle === 'active' || input.targetLifecycle === 'archived'
      ? input.targetLifecycle
      : null;
  if (!termId.success) violations.push('invalid_taxonomy_term_id');
  if (targetLifecycle === null) violations.push('invalid_lifecycle');
  const reason = validateText(input.reason, 500);
  if (reason === null) violations.push('invalid_change_reason');
  if (violations.length > 0) return invalidCommand(violations);
  if (!termId.success || targetLifecycle === null || reason === null) {
    return invalidCommand(['invalid_command_shape']);
  }
  const semanticInput: TaxonomyLifecycleSemanticInput = {
    termId: canonicalTaxonomyTermId(termId.data),
    targetLifecycle,
    reason,
  };
  return {
    status: 'ready',
    command: markServerOwned({
      operation: createOperationAttempt(
        createTaxonomyLifecycleOperationKey(input.operationId as string),
        hashTaxonomyLifecycleOperation(semanticInput),
      ),
      ...semanticInput,
    }),
  };
};

export const createTaxonomyReplacementCommand = (
  input: unknown,
): CatalogCommandFactoryResult<ReplaceTaxonomyTermRepositoryCommand> => {
  if (!isRecord(input)) {
    return invalidCommand(['invalid_command_shape']);
  }
  const violations: CatalogCommandViolation[] = [];
  validateOperationId(input.operationId, violations);
  if (
    !hasOnlyKeys(input, [
      'operationId',
      'sourceTermId',
      'targetTermId',
      'reason',
    ])
  )
    violations.push('unknown_field');
  const sourceTermId = taxonomyTermIdSchema.safeParse(input.sourceTermId);
  const targetTermId = taxonomyTermIdSchema.safeParse(input.targetTermId);
  if (!sourceTermId.success || !targetTermId.success)
    violations.push('invalid_taxonomy_term_id');
  if (
    sourceTermId.success &&
    targetTermId.success &&
    canonicalUuid(sourceTermId.data) === canonicalUuid(targetTermId.data)
  )
    violations.push('self_replacement');
  const reason = validateText(input.reason, 500);
  if (reason === null) violations.push('invalid_change_reason');
  if (violations.length > 0) return invalidCommand(violations);
  if (!sourceTermId.success || !targetTermId.success || reason === null) {
    return invalidCommand(['invalid_command_shape']);
  }
  const semanticInput: TaxonomyReplacementSemanticInput = {
    sourceTermId: canonicalTaxonomyTermId(sourceTermId.data),
    targetTermId: canonicalTaxonomyTermId(targetTermId.data),
    reason,
  };
  return {
    status: 'ready',
    command: markServerOwned({
      operation: createOperationAttempt(
        createTaxonomyReplaceOperationKey(input.operationId as string),
        hashTaxonomyReplacementOperation(semanticInput),
      ),
      ...semanticInput,
    }),
  };
};

const canonicalManifestReference = (
  reference: CatalogManifest['exercises'][number]['references'][number],
) => ({
  key: reference.key,
  kind: reference.kind,
  locator: canonicalLocator(reference),
  purpose: reference.purpose,
  assessment: reference.assessment,
});

export const canonicalizeManifestIngestionInput = (
  manifest: CatalogManifest,
): string =>
  JSON.stringify({
    canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
    manifest: {
      schemaVersion: manifest.schemaVersion,
      manifestId: manifest.manifestId,
      taxonomy: {
        modality: manifest.taxonomy.modality
          .map((term) => ({
            key: term.key,
            label: normalizeText(term.label),
            meaning: normalizeText(term.meaning),
          }))
          .sort((left, right) => compareBytes(left.key, right.key)),
        equipment: manifest.taxonomy.equipment
          .map((term) => ({
            key: term.key,
            label: normalizeText(term.label),
            meaning: normalizeText(term.meaning),
          }))
          .sort((left, right) => compareBytes(left.key, right.key)),
      },
      exercises: manifest.exercises
        .map((exercise) => ({
          canonicalKey: exercise.canonicalKey,
          displayName: normalizeText(exercise.displayName),
          aliases: exercise.aliases.map(normalizeText).sort(compareBytes),
          description: normalizeText(exercise.description),
          modalityKey: exercise.modalityKey,
          equipmentKeys: [...exercise.equipmentKeys].sort(compareBytes),
          provenance: {
            originKind: exercise.provenance.originKind,
            changeReason: normalizeText(exercise.provenance.changeReason),
            primaryProvenanceReferenceKey:
              exercise.provenance.primaryProvenanceReferenceKey,
          },
          references: exercise.references
            .map(canonicalManifestReference)
            .sort((left, right) =>
              compareBytes(
                `${left.kind}\u0000${left.locator}\u0000${left.purpose}\u0000${left.key}`,
                `${right.kind}\u0000${right.locator}\u0000${right.purpose}\u0000${right.key}`,
              ),
            ),
        }))
        .sort((left, right) =>
          compareBytes(left.canonicalKey, right.canonicalKey),
        ),
    },
  });

export const hashManifestIngestionOperation = (
  manifest: CatalogManifest,
): CatalogInputDigest =>
  hashCanonicalInput(canonicalizeManifestIngestionInput(manifest));

export const createManifestIngestionCommand = (
  input: unknown,
): CatalogCommandFactoryResult<ManifestIngestionRepositoryCommand> => {
  if (!isRecord(input)) {
    return invalidCommand(['invalid_command_shape']);
  }
  const violations: CatalogCommandViolation[] = [];
  validateOperationId(input.operationId, violations);
  if (!hasOnlyKeys(input, ['operationId', 'manifest']))
    violations.push('unknown_field');
  const parsed = catalogManifestSchema.safeParse(input.manifest);
  if (!parsed.success) violations.push('invalid_manifest');
  if (violations.length > 0 || !parsed.success)
    return invalidCommand(violations);
  const manifest = deepFreeze(parsed.data);
  return {
    status: 'ready',
    command: markServerOwned({
      operation: createOperationAttempt(
        createManifestIngestOperationKey(input.operationId as string),
        hashManifestIngestionOperation(manifest),
      ),
      manifest,
    }),
  };
};

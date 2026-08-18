import {
  CATALOG_CANONICALIZATION_VERSION,
  hashManifestIngestionOperation,
} from '@fitness-os/domain';
import {
  catalogManifestSchema,
  type CatalogManifest,
} from '@fitness-os/schemas';

const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const safeManifestPathPattern = /^[a-z0-9][a-z0-9._/-]*$/;

export type CatalogArtifactVerificationErrorCode =
  | 'ANCESTRY_MISMATCH'
  | 'CANDIDATE_MISMATCH'
  | 'DIRTY_CHECKOUT'
  | 'INVALID_MANIFEST'
  | 'INVALID_REVIEW'
  | 'MANIFEST_MISMATCH'
  | 'REVIEW_MISMATCH';

export class CatalogArtifactVerificationError extends Error {
  override readonly name = 'CatalogArtifactVerificationError';

  constructor(readonly code: CatalogArtifactVerificationErrorCode) {
    super('Catalog artifact verification failed.');
  }
}

export interface CatalogManifestCounts {
  readonly modalityTerms: number;
  readonly equipmentTerms: number;
  readonly exercises: number;
  readonly references: number;
}

export interface CatalogManifestReview {
  readonly recordVersion: 'catalog-manifest-review.v1';
  readonly disposition: 'PASS';
  readonly reviewerRole: 'independent-agent-90';
  readonly manifestPath: string;
  readonly schemaVersion: 'catalog-manifest.v1';
  readonly canonicalizationVersion: typeof CATALOG_CANONICALIZATION_VERSION;
  readonly sourceCommit: string;
  readonly canonicalDigest: string;
  readonly counts: CatalogManifestCounts;
  readonly findings: {
    readonly blocker: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
  };
}

export interface CatalogGitInspection {
  isClean(): Promise<boolean>;
  resolveHead(): Promise<string>;
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  readTextAtCommit(commit: string, path: string): Promise<string | null>;
}

export interface CatalogArtifactInput {
  readonly candidateCommit: string;
  readonly manifestPath: string;
  readonly manifestSource: string;
  readonly reviewSource: string;
}

export interface VerifiedCatalogArtifact {
  readonly manifest: CatalogManifest;
  readonly review: CatalogManifestReview;
  readonly digest: string;
  readonly counts: CatalogManifestCounts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseReview(source: string): CatalogManifestReview {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CatalogArtifactVerificationError('INVALID_REVIEW');
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'recordVersion',
      'disposition',
      'reviewerRole',
      'manifestPath',
      'schemaVersion',
      'canonicalizationVersion',
      'sourceCommit',
      'canonicalDigest',
      'counts',
      'findings',
    ]) ||
    value.recordVersion !== 'catalog-manifest-review.v1' ||
    value.disposition !== 'PASS' ||
    value.reviewerRole !== 'independent-agent-90' ||
    typeof value.manifestPath !== 'string' ||
    !safeManifestPathPattern.test(value.manifestPath) ||
    value.manifestPath.includes('..') ||
    value.schemaVersion !== 'catalog-manifest.v1' ||
    value.canonicalizationVersion !== CATALOG_CANONICALIZATION_VERSION ||
    typeof value.sourceCommit !== 'string' ||
    !shaPattern.test(value.sourceCommit) ||
    typeof value.canonicalDigest !== 'string' ||
    !digestPattern.test(value.canonicalDigest) ||
    !isRecord(value.counts) ||
    !hasExactKeys(value.counts, [
      'modalityTerms',
      'equipmentTerms',
      'exercises',
      'references',
    ]) ||
    !isCount(value.counts.modalityTerms) ||
    !isCount(value.counts.equipmentTerms) ||
    !isCount(value.counts.exercises) ||
    !isCount(value.counts.references) ||
    !isRecord(value.findings) ||
    !hasExactKeys(value.findings, ['blocker', 'high', 'medium', 'low']) ||
    !isCount(value.findings.blocker) ||
    !isCount(value.findings.high) ||
    !isCount(value.findings.medium) ||
    !isCount(value.findings.low) ||
    value.findings.blocker !== 0 ||
    value.findings.high !== 0
  ) {
    throw new CatalogArtifactVerificationError('INVALID_REVIEW');
  }
  return value as unknown as CatalogManifestReview;
}

function parseManifest(source: string): CatalogManifest {
  try {
    return catalogManifestSchema.parse(JSON.parse(source));
  } catch {
    throw new CatalogArtifactVerificationError('INVALID_MANIFEST');
  }
}

function countManifest(manifest: CatalogManifest): CatalogManifestCounts {
  return {
    modalityTerms: manifest.taxonomy.modality.length,
    equipmentTerms: manifest.taxonomy.equipment.length,
    exercises: manifest.exercises.length,
    references: manifest.exercises.reduce(
      (total, exercise) => total + exercise.references.length,
      0,
    ),
  };
}

function sameCounts(
  left: CatalogManifestCounts,
  right: CatalogManifestCounts,
): boolean {
  return (
    left.modalityTerms === right.modalityTerms &&
    left.equipmentTerms === right.equipmentTerms &&
    left.exercises === right.exercises &&
    left.references === right.references
  );
}

export async function verifyCatalogArtifact(
  input: CatalogArtifactInput,
  git: CatalogGitInspection,
): Promise<VerifiedCatalogArtifact> {
  if (!shaPattern.test(input.candidateCommit)) {
    throw new CatalogArtifactVerificationError('CANDIDATE_MISMATCH');
  }
  if (!(await git.isClean())) {
    throw new CatalogArtifactVerificationError('DIRTY_CHECKOUT');
  }
  if ((await git.resolveHead()) !== input.candidateCommit) {
    throw new CatalogArtifactVerificationError('CANDIDATE_MISMATCH');
  }

  const review = parseReview(input.reviewSource);
  if (review.manifestPath !== input.manifestPath) {
    throw new CatalogArtifactVerificationError('REVIEW_MISMATCH');
  }
  if (!(await git.isAncestor(review.sourceCommit, input.candidateCommit))) {
    throw new CatalogArtifactVerificationError('ANCESTRY_MISMATCH');
  }

  const reviewedSource = await git.readTextAtCommit(
    review.sourceCommit,
    review.manifestPath,
  );
  if (reviewedSource === null || reviewedSource !== input.manifestSource) {
    throw new CatalogArtifactVerificationError('MANIFEST_MISMATCH');
  }

  const manifest = parseManifest(input.manifestSource);
  const digest = hashManifestIngestionOperation(manifest);
  const counts = countManifest(manifest);
  if (
    manifest.schemaVersion !== review.schemaVersion ||
    digest !== review.canonicalDigest ||
    !sameCounts(counts, review.counts)
  ) {
    throw new CatalogArtifactVerificationError('REVIEW_MISMATCH');
  }

  return { manifest, review, digest, counts };
}

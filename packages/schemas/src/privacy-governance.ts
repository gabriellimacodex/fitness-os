import { z } from 'zod';

/**
 * PRD 21 Option A foundation contracts.
 * Canonical profiles are exhaustive over every ledger operation kind.
 * Set-like paths are declared beside typed inputs and sorted UTF-8 bytewise
 * before digesting; object insertion order never contributes to identity.
 */

export const privacyCanonicalizationVersionSchema = z.literal(
  'privacy-governance.canonical.v1',
);
export type PrivacyCanonicalizationVersion = z.infer<
  typeof privacyCanonicalizationVersionSchema
>;

export const privacyOperationKindSchema = z.enum([
  'data_use_evaluation',
  'authorization_evidence_append',
  'authorization_withdrawal',
  'subject_request_transition',
  'processor_step',
  'retention_preview',
  'retention_execution',
  'governance_lifecycle',
]);
export type PrivacyOperationKind = z.infer<typeof privacyOperationKindSchema>;

export const PRIVACY_OPERATION_KINDS = privacyOperationKindSchema.options;

export const privacyLifecycleProofIdSchema = z
  .uuidv4()
  .brand<'PrivacyLifecycleProofId'>();
export type PrivacyLifecycleProofId = z.infer<
  typeof privacyLifecycleProofIdSchema
>;

export const privacyRetentionExceptionIdSchema = z
  .uuidv4()
  .brand<'PrivacyRetentionExceptionId'>();
export type PrivacyRetentionExceptionId = z.infer<
  typeof privacyRetentionExceptionIdSchema
>;

/** JSON Pointer paths into a semantic operation input (RFC 6901 subset). */
export const privacyCanonicalSetPathSchema = z
  .string()
  .regex(/^(\/[A-Za-z][A-Za-z0-9_]*)+$/);
export type PrivacyCanonicalSetPath = z.infer<
  typeof privacyCanonicalSetPathSchema
>;

export const privacyCanonicalProfileSchema = z
  .object({
    operationKind: privacyOperationKindSchema,
    canonicalizationVersion: privacyCanonicalizationVersionSchema,
    setPaths: z.array(privacyCanonicalSetPathSchema).max(32),
  })
  .strict();
export type PrivacyCanonicalProfile = z.infer<
  typeof privacyCanonicalProfileSchema
>;

const profile = (
  operationKind: PrivacyOperationKind,
  setPaths: readonly PrivacyCanonicalSetPath[],
): PrivacyCanonicalProfile =>
  privacyCanonicalProfileSchema.parse({
    operationKind,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    setPaths: [...setPaths],
  });

/**
 * Exhaustive registry: every PrivacyOperationKind has exactly one profile.
 * Adding a set-like field to a typed semantic input requires updating setPaths
 * in the same contract change.
 */
export const PRIVACY_CANONICAL_PROFILES = {
  data_use_evaluation: profile('data_use_evaluation', []),
  authorization_evidence_append: profile('authorization_evidence_append', []),
  authorization_withdrawal: profile('authorization_withdrawal', []),
  subject_request_transition: profile('subject_request_transition', []),
  processor_step: profile('processor_step', []),
  retention_preview: profile('retention_preview', ['/approvedExceptionIds']),
  retention_execution: profile('retention_execution', [
    '/approvedExceptionIds',
  ]),
  governance_lifecycle: profile('governance_lifecycle', [
    '/approvedExceptionIds',
  ]),
} as const satisfies Record<PrivacyOperationKind, PrivacyCanonicalProfile>;

export const getPrivacyCanonicalProfile = (
  operationKind: PrivacyOperationKind,
): PrivacyCanonicalProfile => PRIVACY_CANONICAL_PROFILES[operationKind];

export const privacyApprovedExceptionIdsSchema = z
  .array(privacyRetentionExceptionIdSchema)
  .max(64);

/**
 * Retention-preview semantic fragment frozen for Option A set canonicalization.
 * Broader preview pins land in a later contract slice.
 */
export const retentionPreviewCanonicalInputSchema = z
  .object({
    approvedExceptionIds: privacyApprovedExceptionIdsSchema,
  })
  .strict();
export type RetentionPreviewCanonicalInput = z.infer<
  typeof retentionPreviewCanonicalInputSchema
>;

const utf8Encoder = new TextEncoder();

export const compareUtf8Bytewise = (left: string, right: string): number => {
  const a = utf8Encoder.encode(left);
  const b = utf8Encoder.encode(right);
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index += 1) {
    const delta = a[index]! - b[index]!;
    if (delta !== 0) {
      return delta;
    }
  }
  return a.length - b.length;
};

/** Stable order for declared set-like identifier arrays before hashing. */
export const sortPrivacySetIdentifiers = <T extends string>(
  values: readonly T[],
): T[] => [...values].sort(compareUtf8Bytewise);

export const canonicalizeRetentionPreviewApprovedExceptionIds = (
  input: RetentionPreviewCanonicalInput,
): RetentionPreviewCanonicalInput => ({
  approvedExceptionIds: sortPrivacySetIdentifiers(input.approvedExceptionIds),
});

export const governanceLifecycleOutcomeSchema = z.enum([
  'completed',
  'partially_failed',
  'denied',
]);
export type GovernanceLifecycleOutcome = z.infer<
  typeof governanceLifecycleOutcomeSchema
>;

/**
 * Public and ledger lifecycle results share one proof locator rule (Option A):
 * completed and partially_failed require proofId; denied forbids it.
 */
export const governanceLifecycleResultSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.literal('completed'),
      proofId: privacyLifecycleProofIdSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('partially_failed'),
      proofId: privacyLifecycleProofIdSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('denied'),
    })
    .strict(),
]);
export type GovernanceLifecycleResult = z.infer<
  typeof governanceLifecycleResultSchema
>;

export const privacyPolicyPackageIdSchema = z
  .uuidv4()
  .brand<'PrivacyPolicyPackageId'>();
export type PrivacyPolicyPackageId = z.infer<
  typeof privacyPolicyPackageIdSchema
>;

export const privacyPolicyVersionIdSchema = z
  .uuidv4()
  .brand<'PrivacyPolicyVersionId'>();
export type PrivacyPolicyVersionId = z.infer<
  typeof privacyPolicyVersionIdSchema
>;

export const privacyEvidenceIdSchema = z.uuidv4().brand<'PrivacyEvidenceId'>();
export type PrivacyEvidenceId = z.infer<typeof privacyEvidenceIdSchema>;

export const privacyPurposeIdSchema = z.uuidv4().brand<'PrivacyPurposeId'>();
export type PrivacyPurposeId = z.infer<typeof privacyPurposeIdSchema>;

/**
 * Reference-only policy package metadata. Carries no legal copy, notice text,
 * or participant answers — those remain outside PRD 21 executable contracts.
 */
export const privacyPolicyPackageReferenceSchema = z
  .object({
    packageId: privacyPolicyPackageIdSchema,
    versionId: privacyPolicyVersionIdSchema,
    canonicalizationVersion: privacyCanonicalizationVersionSchema,
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    synthetic: z.boolean(),
  })
  .strict();
export type PrivacyPolicyPackageReference = z.infer<
  typeof privacyPolicyPackageReferenceSchema
>;

/**
 * Append-only authorization evidence locator. Decision payload is opaque and
 * integrity-bound; raw consent answers are not represented here.
 */
export const privacyEvidenceReferenceSchema = z
  .object({
    evidenceId: privacyEvidenceIdSchema,
    purposeId: privacyPurposeIdSchema,
    policyVersionId: privacyPolicyVersionIdSchema,
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    recordedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  })
  .strict();
export type PrivacyEvidenceReference = z.infer<
  typeof privacyEvidenceReferenceSchema
>;

const privacySha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const privacyTrustedUtcMsSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

export const privacyWithdrawalIdSchema = z
  .uuidv4()
  .brand<'PrivacyWithdrawalId'>();
export type PrivacyWithdrawalId = z.infer<typeof privacyWithdrawalIdSchema>;

export const privacyOperationIdSchema = z
  .uuidv4()
  .brand<'PrivacyOperationId'>();
export type PrivacyOperationId = z.infer<typeof privacyOperationIdSchema>;

export const privacyCorrelationIdSchema = z
  .uuidv4()
  .brand<'PrivacyCorrelationId'>();
export type PrivacyCorrelationId = z.infer<typeof privacyCorrelationIdSchema>;

export const privacySubjectScopeIdSchema = z
  .uuidv4()
  .brand<'PrivacySubjectScopeId'>();
export type PrivacySubjectScopeId = z.infer<typeof privacySubjectScopeIdSchema>;

export const privacyPurposeVersionIdSchema = z
  .uuidv4()
  .brand<'PrivacyPurposeVersionId'>();
export type PrivacyPurposeVersionId = z.infer<
  typeof privacyPurposeVersionIdSchema
>;

export const privacyEngineeringCategoryIdSchema = z
  .uuidv4()
  .brand<'PrivacyEngineeringCategoryId'>();
export type PrivacyEngineeringCategoryId = z.infer<
  typeof privacyEngineeringCategoryIdSchema
>;

/**
 * One-way withdrawal event against append-only authorization evidence.
 * State is only `withdrawn`; the original evidence row is never edited or
 * reopened by this contract.
 */
export const privacyWithdrawalStateSchema = z.literal('withdrawn');
export type PrivacyWithdrawalState = z.infer<
  typeof privacyWithdrawalStateSchema
>;

export const privacyWithdrawalProcessingOutcomeSchema = z.enum([
  'accepted',
  'idempotent_replay',
]);
export type PrivacyWithdrawalProcessingOutcome = z.infer<
  typeof privacyWithdrawalProcessingOutcomeSchema
>;

export const privacyWithdrawalReferenceSchema = z
  .object({
    withdrawalId: privacyWithdrawalIdSchema,
    evidenceId: privacyEvidenceIdSchema,
    state: privacyWithdrawalStateSchema,
    withdrawnAt: privacyTrustedUtcMsSchema,
    operationId: privacyOperationIdSchema,
    processingOutcome: privacyWithdrawalProcessingOutcomeSchema,
  })
  .strict();
export type PrivacyWithdrawalReference = z.infer<
  typeof privacyWithdrawalReferenceSchema
>;

/**
 * Closed engineering deny taxonomy for DataUseDecision.
 * These are diagnosis codes, not legal conclusions or public copy.
 */
export const privacyDataUseDenyReasonSchema = z.enum([
  'actor_context_missing',
  'actor_context_invalid',
  'actor_context_synthetic_in_production',
  'actor_context_lacking_authority',
  'subject_scope_missing',
  'subject_scope_invalid',
  'subject_scope_unmappable',
  'purpose_unknown',
  'purpose_inactive',
  'purpose_version_mismatched',
  'purpose_transition_unresolved',
  'policy_missing',
  'policy_inactive',
  'policy_synthetic_in_production',
  'policy_integrity_invalid',
  'policy_unattributed',
  'policy_not_effective',
  'policy_downgraded',
  'policy_environment_mismatched',
  'operation_outside_purpose_binding',
  'category_outside_purpose_binding',
  'evidence_missing',
  'evidence_mismatched',
  'evidence_invalid',
  'evidence_expired',
  'evidence_withdrawn',
  'processor_absent',
  'processor_undeclared',
  'processor_descriptor_mismatched',
  'processor_handler_missing',
  'audit_unavailable',
  'dependency_unavailable',
]);
export type PrivacyDataUseDenyReason = z.infer<
  typeof privacyDataUseDenyReasonSchema
>;

/**
 * Tagged data-use evaluation result. Never a boolean grant; an allowed
 * decision is request-local evidence of evaluation, not a reusable credential.
 */
export const privacyDataUseDecisionSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.literal('allowed'),
      subjectScopeId: privacySubjectScopeIdSchema,
      actorContextDigest: privacySha256DigestSchema,
      purposeVersionId: privacyPurposeVersionIdSchema,
      operationKind: privacyOperationKindSchema,
      engineeringCategoryId: privacyEngineeringCategoryIdSchema,
      processorDescriptorVersionDigest: privacySha256DigestSchema,
      policyVersionId: privacyPolicyVersionIdSchema,
      policyDigest: privacySha256DigestSchema,
      evaluatedAt: privacyTrustedUtcMsSchema,
      correlationId: privacyCorrelationIdSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('denied'),
      reasonCode: privacyDataUseDenyReasonSchema,
      evaluatedAt: privacyTrustedUtcMsSchema,
      correlationId: privacyCorrelationIdSchema,
    })
    .strict(),
]);
export type PrivacyDataUseDecision = z.infer<
  typeof privacyDataUseDecisionSchema
>;

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

/**
 * Closed engineering authority claims on an actor context.
 * Not product roles, legal roles, or bearer credentials.
 */
export const privacyAuthorityClaimSchema = z.enum([
  'data_use_evaluate',
  'authorization_evidence_append',
  'authorization_withdrawal',
  'subject_request_transition',
  'processor_step_execute',
  'retention_preview',
  'retention_execute',
  'governance_lifecycle',
]);
export type PrivacyAuthorityClaim = z.infer<typeof privacyAuthorityClaimSchema>;

export const privacyAuthorityClaimsSchema = z
  .array(privacyAuthorityClaimSchema)
  .max(32);

/**
 * Backend actor context reference for evaluation. Principal identity is bound
 * by digest only — no raw token, credential, student/coach ID, or legal role.
 */
export const privacyActorContextReferenceSchema = z
  .object({
    issuer: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
    version: z.number().int().min(1).max(10_000),
    principalReferenceDigest: privacySha256DigestSchema,
    authorityClaims: privacyAuthorityClaimsSchema,
    synthetic: z.boolean(),
  })
  .strict();
export type PrivacyActorContextReference = z.infer<
  typeof privacyActorContextReferenceSchema
>;

export const canonicalizePrivacyAuthorityClaims = (
  claims: readonly PrivacyAuthorityClaim[],
): PrivacyAuthorityClaim[] => sortPrivacySetIdentifiers([...claims]);

export const privacyPurposeActivationStateSchema = z.enum([
  'active',
  'inactive',
  'superseded',
]);
export type PrivacyPurposeActivationState = z.infer<
  typeof privacyPurposeActivationStateSchema
>;

/**
 * Immutable purpose/version binding for evaluation. Carries allowed
 * operations/categories and evidence requirement only — no legal purpose text.
 */
export const privacyPurposeVersionReferenceSchema = z
  .object({
    purposeId: privacyPurposeIdSchema,
    purposeVersionId: privacyPurposeVersionIdSchema,
    policyVersionId: privacyPolicyVersionIdSchema,
    allowedOperationKinds: z.array(privacyOperationKindSchema).max(32),
    allowedCategoryIds: z.array(privacyEngineeringCategoryIdSchema).max(64),
    evidenceRequired: z.boolean(),
    activationState: privacyPurposeActivationStateSchema,
    contentDigest: privacySha256DigestSchema,
  })
  .strict();
export type PrivacyPurposeVersionReference = z.infer<
  typeof privacyPurposeVersionReferenceSchema
>;

export const canonicalizePrivacyPurposeVersionReference = (
  input: PrivacyPurposeVersionReference,
): PrivacyPurposeVersionReference => ({
  ...input,
  allowedCategoryIds: sortPrivacySetIdentifiers(input.allowedCategoryIds),
  allowedOperationKinds: sortPrivacySetIdentifiers(input.allowedOperationKinds),
});

export const privacySubjectRequestIdSchema = z
  .uuidv4()
  .brand<'PrivacySubjectRequestId'>();
export type PrivacySubjectRequestId = z.infer<
  typeof privacySubjectRequestIdSchema
>;

export const privacyAuditEventIdSchema = z
  .uuidv4()
  .brand<'PrivacyAuditEventId'>();
export type PrivacyAuditEventId = z.infer<typeof privacyAuditEventIdSchema>;

/** Engineering request types only — not a legal entitlement decision. */
export const privacySubjectRequestTypeSchema = z.enum([
  'access',
  'export',
  'deletion',
]);
export type PrivacySubjectRequestType = z.infer<
  typeof privacySubjectRequestTypeSchema
>;

export const privacySubjectRequestStateSchema = z.enum([
  'received',
  'verification_required',
  'policy_blocked',
  'ready',
  'in_progress',
  'partially_failed',
  'completed',
  'cancelled',
  'denied',
]);
export type PrivacySubjectRequestState = z.infer<
  typeof privacySubjectRequestStateSchema
>;

/**
 * Non-sensitive verification locator. Synthetic markers are rejected by
 * production readiness; no identity payload is carried here.
 */
export const privacyVerificationReferenceSchema = z
  .object({
    verificationRefDigest: privacySha256DigestSchema,
    synthetic: z.boolean(),
  })
  .strict();
export type PrivacyVerificationReference = z.infer<
  typeof privacyVerificationReferenceSchema
>;

/**
 * Data-subject request current pointer. Append-only transition history is a
 * separate reference; this freezes the request identity and pinned versions.
 * `subjectScopeId` is opaque synthetic scope — never PII — and is immutable
 * for the lifetime of a requestId.
 */
export const privacySubjectRequestReferenceSchema = z
  .object({
    requestId: privacySubjectRequestIdSchema,
    requestType: privacySubjectRequestTypeSchema,
    state: privacySubjectRequestStateSchema,
    subjectScopeId: privacySubjectScopeIdSchema,
    verification: privacyVerificationReferenceSchema.nullable(),
    policyVersionId: privacyPolicyVersionIdSchema,
    inventoryVersionDigest: privacySha256DigestSchema,
    correlationId: privacyCorrelationIdSchema,
    updatedAt: privacyTrustedUtcMsSchema,
  })
  .strict();
export type PrivacySubjectRequestReference = z.infer<
  typeof privacySubjectRequestReferenceSchema
>;

/**
 * Immutable identity fields that must match for requestId reuse / replay.
 * Structural (string) inputs avoid dual-Zod brand mismatches across packages.
 */
export type PrivacySubjectRequestIdentityFields = {
  requestId: string;
  subjectScopeId: string;
  requestType: string;
  policyVersionId: string;
  inventoryVersionDigest: string;
};

export const privacySubjectRequestIdentityEquals = (
  left: PrivacySubjectRequestIdentityFields,
  right: PrivacySubjectRequestIdentityFields,
): boolean =>
  left.requestId === right.requestId &&
  left.subjectScopeId === right.subjectScopeId &&
  left.requestType === right.requestType &&
  left.policyVersionId === right.policyVersionId &&
  left.inventoryVersionDigest === right.inventoryVersionDigest;

export const privacySubjectRequestTransitionIdSchema = z
  .uuidv4()
  .brand<'PrivacySubjectRequestTransitionId'>();
export type PrivacySubjectRequestTransitionId = z.infer<
  typeof privacySubjectRequestTransitionIdSchema
>;

/**
 * Append-only subject-request transition evidence. Ordinary application
 * mutation never updates or deletes these rows.
 */
export const privacySubjectRequestTransitionReasonSchema = z.enum([
  'forward',
  'verification_accepted',
  'policy_blocked',
  'cancelled',
  'denied',
]);
export type PrivacySubjectRequestTransitionReason = z.infer<
  typeof privacySubjectRequestTransitionReasonSchema
>;

export const privacySubjectRequestTransitionReferenceSchema = z
  .object({
    transitionId: privacySubjectRequestTransitionIdSchema,
    requestId: privacySubjectRequestIdSchema,
    previousState: privacySubjectRequestStateSchema,
    nextState: privacySubjectRequestStateSchema,
    operationId: privacyOperationIdSchema,
    correlationId: privacyCorrelationIdSchema,
    reasonCode: privacySubjectRequestTransitionReasonSchema.nullable(),
    verificationRefDigest: privacySha256DigestSchema.nullable(),
    recordedAt: privacyTrustedUtcMsSchema,
  })
  .strict();
export type PrivacySubjectRequestTransitionReference = z.infer<
  typeof privacySubjectRequestTransitionReferenceSchema
>;

export const privacyAuditEventKindSchema = z.enum([
  'data_use_evaluated',
  'authorization_evidence_appended',
  'authorization_withdrawn',
  'subject_request_transitioned',
  'processor_step_recorded',
  'retention_preview_recorded',
  'retention_execution_recorded',
  'governance_lifecycle_recorded',
]);
export type PrivacyAuditEventKind = z.infer<typeof privacyAuditEventKindSchema>;

export const privacyAuditOutcomeSchema = z.enum([
  'succeeded',
  'denied',
  'failed',
  'partial',
]);
export type PrivacyAuditOutcome = z.infer<typeof privacyAuditOutcomeSchema>;

/**
 * Append-only audit event with closed kind/outcome and minimal references.
 * Rejects arbitrary metadata, free text, SQL, tokens, and subject payloads.
 */
export const privacyAuditEventReferenceSchema = z
  .object({
    auditEventId: privacyAuditEventIdSchema,
    kind: privacyAuditEventKindSchema,
    outcome: privacyAuditOutcomeSchema,
    reasonCode: privacyDataUseDenyReasonSchema.nullable(),
    policyVersionId: privacyPolicyVersionIdSchema.nullable(),
    evidenceId: privacyEvidenceIdSchema.nullable(),
    requestId: privacySubjectRequestIdSchema.nullable(),
    operationId: privacyOperationIdSchema,
    correlationId: privacyCorrelationIdSchema,
    recordedAt: privacyTrustedUtcMsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === 'denied' && value.reasonCode === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'denied audit events require a closed reasonCode',
        path: ['reasonCode'],
      });
    }
    if (value.outcome === 'succeeded' && value.reasonCode !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'succeeded audit events must not carry reasonCode',
        path: ['reasonCode'],
      });
    }
  });
export type PrivacyAuditEventReference = z.infer<
  typeof privacyAuditEventReferenceSchema
>;

export const privacyProcessorIdSchema = z
  .uuidv4()
  .brand<'PrivacyProcessorId'>();
export type PrivacyProcessorId = z.infer<typeof privacyProcessorIdSchema>;

export const privacyProcessorInventoryIdSchema = z
  .uuidv4()
  .brand<'PrivacyProcessorInventoryId'>();
export type PrivacyProcessorInventoryId = z.infer<
  typeof privacyProcessorInventoryIdSchema
>;

/**
 * Closed handler capabilities a processor may declare. Absent handlers are
 * coverage failures — never silently treated as not_found or completed.
 */
export const privacyProcessorCapabilitySchema = z.enum([
  'inventory',
  'access',
  'export',
  'delete',
  'retention',
  'governance_lifecycle',
]);
export type PrivacyProcessorCapability = z.infer<
  typeof privacyProcessorCapabilitySchema
>;

export const privacyProcessorCapabilitiesSchema = z
  .array(privacyProcessorCapabilitySchema)
  .max(16);

/**
 * Code-owned processor descriptor. No provider host, region, credential, or
 * self-attested completeness flag — inventory match is evaluated externally.
 */
export const privacyProcessorDescriptorReferenceSchema = z
  .object({
    processorId: privacyProcessorIdSchema,
    inventoryId: privacyProcessorInventoryIdSchema,
    descriptorDigest: privacySha256DigestSchema,
    inventoryVersionDigest: privacySha256DigestSchema,
    allowedPurposeIds: z.array(privacyPurposeIdSchema).max(64),
    allowedCategoryIds: z.array(privacyEngineeringCategoryIdSchema).max(64),
    capabilities: privacyProcessorCapabilitiesSchema,
    supportsSubjectLookup: z.boolean(),
    codeOwner: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
    synthetic: z.boolean(),
  })
  .strict();
export type PrivacyProcessorDescriptorReference = z.infer<
  typeof privacyProcessorDescriptorReferenceSchema
>;

export const canonicalizePrivacyProcessorDescriptorReference = (
  input: PrivacyProcessorDescriptorReference,
): PrivacyProcessorDescriptorReference => ({
  ...input,
  allowedCategoryIds: sortPrivacySetIdentifiers(input.allowedCategoryIds),
  allowedPurposeIds: sortPrivacySetIdentifiers(input.allowedPurposeIds),
  capabilities: sortPrivacySetIdentifiers(input.capabilities),
});

export const privacyProcessorStepIdSchema = z
  .uuidv4()
  .brand<'PrivacyProcessorStepId'>();
export type PrivacyProcessorStepId = z.infer<
  typeof privacyProcessorStepIdSchema
>;

/**
 * Closed outcome for one processor execution attempt. `retryable_failure`
 * leaves the (requestId, processorId, capability) pair pending; only
 * `completed` and `permanent_failure` are terminal for that pair.
 */
export const privacyProcessorStepOutcomeSchema = z.enum([
  'completed',
  'retryable_failure',
  'permanent_failure',
]);
export type PrivacyProcessorStepOutcome = z.infer<
  typeof privacyProcessorStepOutcomeSchema
>;

/**
 * Append-only record of one processor's execution attempt for one
 * subject-request capability. Multiple steps may exist for the same
 * (requestId, processorId, capability) across retries; request completion is
 * derived from the full step history, never a single row.
 */
export const privacyProcessorStepReferenceSchema = z
  .object({
    stepId: privacyProcessorStepIdSchema,
    requestId: privacySubjectRequestIdSchema,
    processorId: privacyProcessorIdSchema,
    capability: privacyProcessorCapabilitySchema,
    outcome: privacyProcessorStepOutcomeSchema,
    operationId: privacyOperationIdSchema,
    correlationId: privacyCorrelationIdSchema,
    recordedAt: privacyTrustedUtcMsSchema,
  })
  .strict();
export type PrivacyProcessorStepReference = z.infer<
  typeof privacyProcessorStepReferenceSchema
>;

export const privacyProcessorInventorySchemaVersionSchema = z.literal(
  'privacy.processor-inventory.v1',
);
export type PrivacyProcessorInventorySchemaVersion = z.infer<
  typeof privacyProcessorInventorySchemaVersionSchema
>;

export const privacyProcessorStorageKindSchema = z.enum([
  'postgresql',
  'structured_log',
  'in_memory_synthetic',
  'object_store',
  'queue',
  'cache',
  'export_store',
  'backup',
  'derived_store',
]);
export type PrivacyProcessorStorageKind = z.infer<
  typeof privacyProcessorStorageKindSchema
>;

export const privacySubjectLookupStrategySchema = z.enum([
  'none',
  'synthetic_scope_id',
  'prd07_identity_mapping_required',
]);
export type PrivacySubjectLookupStrategy = z.infer<
  typeof privacySubjectLookupStrategySchema
>;

/**
 * Governance table / record families that inventory coverage must map.
 * Closed set for Option A disposable persistence plus planned families.
 */
export const privacyGovernanceRecordFamilySchema = z.enum([
  'privacy_policy_package_version',
  'privacy_purpose_version',
  'privacy_processor_registration',
  'privacy_authorization_evidence',
  'privacy_withdrawal',
  'privacy_audit_event',
  'privacy_subject_request',
  'privacy_subject_request_transition',
  'privacy_retention_rule',
  'privacy_retention_preview',
  'privacy_retention_work',
  'privacy_processor_step',
  'privacy_export_metadata',
  'privacy_lifecycle_proof',
]);
export type PrivacyGovernanceRecordFamily = z.infer<
  typeof privacyGovernanceRecordFamilySchema
>;

/**
 * Lifecycle disposition for a record family. Generic keep-forever values are
 * rejected by construction.
 */
export const privacyRecordFamilyLifecycleActionSchema = z.enum([
  'delete',
  'irreversible_transform',
  'exception_reviewed',
  'retain_until_reviewed',
]);
export type PrivacyRecordFamilyLifecycleAction = z.infer<
  typeof privacyRecordFamilyLifecycleActionSchema
>;

export const privacyUnsupportedCapabilityRationaleSchema = z.enum([
  'not_in_scope_for_candidate',
  'requires_legal_privacy_decision',
  'requires_external_credential',
  'requires_financial_commitment',
  'deferred_to_later_prd21_slice',
]);
export type PrivacyUnsupportedCapabilityRationale = z.infer<
  typeof privacyUnsupportedCapabilityRationaleSchema
>;

export const privacyExpectedProcessorInventoryEntrySchema = z
  .object({
    processorId: privacyProcessorIdSchema,
    registrationVersion: z.number().int().positive().max(10_000),
    inventoryId: privacyProcessorInventoryIdSchema,
    descriptorDigest: privacySha256DigestSchema,
    codeOwner: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
    adapterPackage: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9@/._-]+$/),
    storageKind: privacyProcessorStorageKindSchema,
    allowedPurposeIds: z.array(privacyPurposeIdSchema).max(64),
    allowedCategoryIds: z.array(privacyEngineeringCategoryIdSchema).max(64),
    subjectLookupStrategy: privacySubjectLookupStrategySchema,
    supportedCapabilities: privacyProcessorCapabilitiesSchema,
    unsupportedCapabilities: z
      .array(
        z
          .object({
            capability: privacyProcessorCapabilitySchema,
            rationale: privacyUnsupportedCapabilityRationaleSchema,
          })
          .strict(),
      )
      .max(16),
    recordFamilies: z
      .array(
        z
          .object({
            family: privacyGovernanceRecordFamilySchema,
            lifecycleAction: privacyRecordFamilyLifecycleActionSchema,
          })
          .strict(),
      )
      .min(1)
      .max(64),
    environmentApplicability: z.enum([
      'synthetic_only',
      'disposable_test',
      'production_blocked_by_legal_privacy',
    ]),
    requiredReadiness: z.enum(['mechanism_only', 'production']),
    synthetic: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const supported = new Set(value.supportedCapabilities);
    for (const unsupported of value.unsupportedCapabilities) {
      if (supported.has(unsupported.capability)) {
        ctx.addIssue({
          code: 'custom',
          message: 'capability cannot be both supported and unsupported',
          path: ['unsupportedCapabilities'],
        });
      }
    }
  });
export type PrivacyExpectedProcessorInventoryEntry = z.infer<
  typeof privacyExpectedProcessorInventoryEntrySchema
>;

/**
 * Reviewed expected processor inventory artifact. Metadata only — no hosts,
 * regions, credentials, connection strings, subject locators, or legal text.
 */
export const privacyExpectedProcessorInventorySchema = z
  .object({
    schemaVersion: privacyProcessorInventorySchemaVersionSchema,
    inventoryId: privacyProcessorInventoryIdSchema,
    inventoryVersionDigest: privacySha256DigestSchema,
    canonicalizationVersion: privacyCanonicalizationVersionSchema,
    sourceCommit: z.string().regex(/^[a-f0-9]{7,40}$/),
    processors: z.array(privacyExpectedProcessorInventoryEntrySchema).max(128),
  })
  .strict();
export type PrivacyExpectedProcessorInventory = z.infer<
  typeof privacyExpectedProcessorInventorySchema
>;

export const canonicalizePrivacyExpectedProcessorInventory = (
  input: PrivacyExpectedProcessorInventory,
): PrivacyExpectedProcessorInventory => ({
  ...input,
  processors: [...input.processors]
    .map((processor) => ({
      ...processor,
      allowedCategoryIds: sortPrivacySetIdentifiers(
        processor.allowedCategoryIds,
      ),
      allowedPurposeIds: sortPrivacySetIdentifiers(processor.allowedPurposeIds),
      supportedCapabilities: sortPrivacySetIdentifiers(
        processor.supportedCapabilities,
      ),
      unsupportedCapabilities: [...processor.unsupportedCapabilities].sort(
        (left, right) =>
          left.capability.localeCompare(right.capability) ||
          left.rationale.localeCompare(right.rationale),
      ),
      recordFamilies: [...processor.recordFamilies].sort((left, right) =>
        left.family.localeCompare(right.family),
      ),
    }))
    .sort((left, right) => left.processorId.localeCompare(right.processorId)),
});

/**
 * Synthetic SubjectDataProcessor command. Metadata/digests only — no subject
 * payloads, SQL, hosts, or legal text.
 */
export const privacySyntheticProcessorCommandSchema = z
  .object({
    processorId: privacyProcessorIdSchema,
    capability: privacyProcessorCapabilitySchema,
    subjectScopeId: privacySubjectScopeIdSchema,
    correlationId: privacyCorrelationIdSchema,
    operationId: privacyOperationIdSchema,
    productionMode: z.boolean(),
  })
  .strict();
export type PrivacySyntheticProcessorCommand = z.infer<
  typeof privacySyntheticProcessorCommandSchema
>;

export const privacySyntheticProcessorFamilyCoverageSchema = z
  .object({
    family: privacyGovernanceRecordFamilySchema,
    recordCount: z.number().int().nonnegative().max(1_000_000),
    coverageDigest: privacySha256DigestSchema,
  })
  .strict();
export type PrivacySyntheticProcessorFamilyCoverage = z.infer<
  typeof privacySyntheticProcessorFamilyCoverageSchema
>;

export const privacySyntheticProcessorResultSchema = z
  .object({
    status: z.enum(['completed', 'denied', 'unsupported']),
    reasonCode: z
      .enum([
        'capability_not_declared',
        'synthetic_processor_in_production',
        'unsupported_capability',
        'requires_legal_privacy_decision',
      ])
      .nullable(),
    capability: privacyProcessorCapabilitySchema,
    families: z.array(privacySyntheticProcessorFamilyCoverageSchema).max(64),
    accessLocatorDigest: privacySha256DigestSchema.nullable(),
    /** Opaque digest of a synthetic export manifest — never a payload blob. */
    exportManifestDigest: privacySha256DigestSchema.nullable(),
    operationId: privacyOperationIdSchema,
    correlationId: privacyCorrelationIdSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'completed' && value.reasonCode !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'completed processor results must not carry reasonCode',
        path: ['reasonCode'],
      });
    }
    if (value.status !== 'completed' && value.reasonCode === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'non-completed processor results require reasonCode',
        path: ['reasonCode'],
      });
    }
    if (value.status === 'completed' && value.capability === 'access') {
      if (value.accessLocatorDigest === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'completed access results require accessLocatorDigest',
          path: ['accessLocatorDigest'],
        });
      }
    }
    if (value.capability !== 'access' && value.accessLocatorDigest !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'non-access results must not carry accessLocatorDigest',
        path: ['accessLocatorDigest'],
      });
    }
    if (value.status === 'completed' && value.capability === 'export') {
      if (value.exportManifestDigest === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'completed export results require exportManifestDigest',
          path: ['exportManifestDigest'],
        });
      }
    }
    if (value.capability !== 'export' && value.exportManifestDigest !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'non-export results must not carry exportManifestDigest',
        path: ['exportManifestDigest'],
      });
    }
  });
export type PrivacySyntheticProcessorResult = z.infer<
  typeof privacySyntheticProcessorResultSchema
>;

/**
 * Disposable synthetic API for SubjectDataProcessor execute behind
 * allowSyntheticPrivacy.
 */
export const privacySyntheticProcessorExecuteRequestSchema = z
  .object({
    descriptor: privacyProcessorDescriptorReferenceSchema,
    families: z.array(privacyGovernanceRecordFamilySchema).min(1).max(64),
    command: privacySyntheticProcessorCommandSchema,
  })
  .strict();
export type PrivacySyntheticProcessorExecuteRequest = z.infer<
  typeof privacySyntheticProcessorExecuteRequestSchema
>;

export const privacySyntheticProcessorExecuteResponseSchema =
  privacySyntheticProcessorResultSchema;
export type PrivacySyntheticProcessorExecuteResponse = z.infer<
  typeof privacySyntheticProcessorExecuteResponseSchema
>;

/**
 * Safe readiness diagnostic codes only. No policy text, subject IDs, hosts,
 * regions, credentials, or raw exceptions.
 */
export const privacyReadinessDiagnosticCodeSchema = z.enum([
  'policy_missing',
  'policy_synthetic',
  'policy_unattributed',
  'policy_integrity_invalid',
  'policy_transition_unresolved',
  'environment_mismatch',
  'inventory_mismatch',
  'processor_missing',
  'handler_missing',
  'migration_missing',
  'audit_unavailable',
  'governance_table_lifecycle_missing',
  'exception_unapproved',
  'exception_expired',
  'hold_unresolved',
  'lifecycle_authority_unavailable',
  'lifecycle_authority_synthetic',
  'recovery_unverified',
  'identity_boundary_missing',
  'legal_privacy_decision_required',
  'active_stop_condition',
  'contract_version_mismatch',
  'canonicalization_version_mismatch',
  'repository_unavailable',
]);
export type PrivacyReadinessDiagnosticCode = z.infer<
  typeof privacyReadinessDiagnosticCodeSchema
>;

export const privacyReadinessComponentStateSchema = z.enum([
  'ready',
  'not_ready',
  'unavailable',
]);
export type PrivacyReadinessComponentState = z.infer<
  typeof privacyReadinessComponentStateSchema
>;

export const privacyReadinessComponentIdSchema = z.enum([
  'contracts',
  'migrations',
  'repositories',
  'audit_sink',
  'expected_inventory',
  'runtime_processors',
  'governance_lifecycle',
  'identity_boundary',
  'policy_package',
  'recovery',
]);
export type PrivacyReadinessComponentId = z.infer<
  typeof privacyReadinessComponentIdSchema
>;

export const privacyReadinessComponentSchema = z
  .object({
    componentId: privacyReadinessComponentIdSchema,
    state: privacyReadinessComponentStateSchema,
    diagnosticCode: privacyReadinessDiagnosticCodeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.state === 'ready' && value.diagnosticCode !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'ready components must not carry a diagnosticCode',
        path: ['diagnosticCode'],
      });
    }
    if (value.state !== 'ready' && value.diagnosticCode === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'non-ready components require a closed diagnosticCode',
        path: ['diagnosticCode'],
      });
    }
  });
export type PrivacyReadinessComponent = z.infer<
  typeof privacyReadinessComponentSchema
>;

/**
 * Conjunctive readiness result. `mechanismReady` never means production
 * activation. Current authorized compositions keep `productionReady: false`
 * with `legal_privacy_decision_required` while that stop is active.
 */
export const privacyReadinessResultSchema = z
  .object({
    mechanismReady: z.boolean(),
    productionReady: z.boolean(),
    canonicalizationVersion: privacyCanonicalizationVersionSchema,
    schemaDigest: privacySha256DigestSchema,
    inventoryVersionDigest: privacySha256DigestSchema.nullable(),
    components: z.array(privacyReadinessComponentSchema).max(32),
    diagnosticCodes: z.array(privacyReadinessDiagnosticCodeSchema).max(64),
    evaluatedAt: privacyTrustedUtcMsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const componentCounts = new Map<PrivacyReadinessComponentId, number>();
    for (const component of value.components) {
      componentCounts.set(
        component.componentId,
        (componentCounts.get(component.componentId) ?? 0) + 1,
      );
    }
    if (
      privacyReadinessComponentIdSchema.options.some(
        (componentId) => componentCounts.get(componentId) !== 1,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'readiness requires every component exactly once',
        path: ['components'],
      });
    }
    if (
      value.mechanismReady &&
      value.components.some((component) => component.state !== 'ready')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'mechanismReady requires every component to be ready',
        path: ['mechanismReady'],
      });
    }
    if (
      value.productionReady &&
      value.diagnosticCodes.includes('legal_privacy_decision_required')
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'productionReady cannot be true while legal_privacy_decision_required is reported',
        path: ['productionReady'],
      });
    }
    if (value.productionReady && !value.mechanismReady) {
      ctx.addIssue({
        code: 'custom',
        message: 'productionReady requires mechanismReady',
        path: ['productionReady'],
      });
    }
  });
export type PrivacyReadinessResult = z.infer<
  typeof privacyReadinessResultSchema
>;

export const canonicalizePrivacyReadinessDiagnosticCodes = (
  codes: readonly PrivacyReadinessDiagnosticCode[],
): PrivacyReadinessDiagnosticCode[] => sortPrivacySetIdentifiers([...codes]);

/**
 * Disposable synthetic API request for the explicit allowSyntheticPrivacy
 * seam. Not a production public privacy route contract.
 */
export const privacySyntheticDataUseEvaluateRequestSchema = z
  .object({
    actor: privacyActorContextReferenceSchema,
    purpose: privacyPurposeVersionReferenceSchema,
    policy: privacyPolicyPackageReferenceSchema,
    processor: privacyProcessorDescriptorReferenceSchema,
    processorCapability: z.literal('access'),
    operationKind: privacyOperationKindSchema,
    engineeringCategoryId: privacyEngineeringCategoryIdSchema,
    evidence: privacyEvidenceReferenceSchema.nullable(),
    subjectScopeId: privacySubjectScopeIdSchema,
    productionMode: z.boolean(),
  })
  .strict();
export type PrivacySyntheticDataUseEvaluateRequest = z.infer<
  typeof privacySyntheticDataUseEvaluateRequestSchema
>;

export const privacySyntheticDataUseEvaluateResponseSchema = z
  .object({
    status: z.enum(['evaluated', 'audit_unavailable']),
    decision: privacyDataUseDecisionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === 'audit_unavailable' &&
      (value.decision.outcome !== 'denied' ||
        value.decision.reasonCode !== 'audit_unavailable')
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'audit_unavailable responses require a fail-closed denied decision',
        path: ['decision'],
      });
    }
  });
export type PrivacySyntheticDataUseEvaluateResponse = z.infer<
  typeof privacySyntheticDataUseEvaluateResponseSchema
>;

/**
 * Disposable synthetic API that seeds/applies subject-request transitions
 * through the repository port (pointer + append-only history) behind
 * allowSyntheticPrivacy. Not a production public privacy route.
 */
export const privacySyntheticSubjectRequestTransitionRequestSchema = z
  .object({
    request: privacySubjectRequestReferenceSchema,
    next: privacySubjectRequestStateSchema,
    transitionId: privacySubjectRequestTransitionIdSchema,
    operationId: privacyOperationIdSchema,
    correlationId: privacyCorrelationIdSchema,
    reasonCode: privacySubjectRequestTransitionReasonSchema
      .nullable()
      .optional(),
    verification: privacyVerificationReferenceSchema.nullable().optional(),
    productionMode: z.boolean(),
  })
  .strict();
export type PrivacySyntheticSubjectRequestTransitionRequest = z.infer<
  typeof privacySyntheticSubjectRequestTransitionRequestSchema
>;

export const privacySyntheticSubjectRequestTransitionResponseSchema = z
  .object({
    status: z.enum(['advanced', 'already_terminal', 'invalid', 'conflict']),
    reason: z
      .enum([
        'illegal_transition',
        'verification_required',
        'synthetic_verification_in_production',
        'terminal_state',
        'not_found',
      ])
      .optional(),
    request: privacySubjectRequestReferenceSchema.optional(),
    transition: privacySubjectRequestTransitionReferenceSchema.optional(),
  })
  .strict();
export type PrivacySyntheticSubjectRequestTransitionResponse = z.infer<
  typeof privacySyntheticSubjectRequestTransitionResponseSchema
>;

/**
 * Disposable synthetic API for withdrawal planning behind
 * allowSyntheticPrivacy. Does not mutate evidence rows.
 */
export const privacySyntheticWithdrawalPlanRequestSchema = z
  .object({
    existing: privacyWithdrawalReferenceSchema.nullable(),
    withdrawalId: privacyWithdrawalIdSchema,
    evidenceId: privacyEvidenceIdSchema,
    operationId: privacyOperationIdSchema,
  })
  .strict();
export type PrivacySyntheticWithdrawalPlanRequest = z.infer<
  typeof privacySyntheticWithdrawalPlanRequestSchema
>;

export const privacySyntheticWithdrawalPlanResponseSchema = z
  .object({
    status: z.enum([
      'accepted',
      'idempotent_replay',
      'already_withdrawn',
      'conflict',
    ]),
    withdrawal: privacyWithdrawalReferenceSchema.optional(),
  })
  .strict();
export type PrivacySyntheticWithdrawalPlanResponse = z.infer<
  typeof privacySyntheticWithdrawalPlanResponseSchema
>;

/**
 * Disposable synthetic API for retention preview planning. Read-only; never
 * deletes or transforms data. Not a production public privacy route.
 */
export const privacySyntheticRetentionPreviewRequestSchema = z
  .object({
    policyVersionId: privacyPolicyVersionIdSchema,
    policySynthetic: z.boolean(),
    inventoryVersionDigest: privacySha256DigestSchema,
    processorDescriptorDigests: z.array(privacySha256DigestSchema).max(64),
    watermark: privacyTrustedUtcMsSchema,
    approvedExceptionIds: privacyApprovedExceptionIdsSchema,
    productionMode: z.boolean(),
  })
  .strict();
export type PrivacySyntheticRetentionPreviewRequest = z.infer<
  typeof privacySyntheticRetentionPreviewRequestSchema
>;

export const privacySyntheticRetentionPreviewResponseSchema = z
  .object({
    status: z.enum(['planned', 'invalid']),
    reason: z
      .enum([
        'policy_synthetic_in_production',
        'missing_inventory_digest',
        'missing_processor_descriptors',
        'missing_watermark',
      ])
      .optional(),
    preview: z
      .object({
        policyVersionId: privacyPolicyVersionIdSchema,
        inventoryVersionDigest: privacySha256DigestSchema,
        processorDescriptorDigests: z.array(privacySha256DigestSchema).max(64),
        watermark: privacyTrustedUtcMsSchema,
        selectionDigest: privacySha256DigestSchema,
        approvedExceptionIds: privacyApprovedExceptionIdsSchema,
        synthetic: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PrivacySyntheticRetentionPreviewResponse = z.infer<
  typeof privacySyntheticRetentionPreviewResponseSchema
>;

/**
 * Disposable synthetic API for retention execution authorization.
 * Production path remains hard-disabled.
 */
export const privacySyntheticRetentionExecutionAuthorizeRequestSchema = z
  .object({
    productionMode: z.boolean(),
    policySynthetic: z.boolean(),
    authoritySynthetic: z.boolean(),
    previewExecuted: z.boolean(),
    previewExpired: z.boolean(),
    digestsMatch: z.boolean(),
  })
  .strict();
export type PrivacySyntheticRetentionExecutionAuthorizeRequest = z.infer<
  typeof privacySyntheticRetentionExecutionAuthorizeRequestSchema
>;

export const privacySyntheticRetentionExecutionAuthorizeResponseSchema = z
  .object({
    status: z.enum(['allowed_synthetic_test', 'hard_disabled']),
    reason: z
      .enum([
        'production_path',
        'synthetic_fixtures_required',
        'preview_mismatch',
        'preview_expired_or_executed',
      ])
      .optional(),
  })
  .strict();
export type PrivacySyntheticRetentionExecutionAuthorizeResponse = z.infer<
  typeof privacySyntheticRetentionExecutionAuthorizeResponseSchema
>;

/**
 * Synthetic-only expected-vs-runtime processor inventory coverage check.
 * Mechanism evidence only — does not authorize production readiness.
 */
export const privacySyntheticInventoryCoverageRequestSchema = z
  .object({
    /**
     * Optional when the synthetic API is composed with an injected
     * `PrivacyExpectedProcessorInventoryPort`; otherwise required at the route.
     */
    expected: privacyExpectedProcessorInventorySchema.optional(),
    /**
     * Optional when the synthetic API is composed with an injected
     * `PrivacyRuntimeProcessorRegistry`; otherwise required at the route.
     */
    runtime: z
      .array(privacyProcessorDescriptorReferenceSchema)
      .max(128)
      .optional(),
  })
  .strict();
export type PrivacySyntheticInventoryCoverageRequest = z.infer<
  typeof privacySyntheticInventoryCoverageRequestSchema
>;

export const privacyInventoryCoverageMismatchSchema = z
  .object({
    diagnosticCode: z.enum([
      'inventory_mismatch',
      'processor_missing',
      'handler_missing',
    ]),
    processorId: z.string().nullable(),
    detail: z.string().min(1).max(256),
  })
  .strict();
export type PrivacyInventoryCoverageMismatch = z.infer<
  typeof privacyInventoryCoverageMismatchSchema
>;

export const privacySyntheticInventoryCoverageResponseSchema = z
  .object({
    status: z.enum(['matched', 'mismatched']),
    mismatches: z.array(privacyInventoryCoverageMismatchSchema).max(256),
    evaluatedAt: privacyTrustedUtcMsSchema,
  })
  .strict();
export type PrivacySyntheticInventoryCoverageResponse = z.infer<
  typeof privacySyntheticInventoryCoverageResponseSchema
>;

/**
 * Synthetic-only read of the injected expected processor inventory port.
 * Mechanism evidence only — does not authorize production readiness.
 */
export const privacySyntheticExpectedInventoryResponseSchema = z
  .object({
    inventory: privacyExpectedProcessorInventorySchema,
    evaluatedAt: privacyTrustedUtcMsSchema,
  })
  .strict();
export type PrivacySyntheticExpectedInventoryResponse = z.infer<
  typeof privacySyntheticExpectedInventoryResponseSchema
>;

/**
 * Synthetic-only read of injected runtime processor registry descriptors.
 * Mechanism evidence only — does not authorize production readiness.
 */
export const privacySyntheticRuntimeProcessorsResponseSchema = z
  .object({
    runtime: z.array(privacyProcessorDescriptorReferenceSchema).max(128),
    evaluatedAt: privacyTrustedUtcMsSchema,
  })
  .strict();
export type PrivacySyntheticRuntimeProcessorsResponse = z.infer<
  typeof privacySyntheticRuntimeProcessorsResponseSchema
>;

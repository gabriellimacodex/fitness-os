import type {
  PrivacyActorContextReference,
  PrivacyAuditEventId,
  PrivacyAuditEventReference,
  PrivacyCorrelationId,
  PrivacyDataUseDecision,
  PrivacyEngineeringCategoryId,
  PrivacyEvidenceReference,
  PrivacyExpectedProcessorInventory,
  PrivacyGovernanceLifecycleProofReference,
  PrivacyGovernanceLifecycleBinding,
  PrivacyOperationId,
  PrivacyOperationKind,
  PrivacyPolicyPackageReference,
  PrivacyProcessorDescriptorReference,
  PrivacyProcessorExecutionReceipt,
  PrivacyProcessorStepReference,
  PrivacyPurposeVersionReference,
  PrivacyRetentionPreviewRecord,
  PrivacyRetentionRuleReference,
  PrivacySubjectRequestReference,
  PrivacySubjectRequestState,
  PrivacySubjectRequestTransitionId,
  PrivacySubjectRequestTransitionReason,
  PrivacySubjectRequestTransitionReference,
  PrivacySubjectScopeId,
  PrivacySyntheticProcessorCommand,
  PrivacySyntheticProcessorResult,
  PrivacyVerificationReference,
  PrivacyWithdrawalReference,
} from '@fitness-os/schemas';

/**
 * Narrow ports for the first Option A data-use / withdrawal domain slice.
 * Implementations stay outside Fastify/Drizzle; synthetic fakes are test-only.
 */

export interface PrivacyTrustedClock {
  nowUtcMs(): string;
}

export interface PrivacyIdFactory {
  auditEventId(): PrivacyAuditEventId;
  correlationId(): PrivacyCorrelationId;
  operationId(): PrivacyOperationId;
  subjectScopeId(): PrivacySubjectScopeId;
}

export interface PrivacyAuditSink {
  append(
    event: PrivacyAuditEventReference,
  ): Promise<'accepted' | 'unavailable'>;
}

export type PrivacyReferencePutResult = 'accepted' | 'conflict';

export interface PrivacyPolicyPackageRepository {
  getActive(versionId: string): Promise<PrivacyPolicyPackageReference | null>;
  put(
    record: PrivacyPolicyPackageReference,
  ): Promise<PrivacyReferencePutResult>;
}

export interface PrivacyPurposeRegistry {
  getVersion(
    purposeVersionId: string,
  ): Promise<PrivacyPurposeVersionReference | null>;
  put(
    record: PrivacyPurposeVersionReference,
  ): Promise<PrivacyReferencePutResult>;
}

export type PrivacyEvidenceAppendResult = 'accepted' | 'conflict';

export type PrivacyWithdrawalAppendResult =
  'accepted' | 'idempotent_replay' | 'already_withdrawn' | 'conflict';

export interface PrivacyAuthorizationEvidenceLedger {
  getEvidence(evidenceId: string): Promise<PrivacyEvidenceReference | null>;
  getAuthoritativeWithdrawal(
    evidenceId: string,
  ): Promise<PrivacyWithdrawalReference | null>;
  appendEvidence(
    record: PrivacyEvidenceReference,
  ): Promise<PrivacyEvidenceAppendResult>;
  appendWithdrawal(
    record: PrivacyWithdrawalReference,
  ): Promise<PrivacyWithdrawalAppendResult>;
}

export type PrivacyGovernanceLifecycleAppendResult = 'accepted' | 'conflict';

/**
 * Append-only governance-lifecycle proof ledger. Records the outcome/proofId
 * of a governance-lifecycle command without executing it — execution remains
 * a separately gated concern under `LEGAL_PRIVACY_DECISION_REQUIRED`.
 */
export interface PrivacyGovernanceLifecycleLedger {
  getByOperationId(
    operationId: string,
  ): Promise<PrivacyGovernanceLifecycleProofReference | null>;
  append(
    record: PrivacyGovernanceLifecycleProofReference,
  ): Promise<PrivacyGovernanceLifecycleAppendResult>;
}

export type PrivacyGovernanceLifecycleBindingVerificationResult =
  | {
      status: 'verified';
      binding: PrivacyGovernanceLifecycleBinding;
    }
  | { status: 'invalid' }
  | { status: 'unavailable' };

/**
 * Resolves a caller-presented lifecycle tuple against sealed execution or
 * coordinator evidence. A verifier must fail closed for missing, mismatched,
 * or ambiguous evidence; the presented tuple is never authority by itself.
 */
export interface PrivacyGovernanceLifecycleBindingVerifier {
  verify(
    input: PrivacyGovernanceLifecycleBinding,
  ): Promise<PrivacyGovernanceLifecycleBindingVerificationResult>;
}

/**
 * Read-only execution/coordinator evidence source. Its plural lookup is
 * intentionally distinct from the append target ledger: zero or multiple
 * receipts fail authorization, and this port cannot append lifecycle proofs.
 */
export interface PrivacyGovernanceExecutionReceiptSource {
  listByOperationId(
    operationId: string,
  ): Promise<readonly PrivacyGovernanceLifecycleBinding[]>;
}

/**
 * Read-only outcome evidence emitted by an independent synthetic processor or
 * coordinator. Plural lookup makes missing and ambiguous operation receipts
 * explicit fail-closed states; this port cannot append processor steps.
 */
export interface PrivacyProcessorExecutionReceiptSource {
  listByOperationId(
    operationId: string,
  ): Promise<readonly PrivacyProcessorExecutionReceipt[]>;
}

/**
 * Versioned retention-rule registry. A rule version is immutable once
 * accepted; a later change is a new `ruleVersionId`, never an overwrite.
 */
export interface PrivacyRetentionRuleRepository {
  getActiveVersion(
    ruleVersionId: string,
  ): Promise<PrivacyRetentionRuleReference | null>;
  /**
   * Every accepted version bound to the exact category/purpose pair, in no
   * guaranteed order. Callers select the applicable version explicitly;
   * this port never infers "latest" or "default" on their behalf.
   */
  listActiveForCategoryAndPurpose(
    engineeringCategoryId: string,
    purposeVersionId: string,
  ): Promise<readonly PrivacyRetentionRuleReference[]>;
  put(
    record: PrivacyRetentionRuleReference,
  ): Promise<PrivacyReferencePutResult>;
}

export interface PrivacyRuntimeProcessorRegistry {
  getDescriptor(
    processorId: string,
  ): Promise<PrivacyProcessorDescriptorReference | null>;
  /**
   * Return every registered runtime descriptor. Used by synthetic
   * inventory-coverage composition; production adapters may still deny.
   */
  listDescriptors(): Promise<readonly PrivacyProcessorDescriptorReference[]>;
  put(
    record: PrivacyProcessorDescriptorReference,
  ): Promise<PrivacyReferencePutResult>;
}

/**
 * Reviewed expected inventory port. Implementations load metadata artifacts
 * only — never hosts, credentials, or legal policy text.
 */
export interface PrivacyExpectedProcessorInventoryPort {
  getInventory(): Promise<PrivacyExpectedProcessorInventory>;
}

/**
 * Provider-neutral subject-data processor. Executes only declared capabilities
 * through strict synthetic command/result contracts.
 */
export interface PrivacySubjectDataProcessor {
  descriptorReference(): PrivacyProcessorDescriptorReference;
  execute(
    command: PrivacySyntheticProcessorCommand,
  ): Promise<PrivacySyntheticProcessorResult>;
}

/** Resolves only processors that were explicitly bound by the composition root. */
export interface PrivacySubjectDataProcessorResolver {
  resolve(processorId: string): Promise<PrivacySubjectDataProcessor | null>;
}

/**
 * Provider-neutral integrity check for synthetic Option A packages/evidence.
 * Adapters verify declared content digests without exposing key material.
 */
export type PrivacyIntegritySubjectKind =
  'policy_package' | 'authorization_evidence';

export type PrivacyIntegrityVerificationResult =
  { status: 'valid' } | { status: 'invalid' } | { status: 'unavailable' };

export interface PrivacyIntegrityVerificationInput {
  kind: PrivacyIntegritySubjectKind;
  subjectId: string;
  contentDigest: string;
  canonicalizationVersion: string;
  synthetic: boolean;
}

export interface PrivacyIntegrityVerifier {
  verify(
    input: PrivacyIntegrityVerificationInput,
  ): Promise<PrivacyIntegrityVerificationResult>;
}

/**
 * Opaque synthetic actor/subject attribution binding. Digests and scope IDs
 * only — never names, emails, documents, or other PII.
 */
export type PrivacyAttributionBinding = {
  actorPrincipalDigest: string;
  subjectScopeId: string;
  synthetic: boolean;
};

export type PrivacyAttributionVerificationResult =
  | { status: 'attributed' }
  | { status: 'unattributed' }
  | { status: 'unavailable' };

export interface PrivacyAttributionVerificationInput {
  actor: PrivacyActorContextReference;
  subjectScopeId: PrivacySubjectScopeId;
  policyVersionId: string;
  evidenceId: string | null;
  productionMode: boolean;
}

export interface PrivacyAttributionVerifier {
  verify(
    input: PrivacyAttributionVerificationInput,
  ): Promise<PrivacyAttributionVerificationResult>;
}

export type PrivacySubjectRequestApplyResult =
  | {
      status: 'advanced';
      request: PrivacySubjectRequestReference;
      transition: PrivacySubjectRequestTransitionReference;
    }
  | {
      status: 'already_terminal';
      request: PrivacySubjectRequestReference;
    }
  | {
      status: 'invalid';
      reason:
        | 'illegal_transition'
        | 'verification_required'
        | 'synthetic_verification_in_production'
        | 'terminal_state'
        | 'not_found';
    }
  | {
      status: 'conflict';
    };

export type PrivacySubjectRequestCreateResult =
  PrivacyReferencePutResult | 'invalid_initial_state';

/**
 * Current-pointer repository plus append-only transition history.
 */
export interface PrivacySubjectRequestRepository {
  get(requestId: string): Promise<PrivacySubjectRequestReference | null>;
  /**
   * Creates the only valid initial pointer and replaces its untrusted
   * `updatedAt` value with a timestamp supplied by the trusted coordinator.
   */
  createReceived(
    record: PrivacySubjectRequestReference,
    receivedAt: string,
  ): Promise<PrivacySubjectRequestCreateResult>;
  listTransitions(
    requestId: string,
  ): Promise<readonly PrivacySubjectRequestTransitionReference[]>;
  applyTransition(input: {
    requestId: string;
    next: PrivacySubjectRequestState;
    updatedAt: string;
    transitionId: PrivacySubjectRequestTransitionId;
    operationId: PrivacyOperationId;
    correlationId: PrivacyCorrelationId;
    reasonCode?: PrivacySubjectRequestTransitionReason | null;
    verification?: PrivacyVerificationReference | null;
    productionMode?: boolean;
  }): Promise<PrivacySubjectRequestApplyResult>;
}

/**
 * Persisted retention preview evidence, keyed by the deterministic
 * `selectionDigest` computed by `planRetentionPreview`. A preview is
 * accepted at most once per digest. `markExecuted` performs the atomic
 * synthetic/disposable `planned` -> `executed` transition and binds the winner
 * to one operation ID plus canonical input digest so only an identical request
 * can replay idempotently and one operation cannot own multiple previews.
 */
export interface PrivacyRetentionPreviewRepository {
  getBySelectionDigest(
    selectionDigest: string,
  ): Promise<PrivacyRetentionPreviewRecord | null>;
  put(
    record: PrivacyRetentionPreviewRecord,
  ): Promise<PrivacyReferencePutResult>;
  markExecuted(input: {
    selectionDigest: string;
    operationId: PrivacyOperationId;
    inputDigest: string;
    executedAt: string;
  }): Promise<PrivacyRetentionPreviewExecutionResult>;
}

export type PrivacyRetentionPreviewExecutionResult =
  'executed' | 'idempotent_replay' | 'conflict' | 'not_found';

/**
 * Append-only per-processor execution attempts for a subject request.
 * `append` conflicts only on `stepId` reuse; the same (requestId,
 * processorId, capability) pair may have multiple steps across retries.
 */
export interface PrivacyProcessorStepRepository {
  append(
    step: PrivacyProcessorStepReference,
  ): Promise<PrivacyReferencePutResult>;
  listForRequest(
    requestId: string,
  ): Promise<readonly PrivacyProcessorStepReference[]>;
}

export interface PrivacyDataUsePorts {
  clock: PrivacyTrustedClock;
  ids: PrivacyIdFactory;
  audit: PrivacyAuditSink;
  policies: PrivacyPolicyPackageRepository;
  purposes: PrivacyPurposeRegistry;
  evidence: PrivacyAuthorizationEvidenceLedger;
  processors: PrivacyRuntimeProcessorRegistry;
  /**
   * Reviewed expected inventory. Synthetic execution requires an exact entry
   * binding (digest / environment / readiness / attribution metadata).
   */
  expectedInventory: PrivacyExpectedProcessorInventoryPort;
  /**
   * Verifies sealed content digests for policy/evidence after inventory bind
   * and before processor execution. Missing/unavailable verifiers fail closed.
   */
  integrityVerifier: PrivacyIntegrityVerifier;
  /**
   * Verifies sealed synthetic actor/subject attribution after integrity and
   * before processor execution. Failures deny as `policy_unattributed`.
   */
  attributionVerifier: PrivacyAttributionVerifier;
  processorResolver: PrivacySubjectDataProcessorResolver;
}

export interface PrivacyDataUseEvaluationInput {
  actor: PrivacyActorContextReference;
  purposeVersionId: string;
  policyVersionId: string;
  operationKind: PrivacyOperationKind;
  engineeringCategoryId: PrivacyEngineeringCategoryId;
  processorId: string;
  processorCapability: 'access';
  evidenceId: string | null;
  subjectScopeId: PrivacySubjectScopeId;
  /** When true, synthetic actor/policy/processor inputs are denied. */
  productionMode: boolean;
}

type PrivacyDeniedDataUseDecision = Extract<
  PrivacyDataUseDecision,
  { outcome: 'denied' }
>;

type PrivacyAuditUnavailableDecision = Omit<
  PrivacyDeniedDataUseDecision,
  'reasonCode'
> & {
  reasonCode: 'audit_unavailable';
};

export type PrivacyDataUseEvaluationResult =
  | {
      status: 'evaluated';
      decision: PrivacyDataUseDecision;
    }
  | {
      status: 'audit_unavailable';
      decision: PrivacyAuditUnavailableDecision;
    };

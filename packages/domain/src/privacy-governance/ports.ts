import type {
  PrivacyActorContextReference,
  PrivacyAuditEventId,
  PrivacyAuditEventReference,
  PrivacyCorrelationId,
  PrivacyDataUseDecision,
  PrivacyEngineeringCategoryId,
  PrivacyEvidenceReference,
  PrivacyExpectedProcessorInventory,
  PrivacyOperationId,
  PrivacyOperationKind,
  PrivacyPolicyPackageReference,
  PrivacyProcessorDescriptorReference,
  PrivacyPurposeVersionReference,
  PrivacySubjectRequestReference,
  PrivacySubjectRequestState,
  PrivacySubjectRequestTransitionId,
  PrivacySubjectRequestTransitionReason,
  PrivacySubjectRequestTransitionReference,
  PrivacySubjectScopeId,
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

export interface PrivacyRuntimeProcessorRegistry {
  getDescriptor(
    processorId: string,
  ): Promise<PrivacyProcessorDescriptorReference | null>;
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

/**
 * Current-pointer repository plus append-only transition history.
 */
export interface PrivacySubjectRequestRepository {
  get(requestId: string): Promise<PrivacySubjectRequestReference | null>;
  put(
    record: PrivacySubjectRequestReference,
  ): Promise<PrivacyReferencePutResult>;
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

export interface PrivacyDataUsePorts {
  clock: PrivacyTrustedClock;
  ids: PrivacyIdFactory;
  audit: PrivacyAuditSink;
  policies: PrivacyPolicyPackageRepository;
  purposes: PrivacyPurposeRegistry;
  evidence: PrivacyAuthorizationEvidenceLedger;
  processors: PrivacyRuntimeProcessorRegistry;
}

export interface PrivacyDataUseEvaluationInput {
  actor: PrivacyActorContextReference;
  purposeVersionId: string;
  policyVersionId: string;
  operationKind: PrivacyOperationKind;
  engineeringCategoryId: PrivacyEngineeringCategoryId;
  processorId: string;
  evidenceId: string | null;
  subjectScopeId: PrivacySubjectScopeId;
  /** When true, synthetic actor/policy/processor inputs are denied. */
  productionMode: boolean;
}

export type PrivacyDataUseEvaluationResult =
  | {
      status: 'evaluated';
      decision: PrivacyDataUseDecision;
    }
  | {
      status: 'audit_unavailable';
      decision: PrivacyDataUseDecision;
    };

import type {
  PrivacyActorContextReference,
  PrivacyAuditEventId,
  PrivacyAuditEventReference,
  PrivacyCorrelationId,
  PrivacyDataUseDecision,
  PrivacyEngineeringCategoryId,
  PrivacyEvidenceReference,
  PrivacyOperationId,
  PrivacyOperationKind,
  PrivacyPolicyPackageReference,
  PrivacyProcessorDescriptorReference,
  PrivacyPurposeVersionReference,
  PrivacySubjectScopeId,
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

export interface PrivacyPolicyPackageRepository {
  getActive(versionId: string): Promise<PrivacyPolicyPackageReference | null>;
}

export interface PrivacyPurposeRegistry {
  getVersion(
    purposeVersionId: string,
  ): Promise<PrivacyPurposeVersionReference | null>;
}

export interface PrivacyAuthorizationEvidenceLedger {
  getEvidence(evidenceId: string): Promise<PrivacyEvidenceReference | null>;
  getAuthoritativeWithdrawal(
    evidenceId: string,
  ): Promise<PrivacyWithdrawalReference | null>;
}

export interface PrivacyRuntimeProcessorRegistry {
  getDescriptor(
    processorId: string,
  ): Promise<PrivacyProcessorDescriptorReference | null>;
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

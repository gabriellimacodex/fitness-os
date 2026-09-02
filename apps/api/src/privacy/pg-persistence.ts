import type { PostgresConnection } from '@fitness-os/database';
import {
  createPostgresPrivacyAuditSink,
  createPostgresPrivacyAuthorizationEvidenceLedger,
  createPostgresPrivacyGovernanceLifecycleLedger,
  createPostgresPrivacyPolicyPackageRepository,
  createPostgresPrivacyProcessorStepRepository,
  createPostgresPrivacyPurposeRegistry,
  createPostgresPrivacyRetentionPreviewRepository,
  createPostgresPrivacyRuntimeProcessorRegistry,
  createPostgresPrivacySubjectRequestRepository,
} from '@fitness-os/database';
import type {
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyGovernanceLifecycleLedger,
  PrivacyPolicyPackageRepository,
  PrivacyProcessorStepRepository,
  PrivacyPurposeRegistry,
  PrivacyRetentionPreviewRepository,
  PrivacyRuntimeProcessorRegistry,
  PrivacySubjectRequestRepository,
} from '@fitness-os/domain';

/**
 * Disposable synthetic privacy persistence bundle.
 * Compose only behind `allowSyntheticPrivacy`. Does not clear LEGAL_PRIVACY.
 */
export type PrivacyPgPersistence = {
  audit: PrivacyAuditSink;
  evidence: PrivacyAuthorizationEvidenceLedger;
  subjectRequests: PrivacySubjectRequestRepository;
  policies: PrivacyPolicyPackageRepository;
  purposes: PrivacyPurposeRegistry;
  processors: PrivacyRuntimeProcessorRegistry;
  processorSteps: PrivacyProcessorStepRepository;
  governanceLifecycle: PrivacyGovernanceLifecycleLedger;
  retentionPreviews: PrivacyRetentionPreviewRepository;
};

export function createPrivacyPgPersistence(
  connection: PostgresConnection,
): PrivacyPgPersistence {
  return {
    audit: createPostgresPrivacyAuditSink(connection),
    evidence: createPostgresPrivacyAuthorizationEvidenceLedger(connection),
    subjectRequests: createPostgresPrivacySubjectRequestRepository(connection),
    policies: createPostgresPrivacyPolicyPackageRepository(connection),
    purposes: createPostgresPrivacyPurposeRegistry(connection),
    processors: createPostgresPrivacyRuntimeProcessorRegistry(connection),
    processorSteps: createPostgresPrivacyProcessorStepRepository(connection),
    governanceLifecycle:
      createPostgresPrivacyGovernanceLifecycleLedger(connection),
    retentionPreviews:
      createPostgresPrivacyRetentionPreviewRepository(connection),
  };
}

import type { PostgresConnection } from '@fitness-os/database';
import {
  createPostgresPrivacyAuditSink,
  createPostgresPrivacyAuthorizationEvidenceLedger,
  createPostgresPrivacyPolicyPackageRepository,
  createPostgresPrivacyPurposeRegistry,
  createPostgresPrivacyRuntimeProcessorRegistry,
  createPostgresPrivacySubjectRequestRepository,
} from '@fitness-os/database';
import type {
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyPolicyPackageRepository,
  PrivacyPurposeRegistry,
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
  };
}

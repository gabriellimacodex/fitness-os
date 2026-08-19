import type { PostgresConnection } from '@fitness-os/database';
import {
  createPostgresPrivacyAuditSink,
  createPostgresPrivacyAuthorizationEvidenceLedger,
  createPostgresPrivacySubjectRequestRepository,
} from '@fitness-os/database';
import type {
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
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
};

export function createPrivacyPgPersistence(
  connection: PostgresConnection,
): PrivacyPgPersistence {
  return {
    audit: createPostgresPrivacyAuditSink(connection),
    evidence: createPostgresPrivacyAuthorizationEvidenceLedger(connection),
    subjectRequests: createPostgresPrivacySubjectRequestRepository(connection),
  };
}

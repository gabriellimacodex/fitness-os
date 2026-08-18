export { evaluateDataUse } from './data-use.js';
export type {
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyDataUseEvaluationInput,
  PrivacyDataUseEvaluationResult,
  PrivacyDataUsePorts,
  PrivacyIdFactory,
  PrivacyPolicyPackageRepository,
  PrivacyPurposeRegistry,
  PrivacyRuntimeProcessorRegistry,
  PrivacyTrustedClock,
} from './ports.js';
export {
  isTerminalSubjectRequestState,
  transitionSubjectRequest,
  type SubjectRequestTransitionResult,
} from './request.js';
export {
  authorizeRetentionExecution,
  planRetentionPreview,
  type RetentionExecutionAuthorization,
  type RetentionPreviewPlan,
} from './retention.js';
export {
  createSyntheticPrivacyDataUsePorts,
  SyntheticPrivacyAuditSink,
  SyntheticPrivacyAuthorizationEvidenceLedger,
  SyntheticPrivacyIdFactory,
  SyntheticPrivacyPolicyPackageRepository,
  SyntheticPrivacyPurposeRegistry,
  SyntheticPrivacyRuntimeProcessorRegistry,
  SyntheticPrivacyTrustedClock,
} from './synthetic.js';
export {
  authoritativeEvidenceState,
  planWithdrawal,
  type AuthoritativeEvidenceState,
  type WithdrawalPlanResult,
} from './withdrawal.js';

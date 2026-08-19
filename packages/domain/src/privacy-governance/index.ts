export { evaluateDataUse } from './data-use.js';
export {
  compareExpectedInventoryToRuntime,
  type InventoryCoverageMismatch,
  type InventoryCoverageResult,
} from './inventory-coverage.js';
export type {
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyDataUseEvaluationInput,
  PrivacyDataUseEvaluationResult,
  PrivacyDataUsePorts,
  PrivacyEvidenceAppendResult,
  PrivacyExpectedProcessorInventoryPort,
  PrivacyIdFactory,
  PrivacyPolicyPackageRepository,
  PrivacyPurposeRegistry,
  PrivacyReferencePutResult,
  PrivacyRuntimeProcessorRegistry,
  PrivacySubjectDataProcessor,
  PrivacySubjectRequestApplyResult,
  PrivacySubjectRequestRepository,
  PrivacyTrustedClock,
  PrivacyWithdrawalAppendResult,
} from './ports.js';
export {
  composeSyntheticProcessorSimulation,
  SyntheticPrivacySubjectDataProcessor,
} from './processor.js';
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
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacyIdFactory,
  SyntheticPrivacyPolicyPackageRepository,
  SyntheticPrivacyPurposeRegistry,
  SyntheticPrivacyRuntimeProcessorRegistry,
  SyntheticPrivacySubjectRequestRepository,
  SyntheticPrivacyTrustedClock,
} from './synthetic.js';
export {
  authoritativeEvidenceState,
  planWithdrawal,
  type AuthoritativeEvidenceState,
  type WithdrawalPlanResult,
} from './withdrawal.js';

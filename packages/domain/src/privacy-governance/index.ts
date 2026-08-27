export { evaluateDataUse } from './data-use.js';
export {
  compareExpectedInventoryToRuntime,
  type InventoryCoverageMismatch,
  type InventoryCoverageResult,
} from './inventory-coverage.js';
export type {
  PrivacyAttributionBinding,
  PrivacyAttributionVerificationInput,
  PrivacyAttributionVerificationResult,
  PrivacyAttributionVerifier,
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyDataUseEvaluationInput,
  PrivacyDataUseEvaluationResult,
  PrivacyDataUsePorts,
  PrivacyEvidenceAppendResult,
  PrivacyExpectedProcessorInventoryPort,
  PrivacyGovernanceLifecycleAppendResult,
  PrivacyGovernanceLifecycleLedger,
  PrivacyIdFactory,
  PrivacyIntegritySubjectKind,
  PrivacyIntegrityVerificationInput,
  PrivacyIntegrityVerificationResult,
  PrivacyIntegrityVerifier,
  PrivacyPolicyPackageRepository,
  PrivacyProcessorStepRepository,
  PrivacyPurposeRegistry,
  PrivacyReferencePutResult,
  PrivacyRuntimeProcessorRegistry,
  PrivacySubjectDataProcessor,
  PrivacySubjectDataProcessorResolver,
  PrivacySubjectRequestApplyResult,
  PrivacySubjectRequestCreateResult,
  PrivacySubjectRequestRepository,
  PrivacyTrustedClock,
  PrivacyWithdrawalAppendResult,
} from './ports.js';
export {
  composeSyntheticProcessorSimulation,
  SyntheticPrivacySubjectDataProcessor,
} from './processor.js';
export {
  deriveRequestCompletionFromSteps,
  type ExpectedProcessorStep,
  type RequestCompletionStatus,
} from './processor-step.js';
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
  SyntheticPrivacyAttributionVerifier,
  SyntheticPrivacyAuditSink,
  SyntheticPrivacyAuthorizationEvidenceLedger,
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacyGovernanceLifecycleLedger,
  SyntheticPrivacyIdFactory,
  SyntheticPrivacyIntegrityVerifier,
  SyntheticPrivacyPolicyPackageRepository,
  SyntheticPrivacyProcessorStepRepository,
  SyntheticPrivacyPurposeRegistry,
  SyntheticPrivacyRuntimeProcessorRegistry,
  SyntheticPrivacySubjectRequestRepository,
  SyntheticPrivacySubjectDataProcessorResolver,
  SyntheticPrivacyTrustedClock,
} from './synthetic.js';
export {
  authoritativeEvidenceState,
  planWithdrawal,
  type AuthoritativeEvidenceState,
  type WithdrawalPlanResult,
} from './withdrawal.js';

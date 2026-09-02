import type { PrivacyGovernanceLifecycleBinding } from '@fitness-os/schemas';

import type {
  PrivacyGovernanceExecutionReceiptSource,
  PrivacyGovernanceLifecycleBindingVerifier,
} from './ports.js';

function sameBinding(
  expected: PrivacyGovernanceLifecycleBinding,
  presented: PrivacyGovernanceLifecycleBinding,
): boolean {
  return (
    expected.requestId === presented.requestId &&
    expected.processorId === presented.processorId &&
    expected.operationId === presented.operationId &&
    expected.result.outcome === presented.result.outcome &&
    (expected.result.outcome === 'denied' ||
      (presented.result.outcome !== 'denied' &&
        expected.result.proofId === presented.result.proofId))
  );
}

/**
 * Verifies caller-presented lifecycle output against one independently
 * supplied execution/coordinator receipt before the proof ledger is appended.
 */
export function createPrivacyGovernanceExecutionReceiptVerifier(
  source: PrivacyGovernanceExecutionReceiptSource,
): PrivacyGovernanceLifecycleBindingVerifier {
  return {
    verify: async (presented) => {
      let receipts: readonly PrivacyGovernanceLifecycleBinding[];
      try {
        receipts = await source.listByOperationId(presented.operationId);
      } catch {
        return { status: 'unavailable' };
      }
      const [receipt] = receipts;
      if (
        receipts.length !== 1 ||
        receipt === undefined ||
        !sameBinding(receipt, presented)
      ) {
        return { status: 'invalid' };
      }

      return { binding: receipt, status: 'verified' };
    },
  };
}

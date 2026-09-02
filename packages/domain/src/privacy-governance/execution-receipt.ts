import {
  privacyProcessorExecutionReceiptSchema,
  type PrivacyGovernanceLifecycleBinding,
  type PrivacyProcessorExecutionBinding,
  type PrivacyProcessorExecutionReceipt,
} from '@fitness-os/schemas';

import type {
  PrivacyGovernanceExecutionReceiptSource,
  PrivacyGovernanceLifecycleBindingVerifier,
  PrivacyProcessorExecutionReceiptSource,
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

const sameProcessorExecutionBinding = (
  expected: PrivacyProcessorExecutionReceipt,
  presented: PrivacyProcessorExecutionBinding,
): boolean =>
  expected.requestId === presented.requestId &&
  expected.processorId === presented.processorId &&
  expected.capability === presented.capability &&
  expected.operationId === presented.operationId &&
  expected.correlationId === presented.correlationId;

export type PrivacyProcessorExecutionReceiptVerificationResult =
  | { status: 'verified'; receipt: PrivacyProcessorExecutionReceipt }
  | { status: 'invalid' }
  | { status: 'unavailable' };

/** Resolves one exact processor outcome from an independent receipt source. */
export function createPrivacyProcessorExecutionReceiptVerifier(
  source: PrivacyProcessorExecutionReceiptSource,
): {
  verify(
    input: PrivacyProcessorExecutionBinding,
  ): Promise<PrivacyProcessorExecutionReceiptVerificationResult>;
} {
  return {
    verify: async (presented) => {
      let receipts: readonly PrivacyProcessorExecutionReceipt[];
      try {
        receipts = await source.listByOperationId(presented.operationId);
      } catch {
        return { status: 'unavailable' };
      }
      if (!Array.isArray(receipts) || receipts.length !== 1) {
        return { status: 'invalid' };
      }
      const parsed = privacyProcessorExecutionReceiptSchema.safeParse(
        receipts[0],
      );
      if (
        !parsed.success ||
        !sameProcessorExecutionBinding(parsed.data, presented)
      ) {
        return { status: 'invalid' };
      }
      return { receipt: parsed.data, status: 'verified' };
    },
  };
}

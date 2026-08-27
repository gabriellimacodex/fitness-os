import {
  canonicalizePrivacyExpectedProcessorInventory,
  type PrivacyExpectedProcessorInventory,
  type PrivacyProcessorCapability,
  type PrivacySubjectRequestType,
  type PrivacyUnsupportedCapabilityRationale,
} from '@fitness-os/schemas';

import type { ExpectedProcessorStep } from './processor-step.js';

/** Engineering mapping only — not a legal entitlement decision. */
const REQUEST_TYPE_CAPABILITY: Record<
  PrivacySubjectRequestType,
  PrivacyProcessorCapability
> = {
  access: 'access',
  export: 'export',
  deletion: 'delete',
};

export interface ProcessorPlanExclusion {
  processorId: string;
  capability: PrivacyProcessorCapability;
  rationale: PrivacyUnsupportedCapabilityRationale;
}

export type BuildRequestProcessorPlanResult =
  | {
      status: 'planned';
      steps: readonly ExpectedProcessorStep[];
      excluded: readonly ProcessorPlanExclusion[];
    }
  | {
      status: 'incomplete';
      undeclaredProcessorIds: readonly string[];
    }
  | { status: 'empty_inventory' };

function compareProcessorId(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Pins the exact processor plan for a request type against a reviewed
 * expected inventory (TD 021 "Planning and execution" steps 3-4): one step
 * per processor that declares the mapped capability, in stable processor-ID
 * order. A processor that neither supports nor explicitly exempts (with a
 * closed rationale) the mapped capability leaves the plan visibly
 * `incomplete` rather than silently omitting it. An empty inventory is never
 * treated as a vacuously complete plan — mirrors the same non-vacuous rule
 * applied to `deriveRequestCompletionFromSteps`'s `expected` set.
 */
export function buildRequestProcessorPlan(input: {
  requestType: PrivacySubjectRequestType;
  expected: PrivacyExpectedProcessorInventory;
}): BuildRequestProcessorPlanResult {
  const expected = canonicalizePrivacyExpectedProcessorInventory(
    input.expected,
  );

  if (expected.processors.length === 0) {
    return { status: 'empty_inventory' };
  }

  const capability = REQUEST_TYPE_CAPABILITY[input.requestType];

  const steps: ExpectedProcessorStep[] = [];
  const excluded: ProcessorPlanExclusion[] = [];
  const undeclaredProcessorIds: string[] = [];

  for (const processor of expected.processors) {
    if (processor.supportedCapabilities.includes(capability)) {
      steps.push({ capability, processorId: processor.processorId });
      continue;
    }

    const exemption = processor.unsupportedCapabilities.find(
      (entry) => entry.capability === capability,
    );

    if (exemption !== undefined) {
      excluded.push({
        capability,
        processorId: processor.processorId,
        rationale: exemption.rationale,
      });
      continue;
    }

    undeclaredProcessorIds.push(processor.processorId);
  }

  if (undeclaredProcessorIds.length > 0) {
    return {
      status: 'incomplete',
      undeclaredProcessorIds: [...undeclaredProcessorIds].sort(
        compareProcessorId,
      ),
    };
  }

  return {
    excluded,
    status: 'planned',
    steps: [...steps].sort((left, right) =>
      compareProcessorId(left.processorId, right.processorId),
    ),
  };
}

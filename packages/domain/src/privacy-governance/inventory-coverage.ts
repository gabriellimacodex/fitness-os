import {
  canonicalizePrivacyExpectedProcessorInventory,
  canonicalizePrivacyProcessorDescriptorReference,
  type PrivacyExpectedProcessorInventory,
  type PrivacyProcessorCapability,
  type PrivacyProcessorDescriptorReference,
  type PrivacyReadinessDiagnosticCode,
} from '@fitness-os/schemas';

export type InventoryCoverageMismatch = {
  diagnosticCode: Extract<
    PrivacyReadinessDiagnosticCode,
    'inventory_mismatch' | 'processor_missing' | 'handler_missing'
  >;
  processorId: string | null;
  detail: string;
};

export type InventoryCoverageResult =
  | { status: 'matched' }
  | {
      status: 'mismatched';
      mismatches: readonly InventoryCoverageMismatch[];
    };

/**
 * Exact expected-vs-runtime processor coverage. Extra runtime processors and
 * missing expected handlers fail. Does not claim production readiness.
 */
export function compareExpectedInventoryToRuntime(input: {
  expected: PrivacyExpectedProcessorInventory;
  runtime: readonly PrivacyProcessorDescriptorReference[];
}): InventoryCoverageResult {
  const expected = canonicalizePrivacyExpectedProcessorInventory(
    input.expected,
  );
  const runtimeById = new Map(
    input.runtime.map((descriptor) => {
      const canonical =
        canonicalizePrivacyProcessorDescriptorReference(descriptor);
      return [canonical.processorId, canonical] as const;
    }),
  );

  const mismatches: InventoryCoverageMismatch[] = [];
  const expectedIds = new Set(
    expected.processors.map((processor) => processor.processorId),
  );

  for (const processor of expected.processors) {
    const runtime = runtimeById.get(processor.processorId);
    if (runtime === undefined) {
      mismatches.push({
        detail: 'expected_processor_absent_from_runtime',
        diagnosticCode: 'processor_missing',
        processorId: processor.processorId,
      });
      continue;
    }

    if (
      runtime.inventoryId !== processor.inventoryId ||
      runtime.descriptorDigest !== processor.descriptorDigest ||
      runtime.inventoryVersionDigest !== expected.inventoryVersionDigest ||
      runtime.synthetic !== processor.synthetic
    ) {
      mismatches.push({
        detail: 'descriptor_or_inventory_binding_mismatch',
        diagnosticCode: 'inventory_mismatch',
        processorId: processor.processorId,
      });
    }

    const runtimeCapabilities = new Set<PrivacyProcessorCapability>(
      runtime.capabilities,
    );
    for (const capability of processor.supportedCapabilities) {
      if (!runtimeCapabilities.has(capability)) {
        mismatches.push({
          detail: `missing_handler:${capability}`,
          diagnosticCode: 'handler_missing',
          processorId: processor.processorId,
        });
      }
    }
  }

  for (const runtime of runtimeById.values()) {
    if (!expectedIds.has(runtime.processorId)) {
      mismatches.push({
        detail: 'undeclared_runtime_processor',
        diagnosticCode: 'inventory_mismatch',
        processorId: runtime.processorId,
      });
    }
  }

  if (mismatches.length > 0) {
    return { mismatches, status: 'mismatched' };
  }

  return { status: 'matched' };
}

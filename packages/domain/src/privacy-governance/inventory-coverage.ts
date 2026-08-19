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
 * missing expected handlers/purposes/categories fail. Does not claim
 * production readiness.
 */
export function compareExpectedInventoryToRuntime(input: {
  expected: PrivacyExpectedProcessorInventory;
  runtime: readonly PrivacyProcessorDescriptorReference[];
}): InventoryCoverageResult {
  const expected = canonicalizePrivacyExpectedProcessorInventory(
    input.expected,
  );
  const mismatches: InventoryCoverageMismatch[] = [];
  const runtimeById = new Map<string, PrivacyProcessorDescriptorReference>();

  for (const descriptor of input.runtime) {
    const canonical =
      canonicalizePrivacyProcessorDescriptorReference(descriptor);
    if (runtimeById.has(canonical.processorId)) {
      mismatches.push({
        detail: 'duplicate_runtime_processor_id',
        diagnosticCode: 'inventory_mismatch',
        processorId: canonical.processorId,
      });
      continue;
    }
    runtimeById.set(canonical.processorId, canonical);
  }

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

    const runtimePurposes = new Set(runtime.allowedPurposeIds);
    for (const purposeId of processor.allowedPurposeIds) {
      if (!runtimePurposes.has(purposeId)) {
        mismatches.push({
          detail: `missing_purpose:${purposeId}`,
          diagnosticCode: 'inventory_mismatch',
          processorId: processor.processorId,
        });
      }
    }

    const runtimeCategories = new Set(runtime.allowedCategoryIds);
    for (const categoryId of processor.allowedCategoryIds) {
      if (!runtimeCategories.has(categoryId)) {
        mismatches.push({
          detail: `missing_category:${categoryId}`,
          diagnosticCode: 'inventory_mismatch',
          processorId: processor.processorId,
        });
      }
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

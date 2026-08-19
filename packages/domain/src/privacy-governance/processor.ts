import { createHash } from 'node:crypto';

import {
  privacySyntheticProcessorCommandSchema,
  privacySyntheticProcessorResultSchema,
  type PrivacyProcessorCapability,
  type PrivacyProcessorDescriptorReference,
  type PrivacySyntheticProcessorCommand,
  type PrivacySyntheticProcessorFamilyCoverage,
  type PrivacySyntheticProcessorResult,
} from '@fitness-os/schemas';

import type { PrivacySubjectDataProcessor } from './ports.js';

const SUPPORTED_SIMULATION: ReadonlySet<PrivacyProcessorCapability> = new Set([
  'inventory',
  'access',
]);

function familyCoverage(
  family: PrivacySyntheticProcessorFamilyCoverage['family'],
  seed: string,
): PrivacySyntheticProcessorFamilyCoverage {
  return {
    coverageDigest: createHash('sha256').update(seed).digest('hex'),
    family,
    recordCount: 0,
  };
}

/**
 * Provider-neutral synthetic SubjectDataProcessor. Executes only declared
 * inventory/access capabilities; never activates production paths.
 */
export class SyntheticPrivacySubjectDataProcessor implements PrivacySubjectDataProcessor {
  constructor(
    private readonly descriptor: PrivacyProcessorDescriptorReference,
    private readonly families: readonly PrivacySyntheticProcessorFamilyCoverage['family'][],
  ) {}

  descriptorReference(): PrivacyProcessorDescriptorReference {
    return this.descriptor;
  }

  async execute(
    command: PrivacySyntheticProcessorCommand,
  ): Promise<PrivacySyntheticProcessorResult> {
    const valid = privacySyntheticProcessorCommandSchema.parse(command);

    if (valid.processorId !== this.descriptor.processorId) {
      return privacySyntheticProcessorResultSchema.parse({
        accessLocatorDigest: null,
        capability: valid.capability,
        correlationId: valid.correlationId,
        families: [],
        operationId: valid.operationId,
        reasonCode: 'capability_not_declared',
        status: 'denied',
      });
    }

    if (valid.productionMode === true && this.descriptor.synthetic) {
      return privacySyntheticProcessorResultSchema.parse({
        accessLocatorDigest: null,
        capability: valid.capability,
        correlationId: valid.correlationId,
        families: [],
        operationId: valid.operationId,
        reasonCode: 'synthetic_processor_in_production',
        status: 'denied',
      });
    }

    if (!this.descriptor.capabilities.includes(valid.capability)) {
      return privacySyntheticProcessorResultSchema.parse({
        accessLocatorDigest: null,
        capability: valid.capability,
        correlationId: valid.correlationId,
        families: [],
        operationId: valid.operationId,
        reasonCode: 'capability_not_declared',
        status: 'denied',
      });
    }

    if (!SUPPORTED_SIMULATION.has(valid.capability)) {
      return privacySyntheticProcessorResultSchema.parse({
        accessLocatorDigest: null,
        capability: valid.capability,
        correlationId: valid.correlationId,
        families: [],
        operationId: valid.operationId,
        reasonCode: 'unsupported_capability',
        status: 'unsupported',
      });
    }

    const families = this.families.map((family) =>
      familyCoverage(
        family,
        `${this.descriptor.processorId}:${valid.capability}:${family}`,
      ),
    );

    if (valid.capability === 'inventory') {
      return privacySyntheticProcessorResultSchema.parse({
        accessLocatorDigest: null,
        capability: 'inventory',
        correlationId: valid.correlationId,
        families,
        operationId: valid.operationId,
        reasonCode: null,
        status: 'completed',
      });
    }

    return privacySyntheticProcessorResultSchema.parse({
      accessLocatorDigest: createHash('sha256')
        .update(
          `${this.descriptor.processorId}:${valid.subjectScopeId}:${valid.operationId}`,
        )
        .digest('hex'),
      capability: 'access',
      correlationId: valid.correlationId,
      families,
      operationId: valid.operationId,
      reasonCode: null,
      status: 'completed',
    });
  }
}

export function composeSyntheticProcessorSimulation(input: {
  processors: readonly SyntheticPrivacySubjectDataProcessor[];
}): {
  runtimeDescriptors: PrivacyProcessorDescriptorReference[];
} {
  return {
    runtimeDescriptors: input.processors.map((processor) =>
      processor.descriptorReference(),
    ),
  };
}

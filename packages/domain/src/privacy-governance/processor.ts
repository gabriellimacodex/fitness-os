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
  'export',
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

function denied(
  command: PrivacySyntheticProcessorCommand,
  reasonCode:
    | 'capability_not_declared'
    | 'synthetic_processor_in_production'
    | 'unsupported_capability',
  status: 'denied' | 'unsupported' = 'denied',
): PrivacySyntheticProcessorResult {
  return privacySyntheticProcessorResultSchema.parse({
    accessLocatorDigest: null,
    capability: command.capability,
    correlationId: command.correlationId,
    exportManifestDigest: null,
    families: [],
    operationId: command.operationId,
    reasonCode,
    status,
  });
}

/**
 * Provider-neutral synthetic SubjectDataProcessor. Executes only declared
 * inventory/access/export capabilities; never activates production paths or
 * returns subject payloads.
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
      return denied(valid, 'capability_not_declared');
    }

    if (valid.productionMode === true && this.descriptor.synthetic) {
      return denied(valid, 'synthetic_processor_in_production');
    }

    if (!this.descriptor.capabilities.includes(valid.capability)) {
      return denied(valid, 'capability_not_declared');
    }

    if (!SUPPORTED_SIMULATION.has(valid.capability)) {
      return denied(valid, 'unsupported_capability', 'unsupported');
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
        exportManifestDigest: null,
        families,
        operationId: valid.operationId,
        reasonCode: null,
        status: 'completed',
      });
    }

    if (valid.capability === 'export') {
      return privacySyntheticProcessorResultSchema.parse({
        accessLocatorDigest: null,
        capability: 'export',
        correlationId: valid.correlationId,
        exportManifestDigest: createHash('sha256')
          .update(
            [
              this.descriptor.processorId,
              valid.subjectScopeId,
              valid.operationId,
              ...families.map((family) => family.coverageDigest),
            ].join(':'),
          )
          .digest('hex'),
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
      exportManifestDigest: null,
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

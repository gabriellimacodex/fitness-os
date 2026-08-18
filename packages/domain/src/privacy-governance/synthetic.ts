import { randomUUID } from 'node:crypto';

import {
  privacyAuditEventIdSchema,
  privacyCorrelationIdSchema,
  privacyOperationIdSchema,
  privacySubjectScopeIdSchema,
  type PrivacyAuditEventReference,
  type PrivacyEvidenceReference,
  type PrivacyPolicyPackageReference,
  type PrivacyProcessorDescriptorReference,
  type PrivacyPurposeVersionReference,
  type PrivacyWithdrawalReference,
} from '@fitness-os/schemas';

import type {
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyDataUsePorts,
  PrivacyIdFactory,
  PrivacyPolicyPackageRepository,
  PrivacyPurposeRegistry,
  PrivacyRuntimeProcessorRegistry,
  PrivacyTrustedClock,
} from './ports.js';

export class SyntheticPrivacyTrustedClock implements PrivacyTrustedClock {
  constructor(private readonly fixedUtcMs: string) {}

  nowUtcMs(): string {
    return this.fixedUtcMs;
  }
}

export class SyntheticPrivacyIdFactory implements PrivacyIdFactory {
  auditEventId() {
    return privacyAuditEventIdSchema.parse(randomUUID());
  }

  correlationId() {
    return privacyCorrelationIdSchema.parse(randomUUID());
  }

  operationId() {
    return privacyOperationIdSchema.parse(randomUUID());
  }

  subjectScopeId() {
    return privacySubjectScopeIdSchema.parse(randomUUID());
  }
}

export class SyntheticPrivacyAuditSink implements PrivacyAuditSink {
  readonly events: PrivacyAuditEventReference[] = [];
  unavailable = false;

  async append(
    event: PrivacyAuditEventReference,
  ): Promise<'accepted' | 'unavailable'> {
    if (this.unavailable) {
      return 'unavailable';
    }

    this.events.push(event);
    return 'accepted';
  }
}

export class SyntheticPrivacyPolicyPackageRepository implements PrivacyPolicyPackageRepository {
  private readonly byVersion = new Map<string, PrivacyPolicyPackageReference>();

  seed(policy: PrivacyPolicyPackageReference): void {
    this.byVersion.set(policy.versionId, policy);
  }

  async getActive(
    versionId: string,
  ): Promise<PrivacyPolicyPackageReference | null> {
    return this.byVersion.get(versionId) ?? null;
  }
}

export class SyntheticPrivacyPurposeRegistry implements PrivacyPurposeRegistry {
  private readonly byVersion = new Map<
    string,
    PrivacyPurposeVersionReference
  >();

  seed(purpose: PrivacyPurposeVersionReference): void {
    this.byVersion.set(purpose.purposeVersionId, purpose);
  }

  async getVersion(
    purposeVersionId: string,
  ): Promise<PrivacyPurposeVersionReference | null> {
    return this.byVersion.get(purposeVersionId) ?? null;
  }
}

export class SyntheticPrivacyAuthorizationEvidenceLedger implements PrivacyAuthorizationEvidenceLedger {
  private readonly evidence = new Map<string, PrivacyEvidenceReference>();
  private readonly withdrawals = new Map<string, PrivacyWithdrawalReference>();

  seedEvidence(record: PrivacyEvidenceReference): void {
    this.evidence.set(record.evidenceId, record);
  }

  seedWithdrawal(record: PrivacyWithdrawalReference): void {
    this.withdrawals.set(record.evidenceId, record);
  }

  async getEvidence(
    evidenceId: string,
  ): Promise<PrivacyEvidenceReference | null> {
    return this.evidence.get(evidenceId) ?? null;
  }

  async getAuthoritativeWithdrawal(
    evidenceId: string,
  ): Promise<PrivacyWithdrawalReference | null> {
    return this.withdrawals.get(evidenceId) ?? null;
  }
}

export class SyntheticPrivacyRuntimeProcessorRegistry implements PrivacyRuntimeProcessorRegistry {
  private readonly byId = new Map<
    string,
    PrivacyProcessorDescriptorReference
  >();

  seed(descriptor: PrivacyProcessorDescriptorReference): void {
    this.byId.set(descriptor.processorId, descriptor);
  }

  async getDescriptor(
    processorId: string,
  ): Promise<PrivacyProcessorDescriptorReference | null> {
    return this.byId.get(processorId) ?? null;
  }
}

export function createSyntheticPrivacyDataUsePorts(input?: {
  fixedUtcMs?: string;
}): PrivacyDataUsePorts & {
  audit: SyntheticPrivacyAuditSink;
  evidence: SyntheticPrivacyAuthorizationEvidenceLedger;
  policies: SyntheticPrivacyPolicyPackageRepository;
  processors: SyntheticPrivacyRuntimeProcessorRegistry;
  purposes: SyntheticPrivacyPurposeRegistry;
} {
  return {
    audit: new SyntheticPrivacyAuditSink(),
    clock: new SyntheticPrivacyTrustedClock(
      input?.fixedUtcMs ?? '2026-08-18T12:00:00.000Z',
    ),
    evidence: new SyntheticPrivacyAuthorizationEvidenceLedger(),
    ids: new SyntheticPrivacyIdFactory(),
    policies: new SyntheticPrivacyPolicyPackageRepository(),
    processors: new SyntheticPrivacyRuntimeProcessorRegistry(),
    purposes: new SyntheticPrivacyPurposeRegistry(),
  };
}

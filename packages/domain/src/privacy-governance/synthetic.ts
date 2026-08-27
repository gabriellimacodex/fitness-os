import { randomUUID } from 'node:crypto';

import {
  canonicalizePrivacyExpectedProcessorInventory,
  privacyAuditEventIdSchema,
  privacyCorrelationIdSchema,
  privacyExpectedProcessorInventorySchema,
  privacyOperationIdSchema,
  privacySubjectScopeIdSchema,
  type PrivacyAuditEventReference,
  type PrivacyEvidenceReference,
  type PrivacyExpectedProcessorInventory,
  type PrivacyPolicyPackageReference,
  type PrivacyProcessorDescriptorReference,
  type PrivacyProcessorStepReference,
  type PrivacyPurposeVersionReference,
  type PrivacyRetentionPreviewRecord,
  type PrivacySubjectRequestReference,
  type PrivacySubjectRequestTransitionReference,
  type PrivacyWithdrawalReference,
  privacySubjectRequestTransitionReferenceSchema,
} from '@fitness-os/schemas';

import type {
  PrivacyAttributionBinding,
  PrivacyAttributionVerificationInput,
  PrivacyAttributionVerificationResult,
  PrivacyAttributionVerifier,
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyDataUsePorts,
  PrivacyExpectedProcessorInventoryPort,
  PrivacyIdFactory,
  PrivacyIntegrityVerificationInput,
  PrivacyIntegrityVerificationResult,
  PrivacyIntegrityVerifier,
  PrivacyPolicyPackageRepository,
  PrivacyProcessorStepRepository,
  PrivacyPurposeRegistry,
  PrivacyRetentionPreviewRepository,
  PrivacyRuntimeProcessorRegistry,
  PrivacySubjectRequestRepository,
  PrivacySubjectDataProcessor,
  PrivacySubjectDataProcessorResolver,
  PrivacyTrustedClock,
} from './ports.js';
import { transitionSubjectRequest } from './request.js';
import { planWithdrawal } from './withdrawal.js';

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

  async put(record: PrivacyPolicyPackageReference) {
    if (this.byVersion.has(record.versionId)) {
      return 'conflict' as const;
    }
    this.byVersion.set(record.versionId, record);
    return 'accepted' as const;
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

  async put(record: PrivacyPurposeVersionReference) {
    if (this.byVersion.has(record.purposeVersionId)) {
      return 'conflict' as const;
    }
    this.byVersion.set(record.purposeVersionId, record);
    return 'accepted' as const;
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

  async appendEvidence(record: PrivacyEvidenceReference) {
    if (this.evidence.has(record.evidenceId)) {
      return 'conflict' as const;
    }
    this.evidence.set(record.evidenceId, record);
    return 'accepted' as const;
  }

  async appendWithdrawal(record: PrivacyWithdrawalReference) {
    const planned = planWithdrawal({
      existing: this.withdrawals.get(record.evidenceId) ?? null,
      withdrawalId: record.withdrawalId,
      evidenceId: record.evidenceId,
      operationId: record.operationId,
      withdrawnAt: record.withdrawnAt,
    });

    if (planned.status === 'conflict') {
      return 'conflict' as const;
    }

    if (planned.status === 'already_withdrawn') {
      return 'already_withdrawn' as const;
    }

    this.withdrawals.set(record.evidenceId, planned.withdrawal);
    return planned.status;
  }
}

export class SyntheticPrivacyExpectedProcessorInventory implements PrivacyExpectedProcessorInventoryPort {
  constructor(private readonly inventory: PrivacyExpectedProcessorInventory) {
    privacyExpectedProcessorInventorySchema.parse(inventory);
  }

  async getInventory() {
    return canonicalizePrivacyExpectedProcessorInventory(this.inventory);
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

  async listDescriptors(): Promise<
    readonly PrivacyProcessorDescriptorReference[]
  > {
    return [...this.byId.values()];
  }

  async put(record: PrivacyProcessorDescriptorReference) {
    if (this.byId.has(record.processorId)) {
      return 'conflict' as const;
    }
    this.byId.set(record.processorId, record);
    return 'accepted' as const;
  }
}

export class SyntheticPrivacySubjectDataProcessorResolver implements PrivacySubjectDataProcessorResolver {
  private readonly byId = new Map<string, PrivacySubjectDataProcessor>();

  bind(processor: PrivacySubjectDataProcessor): void {
    this.byId.set(processor.descriptorReference().processorId, processor);
  }

  async resolve(
    processorId: string,
  ): Promise<PrivacySubjectDataProcessor | null> {
    return this.byId.get(processorId) ?? null;
  }
}

export class SyntheticPrivacySubjectRequestRepository implements PrivacySubjectRequestRepository {
  private readonly byId = new Map<string, PrivacySubjectRequestReference>();
  private readonly transitions = new Map<
    string,
    PrivacySubjectRequestTransitionReference[]
  >();
  private readonly transitionIds = new Set<string>();
  private readonly operationIds = new Set<string>();

  async get(requestId: string) {
    return this.byId.get(requestId) ?? null;
  }

  async createReceived(
    record: PrivacySubjectRequestReference,
    receivedAt: string,
  ) {
    if (record.state !== 'received') {
      return 'invalid_initial_state' as const;
    }
    if (this.byId.has(record.requestId)) {
      return 'conflict' as const;
    }
    this.byId.set(record.requestId, { ...record, updatedAt: receivedAt });
    return 'accepted' as const;
  }

  /** Explicit fixture hydration; not part of the production repository port. */
  seedForTest(record: PrivacySubjectRequestReference): void {
    this.byId.set(record.requestId, record);
  }

  async listTransitions(requestId: string) {
    return [...(this.transitions.get(requestId) ?? [])];
  }

  async applyTransition(input: {
    requestId: string;
    next: PrivacySubjectRequestReference['state'];
    updatedAt: string;
    transitionId: PrivacySubjectRequestTransitionReference['transitionId'];
    operationId: PrivacySubjectRequestTransitionReference['operationId'];
    correlationId: PrivacySubjectRequestTransitionReference['correlationId'];
    reasonCode?: PrivacySubjectRequestTransitionReference['reasonCode'];
    verification?: PrivacySubjectRequestReference['verification'];
    productionMode?: boolean;
  }) {
    if (
      this.transitionIds.has(input.transitionId) ||
      this.operationIds.has(input.operationId)
    ) {
      return { status: 'conflict' as const };
    }

    const current = this.byId.get(input.requestId);
    if (current === undefined) {
      return { reason: 'not_found' as const, status: 'invalid' as const };
    }

    const result = transitionSubjectRequest({
      request: current,
      next: input.next,
      updatedAt: input.updatedAt,
      verification: input.verification,
      productionMode: input.productionMode,
    });

    if (result.status !== 'advanced') {
      return result;
    }

    const transition = privacySubjectRequestTransitionReferenceSchema.parse({
      transitionId: input.transitionId,
      requestId: current.requestId,
      previousState: current.state,
      nextState: result.request.state,
      operationId: input.operationId,
      correlationId: input.correlationId,
      reasonCode: input.reasonCode ?? null,
      verificationRefDigest:
        result.request.verification?.verificationRefDigest ?? null,
      recordedAt: input.updatedAt,
    });

    this.byId.set(result.request.requestId, result.request);
    const history = this.transitions.get(current.requestId) ?? [];
    history.push(transition);
    this.transitions.set(current.requestId, history);
    this.transitionIds.add(transition.transitionId);
    this.operationIds.add(transition.operationId);

    return { ...result, transition };
  }
}

export class SyntheticPrivacyProcessorStepRepository implements PrivacyProcessorStepRepository {
  private readonly stepIds = new Set<string>();
  private readonly byRequest = new Map<
    string,
    PrivacyProcessorStepReference[]
  >();

  async append(step: PrivacyProcessorStepReference) {
    if (this.stepIds.has(step.stepId)) {
      return 'conflict' as const;
    }
    this.stepIds.add(step.stepId);
    const history = this.byRequest.get(step.requestId) ?? [];
    history.push(step);
    this.byRequest.set(step.requestId, history);
    return 'accepted' as const;
  }

  async listForRequest(requestId: string) {
    return [...(this.byRequest.get(requestId) ?? [])];
  }
}

const emptyExpectedInventory = new SyntheticPrivacyExpectedProcessorInventory(
  privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: '00000000-0000-4000-8000-000000000000',
    inventoryVersionDigest: '0'.repeat(64),
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: '0000000',
    processors: [],
  }),
);

/**
 * Seals admitted package/evidence digests for later verify(). Production
 * readiness must continue to reject synthetic integrity adapters.
 */
export class SyntheticPrivacyIntegrityVerifier implements PrivacyIntegrityVerifier {
  private readonly sealed = new Map<
    string,
    { contentDigest: string; synthetic: boolean }
  >();

  sealPolicy(policy: PrivacyPolicyPackageReference): void {
    this.sealed.set(`policy_package:${policy.versionId}`, {
      contentDigest: policy.contentDigest,
      synthetic: policy.synthetic,
    });
  }

  sealEvidence(evidence: PrivacyEvidenceReference): void {
    this.sealed.set(`authorization_evidence:${evidence.evidenceId}`, {
      contentDigest: evidence.contentDigest,
      // Evidence locators are mechanism metadata; mark synthetic for Option A.
      synthetic: true,
    });
  }

  clear(): void {
    this.sealed.clear();
  }

  async verify(
    input: PrivacyIntegrityVerificationInput,
  ): Promise<PrivacyIntegrityVerificationResult> {
    const sealed = this.sealed.get(`${input.kind}:${input.subjectId}`);
    if (sealed === undefined) {
      return { status: 'invalid' };
    }
    if (
      sealed.contentDigest !== input.contentDigest ||
      sealed.synthetic !== input.synthetic
    ) {
      return { status: 'invalid' };
    }
    return { status: 'valid' };
  }
}

/**
 * Seals opaque synthetic actor/subject attribution for later verify().
 * Never stores PII — digests and subject-scope IDs only.
 */
export class SyntheticPrivacyAttributionVerifier implements PrivacyAttributionVerifier {
  private readonly evidenceBindings = new Map<
    string,
    PrivacyAttributionBinding
  >();
  private readonly policyBindings = new Map<
    string,
    { actorPrincipalDigest: string; synthetic: boolean }
  >();

  sealPolicyAttribution(
    policyVersionId: string,
    binding: Pick<
      PrivacyAttributionBinding,
      'actorPrincipalDigest' | 'synthetic'
    >,
  ): void {
    this.policyBindings.set(policyVersionId, {
      actorPrincipalDigest: binding.actorPrincipalDigest,
      synthetic: binding.synthetic,
    });
  }

  sealEvidenceAttribution(
    evidenceId: string,
    binding: PrivacyAttributionBinding,
  ): void {
    this.evidenceBindings.set(evidenceId, { ...binding });
  }

  clear(): void {
    this.evidenceBindings.clear();
    this.policyBindings.clear();
  }

  async verify(
    input: PrivacyAttributionVerificationInput,
  ): Promise<PrivacyAttributionVerificationResult> {
    if (!input.productionMode && !input.actor.synthetic) {
      return { status: 'unattributed' };
    }

    const actorDigest = input.actor.principalReferenceDigest;
    if (
      typeof actorDigest !== 'string' ||
      actorDigest.length !== 64 ||
      actorDigest === '0'.repeat(64) ||
      !/^[a-f0-9]{64}$/.test(actorDigest)
    ) {
      return { status: 'unattributed' };
    }

    const subjectScopeId = String(input.subjectScopeId ?? '');
    if (subjectScopeId.length === 0) {
      return { status: 'unattributed' };
    }

    const policyBind = this.policyBindings.get(input.policyVersionId);
    if (policyBind === undefined) {
      return { status: 'unattributed' };
    }
    if (
      policyBind.actorPrincipalDigest !== actorDigest ||
      policyBind.synthetic !== input.actor.synthetic
    ) {
      return { status: 'unattributed' };
    }

    if (input.evidenceId !== null) {
      const evidenceBind = this.evidenceBindings.get(input.evidenceId);
      if (evidenceBind === undefined) {
        return { status: 'unattributed' };
      }
      if (
        evidenceBind.actorPrincipalDigest !== actorDigest ||
        evidenceBind.subjectScopeId !== subjectScopeId ||
        evidenceBind.synthetic !== input.actor.synthetic
      ) {
        return { status: 'unattributed' };
      }
    }

    return { status: 'attributed' };
  }
}

/**
 * In-memory retention preview evidence, keyed by the deterministic
 * `selectionDigest`. A digest is accepted at most once — a repeat `put` is a
 * conflict rather than a silent overwrite, matching persisted append-only
 * evidence elsewhere in this domain.
 */
export class SyntheticPrivacyRetentionPreviewRepository implements PrivacyRetentionPreviewRepository {
  private readonly previews = new Map<string, PrivacyRetentionPreviewRecord>();

  async getBySelectionDigest(
    selectionDigest: string,
  ): Promise<PrivacyRetentionPreviewRecord | null> {
    return this.previews.get(selectionDigest) ?? null;
  }

  async put(
    record: PrivacyRetentionPreviewRecord,
  ): Promise<'accepted' | 'conflict'> {
    if (this.previews.has(record.selectionDigest)) {
      return 'conflict';
    }
    this.previews.set(record.selectionDigest, record);
    return 'accepted';
  }
}

export function createSyntheticPrivacyDataUsePorts(input?: {
  clock?: PrivacyTrustedClock;
  fixedUtcMs?: string;
  ids?: PrivacyIdFactory;
  expectedInventory?: PrivacyExpectedProcessorInventoryPort;
  integrityVerifier?: PrivacyIntegrityVerifier;
  attributionVerifier?: PrivacyAttributionVerifier;
}): PrivacyDataUsePorts & {
  audit: SyntheticPrivacyAuditSink;
  evidence: SyntheticPrivacyAuthorizationEvidenceLedger;
  policies: SyntheticPrivacyPolicyPackageRepository;
  processors: SyntheticPrivacyRuntimeProcessorRegistry;
  processorResolver: SyntheticPrivacySubjectDataProcessorResolver;
  purposes: SyntheticPrivacyPurposeRegistry;
  expectedInventory: PrivacyExpectedProcessorInventoryPort;
  integrityVerifier:
    SyntheticPrivacyIntegrityVerifier | PrivacyIntegrityVerifier;
  attributionVerifier:
    SyntheticPrivacyAttributionVerifier | PrivacyAttributionVerifier;
} {
  const integrityVerifier =
    input?.integrityVerifier ?? new SyntheticPrivacyIntegrityVerifier();
  const attributionVerifier =
    input?.attributionVerifier ?? new SyntheticPrivacyAttributionVerifier();
  const policies = new SyntheticPrivacyPolicyPackageRepository();
  const evidence = new SyntheticPrivacyAuthorizationEvidenceLedger();

  const originalPolicySeed = policies.seed.bind(policies);
  policies.seed = (policy) => {
    originalPolicySeed(policy);
    if (integrityVerifier instanceof SyntheticPrivacyIntegrityVerifier) {
      integrityVerifier.sealPolicy(policy);
    }
  };

  const originalEvidenceSeed = evidence.seedEvidence.bind(evidence);
  evidence.seedEvidence = (record) => {
    originalEvidenceSeed(record);
    if (integrityVerifier instanceof SyntheticPrivacyIntegrityVerifier) {
      integrityVerifier.sealEvidence(record);
    }
  };

  return {
    audit: new SyntheticPrivacyAuditSink(),
    clock:
      input?.clock ??
      new SyntheticPrivacyTrustedClock(
        input?.fixedUtcMs ?? '2026-08-18T12:00:00.000Z',
      ),
    evidence,
    ids: input?.ids ?? new SyntheticPrivacyIdFactory(),
    policies,
    processors: new SyntheticPrivacyRuntimeProcessorRegistry(),
    expectedInventory: input?.expectedInventory ?? emptyExpectedInventory,
    integrityVerifier,
    attributionVerifier,
    processorResolver: new SyntheticPrivacySubjectDataProcessorResolver(),
    purposes: new SyntheticPrivacyPurposeRegistry(),
  };
}

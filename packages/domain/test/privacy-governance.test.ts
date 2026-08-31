import {
  privacyActorContextReferenceSchema,
  privacyCorrelationIdSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyExpectedProcessorInventorySchema,
  privacyLifecycleProofIdSchema,
  privacyOperationIdSchema,
  privacyPolicyPackageReferenceSchema,
  privacyPolicyVersionIdSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyProcessorIdSchema,
  privacyProcessorStepIdSchema,
  privacyProcessorStepReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacyRetentionExceptionIdSchema,
  privacyRetentionRuleReferenceSchema,
  privacySubjectRequestIdSchema,
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestTransitionIdSchema,
  privacySubjectScopeIdSchema,
  privacySyntheticProcessorResultSchema,
  privacyWithdrawalIdSchema,
  privacyWithdrawalReferenceSchema,
  type PrivacyProcessorStepReference,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  authoritativeEvidenceState,
  authorizeRetentionExecution,
  buildRequestProcessorPlan,
  compareExpectedInventoryToRuntime,
  composeSyntheticProcessorSimulation,
  createSyntheticPrivacyDataUsePorts,
  deriveRequestCompletionFromSteps,
  evaluateDataUse,
  planRetentionPreview,
  planRetentionPreviewWithRetentionRule,
  planWithdrawal,
  recordProcessorStepAndAdvanceRequest,
  selectActiveRetentionRule,
  SyntheticPrivacyAttributionVerifier,
  SyntheticPrivacyExpectedProcessorInventory,
  SyntheticPrivacyGovernanceLifecycleLedger,
  SyntheticPrivacyIntegrityVerifier,
  SyntheticPrivacyProcessorStepRepository,
  SyntheticPrivacyReadinessProbe,
  SyntheticPrivacyRetentionPreviewRepository,
  SyntheticPrivacyRetentionRuleRepository,
  SyntheticPrivacySubjectDataProcessor,
  SyntheticPrivacySubjectRequestRepository,
  transitionSubjectRequest,
} from '../src/privacy-governance/index.js';

const policy = privacyPolicyPackageReferenceSchema.parse({
  packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  canonicalizationVersion: 'privacy-governance.canonical.v1',
  contentDigest: 'a'.repeat(64),
  synthetic: true,
});

const purpose = privacyPurposeVersionReferenceSchema.parse({
  purposeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  purposeVersionId: '33333333-3333-4333-8333-333333333333',
  policyVersionId: policy.versionId,
  allowedOperationKinds: ['data_use_evaluation'],
  allowedCategoryIds: ['44444444-4444-4444-8444-444444444444'],
  evidenceRequired: true,
  activationState: 'active',
  contentDigest: 'b'.repeat(64),
});

const processor = privacyProcessorDescriptorReferenceSchema.parse({
  processorId: '99999999-9999-4999-8999-999999999999',
  inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  descriptorDigest: 'c'.repeat(64),
  inventoryVersionDigest: 'd'.repeat(64),
  allowedPurposeIds: [purpose.purposeId],
  allowedCategoryIds: purpose.allowedCategoryIds,
  capabilities: ['access', 'inventory'],
  supportsSubjectLookup: true,
  codeOwner: 'packages.domain.privacy',
  synthetic: true,
});

const actor = privacyActorContextReferenceSchema.parse({
  issuer: 'synthetic.identity.v1',
  version: 1,
  principalReferenceDigest: 'e'.repeat(64),
  authorityClaims: ['data_use_evaluate'],
  synthetic: true,
});

const evidence = privacyEvidenceReferenceSchema.parse({
  evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  purposeId: purpose.purposeId,
  policyVersionId: policy.versionId,
  contentDigest: 'f'.repeat(64),
  recordedAt: '2026-08-18T11:00:00.000Z',
});

const categoryId = privacyEngineeringCategoryIdSchema.parse(
  '44444444-4444-4444-8444-444444444444',
);
const subjectScopeId = privacySubjectScopeIdSchema.parse(
  '22222222-2222-4222-8222-222222222222',
);

const expectedInventory = privacyExpectedProcessorInventorySchema.parse({
  schemaVersion: 'privacy.processor-inventory.v1',
  inventoryId: processor.inventoryId,
  inventoryVersionDigest: processor.inventoryVersionDigest,
  canonicalizationVersion: 'privacy-governance.canonical.v1',
  sourceCommit: '579b735',
  processors: [
    {
      processorId: processor.processorId,
      registrationVersion: 1,
      inventoryId: processor.inventoryId,
      descriptorDigest: processor.descriptorDigest,
      codeOwner: processor.codeOwner,
      adapterPackage: '@fitness-os/domain',
      storageKind: 'in_memory_synthetic',
      allowedPurposeIds: processor.allowedPurposeIds,
      allowedCategoryIds: processor.allowedCategoryIds,
      subjectLookupStrategy: 'synthetic_scope_id',
      supportedCapabilities: processor.capabilities,
      unsupportedCapabilities: [
        {
          capability: 'delete',
          rationale: 'deferred_to_later_prd21_slice',
        },
      ],
      recordFamilies: [
        {
          family: 'privacy_audit_event',
          lifecycleAction: 'retain_until_reviewed',
        },
      ],
      environmentApplicability: 'synthetic_only',
      requiredReadiness: 'mechanism_only',
      synthetic: true,
    },
  ],
});

function seedHappyPath() {
  const ports = createSyntheticPrivacyDataUsePorts({
    expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
      expectedInventory,
    ),
  });
  ports.policies.seed(policy);
  ports.purposes.seed(purpose);
  ports.processors.seed(processor);
  ports.evidence.seedEvidence(evidence);
  if (
    ports.attributionVerifier instanceof SyntheticPrivacyAttributionVerifier
  ) {
    ports.attributionVerifier.sealPolicyAttribution(policy.versionId, {
      actorPrincipalDigest: actor.principalReferenceDigest,
      synthetic: actor.synthetic,
    });
    ports.attributionVerifier.sealEvidenceAttribution(evidence.evidenceId, {
      actorPrincipalDigest: actor.principalReferenceDigest,
      subjectScopeId,
      synthetic: actor.synthetic,
    });
  }
  return ports;
}

describe('evaluateDataUse', () => {
  it('allows a synthetic evaluation and appends a succeeded audit event', async () => {
    const ports = seedHappyPath();
    const calls: string[] = [];

    const result = await evaluateDataUse(
      {
        ...ports,
        audit: {
          append: async (event) => {
            calls.push('audit');
            return ports.audit.append(event);
          },
        },
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async (command) => {
              calls.push(`execute:${command.capability}`);
              return privacySyntheticProcessorResultSchema.parse({
                status: 'completed',
                reasonCode: null,
                capability: command.capability,
                families: [],
                accessLocatorDigest: 'f'.repeat(64),
                exportManifestDigest: null,
                operationId: command.operationId,
                correlationId: command.correlationId,
              });
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.status).toBe('evaluated');
    expect(result.decision.outcome).toBe('allowed');
    expect(ports.audit.events).toHaveLength(1);
    expect(ports.audit.events[0]?.outcome).toBe('succeeded');
    expect(calls).toEqual(['audit', 'execute:access']);
  });

  it('denies withdrawn evidence and still audits the denial', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    ports.evidence.seedWithdrawal(
      privacyWithdrawalReferenceSchema.parse({
        withdrawalId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        evidenceId: evidence.evidenceId,
        state: 'withdrawn',
        withdrawnAt: '2026-08-18T11:30:00.000Z',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        processingOutcome: 'accepted',
      }),
    );

    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.status).toBe('evaluated');
    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'evidence_withdrawn',
    });
    expect(ports.audit.events[0]?.outcome).toBe('denied');
    expect(executions).toBe(0);
  });

  it('denies synthetic actor in production mode', async () => {
    const ports = seedHappyPath();

    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      processorCapability: 'access',
      evidenceId: evidence.evidenceId,
      subjectScopeId,
      productionMode: true,
    });

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'actor_context_synthetic_in_production',
    });
  });

  it('never allows when the audit sink is unavailable', async () => {
    const ports = seedHappyPath();
    ports.audit.unavailable = true;
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async (command) => {
              executions += 1;
              return privacySyntheticProcessorResultSchema.parse({
                status: 'completed',
                reasonCode: null,
                capability: command.capability,
                families: [],
                accessLocatorDigest: 'f'.repeat(64),
                exportManifestDigest: null,
                operationId: command.operationId,
                correlationId: command.correlationId,
              });
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.status).toBe('audit_unavailable');
    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'audit_unavailable',
    });
    expect(ports.audit.events).toHaveLength(0);
    expect(executions).toBe(0);
  });

  it('fails closed without leaking a bound handler descriptor error', async () => {
    const ports = seedHappyPath();

    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => {
              throw new Error('raw adapter secret');
            },
            execute: async () => {
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'dependency_unavailable',
    });
  });

  it('fails closed when no processor handler is bound', async () => {
    const result = await evaluateDataUse(seedHappyPath(), {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      processorCapability: 'access',
      evidenceId: evidence.evidenceId,
      subjectScopeId,
      productionMode: false,
    });

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'processor_handler_missing',
    });
  });

  it('allows when synthetic actor/subject attribution matches sealed bindings', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async (command) => {
              executions += 1;
              return privacySyntheticProcessorResultSchema.parse({
                status: 'completed',
                reasonCode: null,
                capability: command.capability,
                families: [],
                accessLocatorDigest: 'f'.repeat(64),
                exportManifestDigest: null,
                operationId: command.operationId,
                correlationId: command.correlationId,
              });
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.status).toBe('evaluated');
    expect(result.decision.outcome).toBe('allowed');
    if (result.decision.outcome === 'allowed') {
      expect(result.decision.actorContextDigest).toBe(
        actor.principalReferenceDigest,
      );
      expect(result.decision.subjectScopeId).toBe(subjectScopeId);
    }
    expect(executions).toBe(1);
  });

  it('denies when policy attribution seal is absent (actor unattributed)', async () => {
    const ports = seedHappyPath();
    const attribution = new SyntheticPrivacyAttributionVerifier();
    attribution.sealEvidenceAttribution(evidence.evidenceId, {
      actorPrincipalDigest: actor.principalReferenceDigest,
      subjectScopeId,
      synthetic: true,
    });
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        attributionVerifier: attribution,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_unattributed',
    });
    expect(executions).toBe(0);
    expect(ports.audit.events).toHaveLength(1);
    expect(ports.audit.events[0]?.outcome).toBe('denied');
  });

  it('denies when evidence attribution seal is absent (subject unattributed)', async () => {
    const ports = seedHappyPath();
    const attribution = new SyntheticPrivacyAttributionVerifier();
    attribution.sealPolicyAttribution(policy.versionId, {
      actorPrincipalDigest: actor.principalReferenceDigest,
      synthetic: true,
    });
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        attributionVerifier: attribution,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_unattributed',
    });
    expect(executions).toBe(0);
  });

  it('denies when request actor digests diverge from sealed evidence attribution', async () => {
    const ports = seedHappyPath();
    const attribution = new SyntheticPrivacyAttributionVerifier();
    attribution.sealPolicyAttribution(policy.versionId, {
      actorPrincipalDigest: actor.principalReferenceDigest,
      synthetic: true,
    });
    attribution.sealEvidenceAttribution(evidence.evidenceId, {
      actorPrincipalDigest: 'a'.repeat(64),
      subjectScopeId,
      synthetic: true,
    });
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        attributionVerifier: attribution,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_unattributed',
    });
    expect(executions).toBe(0);
  });

  it('denies when request subject diverges from sealed evidence attribution', async () => {
    const ports = seedHappyPath();
    const otherSubject = privacySubjectScopeIdSchema.parse(
      '33333333-3333-4333-8333-333333333333',
    );
    const attribution = new SyntheticPrivacyAttributionVerifier();
    attribution.sealPolicyAttribution(policy.versionId, {
      actorPrincipalDigest: actor.principalReferenceDigest,
      synthetic: true,
    });
    attribution.sealEvidenceAttribution(evidence.evidenceId, {
      actorPrincipalDigest: actor.principalReferenceDigest,
      subjectScopeId: otherSubject,
      synthetic: true,
    });
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        attributionVerifier: attribution,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_unattributed',
    });
    expect(executions).toBe(0);
  });

  it('denies empty/malformed actor principal digest as unattributed', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor: {
          ...actor,
          principalReferenceDigest: '0'.repeat(64),
        },
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_unattributed',
    });
    expect(executions).toBe(0);
  });

  it('denies non-synthetic actor in synthetic environment as unattributed', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor: { ...actor, synthetic: false },
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_unattributed',
    });
    expect(executions).toBe(0);
  });

  it('maps attribution verifier throw to policy_unattributed not technical unavailability', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        attributionVerifier: {
          verify: async () => {
            throw new Error('raw attribution secret');
          },
        },
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_unattributed',
    });
    expect(executions).toBe(0);
    expect(JSON.stringify(result)).not.toContain('raw attribution secret');
  });

  it('allows when sealed policy and evidence integrity verify (IntegrityVerifier)', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async (command) => {
              executions += 1;
              return privacySyntheticProcessorResultSchema.parse({
                status: 'completed',
                reasonCode: null,
                capability: command.capability,
                families: [],
                accessLocatorDigest: 'f'.repeat(64),
                exportManifestDigest: null,
                operationId: command.operationId,
                correlationId: command.correlationId,
              });
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.status).toBe('evaluated');
    expect(result.decision.outcome).toBe('allowed');
    expect(executions).toBe(1);
  });

  it('denies when policy content digest diverges from sealed integrity (IntegrityVerifier)', async () => {
    const ports = seedHappyPath();
    const verifier = new SyntheticPrivacyIntegrityVerifier();
    verifier.sealPolicy({ ...policy, contentDigest: '9'.repeat(64) });
    verifier.sealEvidence(evidence);
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        integrityVerifier: verifier,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_integrity_invalid',
    });
    expect(executions).toBe(0);
    expect(ports.audit.events).toHaveLength(1);
    expect(ports.audit.events[0]?.outcome).toBe('denied');
  });

  it('denies when policy package was never sealed (IntegrityVerifier absent subject)', async () => {
    const ports = seedHappyPath();
    const verifier = new SyntheticPrivacyIntegrityVerifier();
    // Seal only evidence — policy subject missing.
    verifier.sealEvidence(evidence);
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        integrityVerifier: verifier,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_integrity_invalid',
    });
    expect(executions).toBe(0);
  });

  it('fails closed when integrity verifier is unavailable', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        integrityVerifier: {
          verify: async () => ({ status: 'unavailable' as const }),
        },
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'dependency_unavailable',
    });
    expect(executions).toBe(0);
  });

  it('fails closed when integrity verifier throws', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        integrityVerifier: {
          verify: async () => {
            throw new Error('raw verifier secret');
          },
        },
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'dependency_unavailable',
    });
    expect(executions).toBe(0);
    expect(JSON.stringify(result)).not.toContain('raw verifier secret');
  });

  it('fails closed when integrity verifier port is absent', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        integrityVerifier: null as never,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'dependency_unavailable',
    });
    expect(executions).toBe(0);
  });

  it('denies when evidence digest diverges from sealed integrity', async () => {
    const ports = seedHappyPath();
    const verifier = new SyntheticPrivacyIntegrityVerifier();
    verifier.sealPolicy(policy);
    verifier.sealEvidence({ ...evidence, contentDigest: '8'.repeat(64) });
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        integrityVerifier: verifier,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'policy_integrity_invalid',
    });
    expect(executions).toBe(0);
  });

  it('does not execute when expected inventory omits the processor (H3 attribution)', async () => {
    const ports = createSyntheticPrivacyDataUsePorts();
    ports.policies.seed(policy);
    ports.purposes.seed(purpose);
    ports.processors.seed(processor);
    ports.evidence.seedEvidence(evidence);
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'processor_undeclared',
    });
    expect(executions).toBe(0);
    expect(ports.audit.events).toHaveLength(1);
    expect(ports.audit.events[0]?.outcome).toBe('denied');
  });

  it('does not execute when expected inventory digest binding mismatches (H3 integrity)', async () => {
    const ports = createSyntheticPrivacyDataUsePorts({
      expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
        privacyExpectedProcessorInventorySchema.parse({
          ...expectedInventory,
          processors: [
            {
              ...expectedInventory.processors[0]!,
              descriptorDigest: '1'.repeat(64),
            },
          ],
        }),
      ),
    });
    ports.policies.seed(policy);
    ports.purposes.seed(purpose);
    ports.processors.seed(processor);
    ports.evidence.seedEvidence(evidence);
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'processor_descriptor_mismatched',
    });
    expect(executions).toBe(0);
  });

  it('does not execute when expected inventory environment is not synthetic-compatible (H3 environment)', async () => {
    const ports = createSyntheticPrivacyDataUsePorts({
      expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
        privacyExpectedProcessorInventorySchema.parse({
          ...expectedInventory,
          processors: [
            {
              ...expectedInventory.processors[0]!,
              environmentApplicability: 'production_blocked_by_legal_privacy',
              requiredReadiness: 'production',
              synthetic: false,
            },
          ],
        }),
      ),
    });
    ports.policies.seed(policy);
    ports.purposes.seed(purpose);
    ports.processors.seed({ ...processor, synthetic: false });
    ports.evidence.seedEvidence(evidence);
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => ({ ...processor, synthetic: false }),
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'processor_undeclared',
    });
    expect(executions).toBe(0);
  });

  it('does not execute when expected inventory requires production readiness (H3 activation)', async () => {
    const ports = createSyntheticPrivacyDataUsePorts({
      expectedInventory: new SyntheticPrivacyExpectedProcessorInventory(
        privacyExpectedProcessorInventorySchema.parse({
          ...expectedInventory,
          processors: [
            {
              ...expectedInventory.processors[0]!,
              requiredReadiness: 'production',
            },
          ],
        }),
      ),
    });
    ports.policies.seed(policy);
    ports.purposes.seed(purpose);
    ports.processors.seed(processor);
    ports.evidence.seedEvidence(evidence);
    let executions = 0;

    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'processor_undeclared',
    });
    expect(executions).toBe(0);
  });

  it('does not execute a handler whose descriptor digest is mismatched', async () => {
    const ports = seedHappyPath();
    let executions = 0;
    const result = await evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => ({
              ...processor,
              descriptorDigest: '0'.repeat(64),
            }),
            execute: async () => {
              executions += 1;
              throw new Error('must not execute');
            },
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'processor_descriptor_mismatched',
    });
    expect(executions).toBe(0);
  });

  it('does not infer processor capability from data-use evaluation', async () => {
    const ports = seedHappyPath();
    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      processorCapability: 'export' as never,
      evidenceId: evidence.evidenceId,
      subjectScopeId,
      productionMode: false,
    });

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'processor_descriptor_mismatched',
    });
  });

  it('fails closed when the bound processor returns an invalid result', async () => {
    const ports = seedHappyPath();
    const execution = evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async () => ({ raw: 'adapter secret' }) as never,
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    await expect(execution).rejects.toThrow(
      'Privacy processor execution failed',
    );
    expect(ports.audit.events).toHaveLength(1);
    expect(ports.audit.events[0]?.outcome).toBe('succeeded');
  });

  it('fails closed on processor operation and correlation mismatch', async () => {
    const ports = seedHappyPath();
    const execution = evaluateDataUse(
      {
        ...ports,
        processorResolver: {
          resolve: async () => ({
            descriptorReference: () => processor,
            execute: async (command) =>
              privacySyntheticProcessorResultSchema.parse({
                status: 'completed',
                reasonCode: null,
                capability: command.capability,
                families: [],
                accessLocatorDigest: 'f'.repeat(64),
                exportManifestDigest: null,
                operationId: '11111111-1111-4111-8111-111111111111',
                correlationId: '77777777-7777-4777-8777-777777777777',
              }),
          }),
        },
      },
      {
        actor,
        purposeVersionId: purpose.purposeVersionId,
        policyVersionId: policy.versionId,
        operationKind: 'data_use_evaluation',
        engineeringCategoryId: categoryId,
        processorId: processor.processorId,
        processorCapability: 'access',
        evidenceId: evidence.evidenceId,
        subjectScopeId,
        productionMode: false,
      },
    );

    await expect(execution).rejects.toThrow(
      'Privacy processor execution failed',
    );
    expect(ports.audit.events).toHaveLength(1);
  });

  it('denies missing required evidence', async () => {
    const ports = seedHappyPath();

    const result = await evaluateDataUse(ports, {
      actor,
      purposeVersionId: purpose.purposeVersionId,
      policyVersionId: policy.versionId,
      operationKind: 'data_use_evaluation',
      engineeringCategoryId: categoryId,
      processorId: processor.processorId,
      processorCapability: 'access',
      evidenceId: null,
      subjectScopeId,
      productionMode: false,
    });

    expect(result.decision).toMatchObject({
      outcome: 'denied',
      reasonCode: 'evidence_missing',
    });
  });
});

describe('withdrawal planning', () => {
  it('accepts the first withdrawal and treats same operation as replay', () => {
    expect(authoritativeEvidenceState(null)).toBe('active');

    const first = planWithdrawal({
      existing: null,
      withdrawalId: privacyWithdrawalIdSchema.parse(
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      ),
      evidenceId: evidence.evidenceId,
      operationId: privacyOperationIdSchema.parse(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ),
      withdrawnAt: '2026-08-18T12:00:00.000Z',
    });

    expect(first.status).toBe('accepted');
    if (first.status !== 'accepted') {
      throw new Error('expected accepted');
    }
    expect(authoritativeEvidenceState(first.withdrawal)).toBe('withdrawn');

    const replay = planWithdrawal({
      existing: first.withdrawal,
      withdrawalId: first.withdrawal.withdrawalId,
      evidenceId: evidence.evidenceId,
      operationId: first.withdrawal.operationId,
      withdrawnAt: '2026-08-18T12:05:00.000Z',
    });
    expect(replay.status).toBe('idempotent_replay');

    const second = planWithdrawal({
      existing: first.withdrawal,
      withdrawalId: privacyWithdrawalIdSchema.parse(
        '12121212-1212-4121-8121-121212121212',
      ),
      evidenceId: evidence.evidenceId,
      operationId: privacyOperationIdSchema.parse(
        '34343434-3434-4343-8343-343434343434',
      ),
      withdrawnAt: '2026-08-18T12:06:00.000Z',
    });
    expect(second.status).toBe('already_withdrawn');
  });
});

describe('synthetic subject-data processor simulation', () => {
  it('executes declared inventory/access and composes coverage match', async () => {
    const syntheticProcessor = new SyntheticPrivacySubjectDataProcessor(
      processor,
      ['privacy_audit_event', 'privacy_subject_request'],
    );
    const inventoryResult = await syntheticProcessor.execute({
      processorId: processor.processorId,
      capability: 'inventory',
      subjectScopeId: privacySubjectScopeIdSchema.parse(
        '22222222-2222-4222-8222-222222222222',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      operationId: privacyOperationIdSchema.parse(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ),
      productionMode: false,
    });
    expect(inventoryResult.status).toBe('completed');
    expect(inventoryResult.families).toHaveLength(2);

    const accessResult = await syntheticProcessor.execute({
      processorId: processor.processorId,
      capability: 'access',
      subjectScopeId: privacySubjectScopeIdSchema.parse(
        '22222222-2222-4222-8222-222222222222',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      operationId: privacyOperationIdSchema.parse(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
      productionMode: false,
    });
    expect(accessResult.status).toBe('completed');
    expect(accessResult.accessLocatorDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(accessResult.exportManifestDigest).toBeNull();

    const exportProcessor = new SyntheticPrivacySubjectDataProcessor(
      privacyProcessorDescriptorReferenceSchema.parse({
        ...processor,
        capabilities: ['access', 'inventory', 'export'],
      }),
      ['privacy_audit_event', 'privacy_subject_request'],
    );
    const exportResult = await exportProcessor.execute({
      processorId: processor.processorId,
      capability: 'export',
      subjectScopeId: privacySubjectScopeIdSchema.parse(
        '22222222-2222-4222-8222-222222222222',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      operationId: privacyOperationIdSchema.parse(
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      ),
      productionMode: false,
    });
    expect(exportResult.status).toBe('completed');
    expect(exportResult.exportManifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(exportResult.accessLocatorDigest).toBeNull();

    const undeclaredDelete = await syntheticProcessor.execute({
      processorId: processor.processorId,
      capability: 'delete',
      subjectScopeId: privacySubjectScopeIdSchema.parse(
        '22222222-2222-4222-8222-222222222222',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      operationId: privacyOperationIdSchema.parse(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ),
      productionMode: false,
    });
    expect(undeclaredDelete).toMatchObject({
      status: 'denied',
      reasonCode: 'capability_not_declared',
    });

    const declaredDestructive = new SyntheticPrivacySubjectDataProcessor(
      privacyProcessorDescriptorReferenceSchema.parse({
        ...processor,
        capabilities: [
          'access',
          'inventory',
          'export',
          'delete',
          'retention',
          'governance_lifecycle',
        ],
      }),
      ['privacy_audit_event'],
    );
    for (const capability of [
      'delete',
      'retention',
      'governance_lifecycle',
    ] as const) {
      await expect(
        declaredDestructive.execute({
          processorId: processor.processorId,
          capability,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          correlationId: privacyCorrelationIdSchema.parse(
            '55555555-5555-4555-8555-555555555555',
          ),
          operationId: privacyOperationIdSchema.parse(
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ),
          productionMode: false,
        }),
      ).resolves.toMatchObject({
        status: 'denied',
        reasonCode: 'requires_legal_privacy_decision',
        capability,
      });
    }

    const productionDenied = await syntheticProcessor.execute({
      processorId: processor.processorId,
      capability: 'inventory',
      subjectScopeId: privacySubjectScopeIdSchema.parse(
        '22222222-2222-4222-8222-222222222222',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      operationId: privacyOperationIdSchema.parse(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ),
      productionMode: true,
    });
    expect(productionDenied).toMatchObject({
      status: 'denied',
      reasonCode: 'synthetic_processor_in_production',
    });

    const composed = composeSyntheticProcessorSimulation({
      processors: [syntheticProcessor],
    });
    const expected = privacyExpectedProcessorInventorySchema.parse({
      schemaVersion: 'privacy.processor-inventory.v1',
      inventoryId: processor.inventoryId,
      inventoryVersionDigest: processor.inventoryVersionDigest,
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      sourceCommit: '0b0db38',
      processors: [
        {
          processorId: processor.processorId,
          registrationVersion: 1,
          inventoryId: processor.inventoryId,
          descriptorDigest: processor.descriptorDigest,
          codeOwner: processor.codeOwner,
          adapterPackage: '@fitness-os/domain',
          storageKind: 'in_memory_synthetic',
          allowedPurposeIds: processor.allowedPurposeIds,
          allowedCategoryIds: processor.allowedCategoryIds,
          subjectLookupStrategy: 'synthetic_scope_id',
          supportedCapabilities: processor.capabilities,
          unsupportedCapabilities: [
            {
              capability: 'delete',
              rationale: 'deferred_to_later_prd21_slice',
            },
          ],
          recordFamilies: [
            {
              family: 'privacy_audit_event',
              lifecycleAction: 'retain_until_reviewed',
            },
            {
              family: 'privacy_subject_request',
              lifecycleAction: 'retain_until_reviewed',
            },
          ],
          environmentApplicability: 'synthetic_only',
          requiredReadiness: 'mechanism_only',
          synthetic: true,
        },
      ],
    });
    expect(
      compareExpectedInventoryToRuntime({
        expected,
        runtime: composed.runtimeDescriptors,
      }),
    ).toEqual({ status: 'matched' });
  });
});

describe('synthetic expected processor inventory', () => {
  const inventory = privacyExpectedProcessorInventorySchema.parse({
    schemaVersion: 'privacy.processor-inventory.v1',
    inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    inventoryVersionDigest: 'd'.repeat(64),
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    sourceCommit: 'ad3f3e2',
    processors: [
      {
        processorId: '99999999-9999-4999-8999-999999999999',
        registrationVersion: 1,
        inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        descriptorDigest: 'c'.repeat(64),
        codeOwner: 'packages.domain.privacy',
        adapterPackage: '@fitness-os/domain',
        storageKind: 'in_memory_synthetic',
        allowedPurposeIds: [purpose.purposeId],
        allowedCategoryIds: purpose.allowedCategoryIds,
        subjectLookupStrategy: 'synthetic_scope_id',
        supportedCapabilities: ['inventory', 'access'],
        unsupportedCapabilities: [
          {
            capability: 'delete',
            rationale: 'deferred_to_later_prd21_slice',
          },
        ],
        recordFamilies: [
          {
            family: 'privacy_audit_event',
            lifecycleAction: 'retain_until_reviewed',
          },
        ],
        environmentApplicability: 'synthetic_only',
        requiredReadiness: 'mechanism_only',
        synthetic: true,
      },
    ],
  });

  it('returns a canonicalized metadata-only inventory', async () => {
    const port = new SyntheticPrivacyExpectedProcessorInventory(inventory);
    const loaded = await port.getInventory();
    expect(loaded.processors[0]?.supportedCapabilities).toEqual([
      'access',
      'inventory',
    ]);
    expect(loaded.processors[0]?.synthetic).toBe(true);
  });

  it('matches runtime descriptors that bind the same inventory digests', () => {
    const matched = compareExpectedInventoryToRuntime({
      expected: inventory,
      runtime: [processor],
    });
    expect(matched).toEqual({ status: 'matched' });
  });

  it('flags missing handlers, purposes, and undeclared runtime processors', () => {
    const missingHandler = compareExpectedInventoryToRuntime({
      expected: inventory,
      runtime: [
        privacyProcessorDescriptorReferenceSchema.parse({
          ...processor,
          capabilities: ['access'],
        }),
      ],
    });
    expect(missingHandler).toMatchObject({
      status: 'mismatched',
      mismatches: [
        {
          diagnosticCode: 'handler_missing',
          detail: 'missing_handler:inventory',
        },
      ],
    });

    const missingPurpose = compareExpectedInventoryToRuntime({
      expected: inventory,
      runtime: [
        privacyProcessorDescriptorReferenceSchema.parse({
          ...processor,
          allowedPurposeIds: [],
        }),
      ],
    });
    expect(missingPurpose.status).toBe('mismatched');
    if (missingPurpose.status !== 'mismatched') {
      throw new Error('expected mismatched');
    }
    expect(
      missingPurpose.mismatches.some(
        (row) =>
          row.diagnosticCode === 'inventory_mismatch' &&
          row.detail.startsWith('missing_purpose:'),
      ),
    ).toBe(true);

    const extra = compareExpectedInventoryToRuntime({
      expected: inventory,
      runtime: [
        processor,
        privacyProcessorDescriptorReferenceSchema.parse({
          ...processor,
          processorId: '88888888-8888-4888-8888-888888888888',
        }),
      ],
    });
    expect(extra).toMatchObject({
      status: 'mismatched',
      mismatches: [
        {
          diagnosticCode: 'inventory_mismatch',
          detail: 'undeclared_runtime_processor',
        },
      ],
    });
  });
});

describe('buildRequestProcessorPlan', () => {
  const baseProcessor = {
    adapterPackage: '@fitness-os/domain',
    allowedCategoryIds: purpose.allowedCategoryIds,
    allowedPurposeIds: [purpose.purposeId],
    codeOwner: 'packages.domain.privacy',
    descriptorDigest: 'c'.repeat(64),
    environmentApplicability: 'synthetic_only' as const,
    inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    recordFamilies: [
      {
        family: 'privacy_audit_event' as const,
        lifecycleAction: 'retain_until_reviewed' as const,
      },
    ],
    registrationVersion: 1,
    requiredReadiness: 'mechanism_only' as const,
    storageKind: 'in_memory_synthetic' as const,
    subjectLookupStrategy: 'synthetic_scope_id' as const,
    synthetic: true,
  };

  function buildInventory(
    processors: readonly Record<string, unknown>[],
  ): ReturnType<typeof privacyExpectedProcessorInventorySchema.parse> {
    return privacyExpectedProcessorInventorySchema.parse({
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      inventoryVersionDigest: 'd'.repeat(64),
      processors,
      schemaVersion: 'privacy.processor-inventory.v1',
      sourceCommit: 'ad3f3e2',
    });
  }

  it('plans one step per supporting processor, in stable processorId order', () => {
    const inventory = buildInventory([
      {
        ...baseProcessor,
        processorId: '99999999-9999-4999-8999-999999999999',
        supportedCapabilities: ['inventory', 'access'],
        unsupportedCapabilities: [],
      },
      {
        ...baseProcessor,
        processorId: '11111111-1111-4111-8111-111111111111',
        supportedCapabilities: ['inventory', 'access'],
        unsupportedCapabilities: [],
      },
    ]);

    const result = buildRequestProcessorPlan({
      expected: inventory,
      requestType: 'access',
    });

    expect(result).toEqual({
      excluded: [],
      status: 'planned',
      steps: [
        {
          capability: 'access',
          processorId: '11111111-1111-4111-8111-111111111111',
        },
        {
          capability: 'access',
          processorId: '99999999-9999-4999-8999-999999999999',
        },
      ],
    });
  });

  it('maps a deletion request to the delete capability', () => {
    const inventory = buildInventory([
      {
        ...baseProcessor,
        processorId: '99999999-9999-4999-8999-999999999999',
        supportedCapabilities: ['inventory', 'access', 'delete'],
        unsupportedCapabilities: [],
      },
    ]);

    const result = buildRequestProcessorPlan({
      expected: inventory,
      requestType: 'deletion',
    });

    expect(result).toEqual({
      excluded: [],
      status: 'planned',
      steps: [
        {
          capability: 'delete',
          processorId: '99999999-9999-4999-8999-999999999999',
        },
      ],
    });
  });

  it('excludes a processor with a reviewed unsupported-capability rationale instead of marking it incomplete', () => {
    const inventory = buildInventory([
      {
        ...baseProcessor,
        processorId: '99999999-9999-4999-8999-999999999999',
        supportedCapabilities: ['inventory', 'access'],
        unsupportedCapabilities: [
          { capability: 'delete', rationale: 'deferred_to_later_prd21_slice' },
        ],
      },
    ]);

    const result = buildRequestProcessorPlan({
      expected: inventory,
      requestType: 'deletion',
    });

    expect(result).toEqual({
      excluded: [
        {
          capability: 'delete',
          processorId: '99999999-9999-4999-8999-999999999999',
          rationale: 'deferred_to_later_prd21_slice',
        },
      ],
      status: 'planned',
      steps: [],
    });
  });

  it('leaves the plan incomplete when a processor neither supports nor exempts the mapped capability', () => {
    const inventory = buildInventory([
      {
        ...baseProcessor,
        processorId: '99999999-9999-4999-8999-999999999999',
        supportedCapabilities: ['inventory', 'access'],
        unsupportedCapabilities: [],
      },
    ]);

    const result = buildRequestProcessorPlan({
      expected: inventory,
      requestType: 'export',
    });

    expect(result).toEqual({
      status: 'incomplete',
      undeclaredProcessorIds: ['99999999-9999-4999-8999-999999999999'],
    });
  });

  it('never treats an empty inventory as a vacuously complete plan', () => {
    const result = buildRequestProcessorPlan({
      expected: buildInventory([]),
      requestType: 'access',
    });

    expect(result).toEqual({ status: 'empty_inventory' });
  });
});

describe('synthetic subject request repository', () => {
  it('rejects a first pointer that bypasses the received state', async () => {
    const repo = new SyntheticPrivacySubjectRequestRepository();
    const request = privacySubjectRequestReferenceSchema.parse({
      requestId: privacySubjectRequestIdSchema.parse(
        '66666666-6666-4666-8666-666666666666',
      ),
      requestType: 'export',
      state: 'verification_required',
      subjectScopeId: '22222222-2222-4222-8222-222222222222',
      verification: null,
      policyVersionId: policy.versionId,
      inventoryVersionDigest: '1'.repeat(64),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      updatedAt: '2026-08-18T12:00:00.000Z',
    });

    await expect(
      repo.createReceived(request, '2026-08-18T12:01:00.000Z'),
    ).resolves.toBe('invalid_initial_state');
    await expect(repo.get(request.requestId)).resolves.toBeNull();
  });

  it('puts and applies transitions against the current pointer', async () => {
    const repo = new SyntheticPrivacySubjectRequestRepository();
    const request = privacySubjectRequestReferenceSchema.parse({
      requestId: privacySubjectRequestIdSchema.parse(
        '66666666-6666-4666-8666-666666666666',
      ),
      requestType: 'export',
      state: 'received',
      subjectScopeId: '22222222-2222-4222-8222-222222222222',
      verification: null,
      policyVersionId: policy.versionId,
      inventoryVersionDigest: '1'.repeat(64),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      updatedAt: '2026-08-18T12:00:00.000Z',
    });

    await expect(
      repo.createReceived(request, '2026-08-18T12:01:00.000Z'),
    ).resolves.toBe('accepted');
    await expect(repo.get(request.requestId)).resolves.toMatchObject({
      state: 'received',
      updatedAt: '2026-08-18T12:01:00.000Z',
    });
    const advanced = await repo.applyTransition({
      requestId: request.requestId,
      next: 'verification_required',
      updatedAt: '2026-08-18T12:02:00.000Z',
      transitionId: privacySubjectRequestTransitionIdSchema.parse(
        'a1111111-1111-4111-8111-111111111111',
      ),
      operationId: privacyOperationIdSchema.parse(
        'b2222222-2222-4222-8222-222222222222',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      reasonCode: 'forward',
      productionMode: false,
    });
    expect(advanced.status).toBe('advanced');
    if (advanced.status !== 'advanced') {
      throw new Error('expected advanced');
    }
    expect(advanced.transition).toMatchObject({
      previousState: 'received',
      nextState: 'verification_required',
      reasonCode: 'forward',
    });
    await expect(repo.listTransitions(request.requestId)).resolves.toEqual([
      advanced.transition,
    ]);
    await expect(repo.get(request.requestId)).resolves.toMatchObject({
      state: 'verification_required',
    });

    await expect(
      repo.applyTransition({
        requestId: request.requestId,
        next: 'in_progress',
        updatedAt: '2026-08-18T12:02:00.000Z',
        transitionId: privacySubjectRequestTransitionIdSchema.parse(
          'c3333333-3333-4333-8333-333333333333',
        ),
        operationId: privacyOperationIdSchema.parse(
          'b2222222-2222-4222-8222-222222222222',
        ),
        correlationId: privacyCorrelationIdSchema.parse(
          '55555555-5555-4555-8555-555555555555',
        ),
        reasonCode: 'forward',
        productionMode: false,
      }),
    ).resolves.toEqual({ status: 'conflict' });
  });
});

describe('subject request transitions', () => {
  const baseRequest = privacySubjectRequestReferenceSchema.parse({
    requestId: privacySubjectRequestIdSchema.parse(
      '66666666-6666-4666-8666-666666666666',
    ),
    requestType: 'export',
    state: 'received',
    subjectScopeId: '22222222-2222-4222-8222-222222222222',
    verification: null,
    policyVersionId: policy.versionId,
    inventoryVersionDigest: '1'.repeat(64),
    correlationId: privacyCorrelationIdSchema.parse(
      '55555555-5555-4555-8555-555555555555',
    ),
    updatedAt: '2026-08-18T12:00:00.000Z',
  });

  it('advances received → verification_required → ready with verification', () => {
    const pending = transitionSubjectRequest({
      request: baseRequest,
      next: 'verification_required',
      updatedAt: '2026-08-18T12:01:00.000Z',
    });
    expect(pending.status).toBe('advanced');
    if (pending.status !== 'advanced') {
      throw new Error('expected advanced');
    }

    const readyWithoutVerification = transitionSubjectRequest({
      request: pending.request,
      next: 'ready',
      updatedAt: '2026-08-18T12:02:00.000Z',
    });
    expect(readyWithoutVerification).toMatchObject({
      status: 'invalid',
      reason: 'verification_required',
    });

    const ready = transitionSubjectRequest({
      request: pending.request,
      next: 'ready',
      updatedAt: '2026-08-18T12:02:00.000Z',
      verification: {
        verificationRefDigest: '2'.repeat(64),
        synthetic: true,
      },
      productionMode: false,
    });
    expect(ready.status).toBe('advanced');
    if (ready.status !== 'advanced') {
      throw new Error('expected advanced');
    }
    expect(ready.request.state).toBe('ready');
  });

  it('rejects synthetic verification in production mode', () => {
    const pending = transitionSubjectRequest({
      request: baseRequest,
      next: 'verification_required',
      updatedAt: '2026-08-18T12:01:00.000Z',
    });
    if (pending.status !== 'advanced') {
      throw new Error('expected advanced');
    }

    const blocked = transitionSubjectRequest({
      request: pending.request,
      next: 'ready',
      updatedAt: '2026-08-18T12:02:00.000Z',
      verification: {
        verificationRefDigest: '2'.repeat(64),
        synthetic: true,
      },
      productionMode: true,
    });
    expect(blocked).toMatchObject({
      status: 'invalid',
      reason: 'synthetic_verification_in_production',
    });
  });

  it('rejects illegal jumps and reports terminal states', () => {
    const illegal = transitionSubjectRequest({
      request: baseRequest,
      next: 'completed',
      updatedAt: '2026-08-18T12:03:00.000Z',
    });
    expect(illegal).toMatchObject({
      status: 'invalid',
      reason: 'illegal_transition',
    });

    const denied = transitionSubjectRequest({
      request: {
        ...baseRequest,
        state: 'denied',
      },
      next: 'ready',
      updatedAt: '2026-08-18T12:04:00.000Z',
    });
    expect(denied.status).toBe('already_terminal');
  });
});

describe('synthetic processor step repository', () => {
  const requestId = privacySubjectRequestIdSchema.parse(
    '66666666-6666-4666-8666-666666666666',
  );
  const step = (overrides: Partial<PrivacyProcessorStepReference> = {}) =>
    privacyProcessorStepReferenceSchema.parse({
      stepId: 'e1111111-1111-4111-8111-111111111111',
      requestId,
      processorId: '99999999-9999-4999-8999-999999999999',
      capability: 'export',
      outcome: 'completed',
      operationId: privacyOperationIdSchema.parse(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      recordedAt: '2026-08-18T12:02:00.000Z',
      ...overrides,
    });

  it('appends steps and lists them per request in recorded order', async () => {
    const repo = new SyntheticPrivacyProcessorStepRepository();
    const first = step();
    const second = step({
      stepId: privacyProcessorStepIdSchema.parse(
        'e2222222-2222-4222-8222-222222222222',
      ),
      recordedAt: '2026-08-18T12:03:00.000Z',
    });

    await expect(repo.append(first)).resolves.toBe('accepted');
    await expect(repo.append(second)).resolves.toBe('accepted');
    await expect(repo.append(first)).resolves.toBe('conflict');
    await expect(repo.listForRequest(requestId)).resolves.toEqual([
      first,
      second,
    ]);
    await expect(repo.listForRequest('unknown-request')).resolves.toEqual([]);
  });
});

describe('deriveRequestCompletionFromSteps', () => {
  const requestId = privacySubjectRequestIdSchema.parse(
    '66666666-6666-4666-8666-666666666666',
  );
  const step = (overrides: Partial<PrivacyProcessorStepReference> = {}) =>
    privacyProcessorStepReferenceSchema.parse({
      stepId: 'e1111111-1111-4111-8111-111111111111',
      requestId,
      processorId: '99999999-9999-4999-8999-999999999999',
      capability: 'export',
      outcome: 'completed',
      operationId: privacyOperationIdSchema.parse(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      recordedAt: '2026-08-18T12:02:00.000Z',
      ...overrides,
    });
  const expected = [
    {
      processorId: '99999999-9999-4999-8999-999999999999',
      capability: 'export' as const,
    },
  ];

  it('stays incomplete while an expected processor has not reported yet', () => {
    expect(deriveRequestCompletionFromSteps({ expected, steps: [] })).toBe(
      'incomplete',
    );
  });

  it('stays incomplete while the latest attempt is a retryable failure', () => {
    expect(
      deriveRequestCompletionFromSteps({
        expected,
        steps: [step({ outcome: 'retryable_failure' })],
      }),
    ).toBe('incomplete');
  });

  it('completes once every expected pair reports completed', () => {
    expect(
      deriveRequestCompletionFromSteps({
        expected,
        steps: [step({ outcome: 'completed' })],
      }),
    ).toBe('completed');
  });

  it('is partially_failed once a pair terminally fails, even if a later retry is not yet reflected', () => {
    expect(
      deriveRequestCompletionFromSteps({
        expected,
        steps: [step({ outcome: 'permanent_failure' })],
      }),
    ).toBe('partially_failed');
  });

  it('never treats an unpopulated expected set as completed', () => {
    expect(deriveRequestCompletionFromSteps({ expected: [], steps: [] })).toBe(
      'incomplete',
    );
  });

  it('uses only the latest step per (processorId, capability) pair', () => {
    const firstAttempt = step({ outcome: 'retryable_failure' });
    const retrySucceeded = step({
      stepId: privacyProcessorStepIdSchema.parse(
        'e2222222-2222-4222-8222-222222222222',
      ),
      outcome: 'completed',
      recordedAt: '2026-08-18T12:05:00.000Z',
    });
    expect(
      deriveRequestCompletionFromSteps({
        expected,
        steps: [firstAttempt, retrySucceeded],
      }),
    ).toBe('completed');
  });
});

describe('recordProcessorStepAndAdvanceRequest', () => {
  const requestId = privacySubjectRequestIdSchema.parse(
    '66666666-6666-4666-8666-666666666666',
  );
  const processorA = '99999999-9999-4999-8999-999999999999';
  const processorB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const expectedOnePair = [
    { processorId: processorA, capability: 'export' as const },
  ];
  const expectedTwoPairs = [
    { processorId: processorA, capability: 'export' as const },
    { processorId: processorB, capability: 'access' as const },
  ];

  const requestInState = (
    state:
      'received' | 'ready' | 'in_progress' | 'partially_failed' | 'completed',
  ) =>
    privacySubjectRequestReferenceSchema.parse({
      requestId,
      requestType: 'export',
      state,
      subjectScopeId: '22222222-2222-4222-8222-222222222222',
      verification: null,
      policyVersionId: policy.versionId,
      inventoryVersionDigest: '1'.repeat(64),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      updatedAt: '2026-08-18T12:00:00.000Z',
    });

  const step = (
    overrides: Partial<PrivacyProcessorStepReference> = {},
  ): PrivacyProcessorStepReference =>
    privacyProcessorStepReferenceSchema.parse({
      stepId: 'e1111111-1111-4111-8111-111111111111',
      requestId,
      processorId: processorA,
      capability: 'export',
      outcome: 'completed',
      operationId: privacyOperationIdSchema.parse(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ),
      correlationId: privacyCorrelationIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
      recordedAt: '2026-08-18T12:02:00.000Z',
      ...overrides,
    });

  type AdvanceInput = Parameters<
    typeof recordProcessorStepAndAdvanceRequest
  >[0];

  const advanceInput = (
    base: Pick<AdvanceInput, 'requests' | 'steps'>,
    overrides: Partial<Omit<AdvanceInput, 'requests' | 'steps'>> = {},
  ): AdvanceInput => ({
    correlationId: privacyCorrelationIdSchema.parse(
      '55555555-5555-4555-8555-555555555555',
    ),
    expected: expectedOnePair,
    operationId: privacyOperationIdSchema.parse(
      'b2222222-2222-4222-8222-222222222222',
    ),
    productionMode: false,
    step: step(),
    transitionId: privacySubjectRequestTransitionIdSchema.parse(
      'a1111111-1111-4111-8111-111111111111',
    ),
    updatedAt: '2026-08-18T12:03:00.000Z',
    ...base,
    ...overrides,
  });

  it('reports request_not_found and appends nothing for an unknown request', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );

    expect(result).toEqual({ status: 'request_not_found' });
    await expect(steps.listForRequest(requestId)).resolves.toEqual([]);
  });

  it('records the step but stays incomplete while an expected pair has not reported', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('in_progress'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }, { expected: expectedTwoPairs }),
    );

    expect(result).toMatchObject({
      completion: 'incomplete',
      status: 'recorded',
    });
    await expect(requests.get(requestId)).resolves.toMatchObject({
      state: 'in_progress',
    });
  });

  it('advances in_progress to completed once the derived status is terminal', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('in_progress'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );

    expect(result.status).toBe('advanced');
    if (result.status !== 'advanced') {
      throw new Error('expected advanced');
    }
    expect(result.completion).toBe('completed');
    expect(result.request.state).toBe('completed');
    expect(result.transition).toMatchObject({
      previousState: 'in_progress',
      nextState: 'completed',
      reasonCode: 'forward',
    });
    await expect(requests.get(requestId)).resolves.toMatchObject({
      state: 'completed',
    });
  });

  it('advances in_progress to partially_failed on a permanent failure', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('in_progress'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput(
        { requests, steps },
        { step: step({ outcome: 'permanent_failure' }) },
      ),
    );

    expect(result.status).toBe('advanced');
    if (result.status !== 'advanced') {
      throw new Error('expected advanced');
    }
    expect(result.completion).toBe('partially_failed');
    expect(result.request.state).toBe('partially_failed');
  });

  it('never derives a next state from anything but the recorded step history', async () => {
    // Two pairs expected; only one step is ever appended, so the request
    // must stay in_progress no matter what outcome that single step reports.
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('in_progress'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }, { expected: expectedTwoPairs }),
    );

    expect(result).toMatchObject({
      completion: 'incomplete',
      status: 'recorded',
    });
    await expect(requests.get(requestId)).resolves.toMatchObject({
      state: 'in_progress',
    });
  });

  it('records evidence without transitioning when the request is not yet executing', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('ready'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );

    expect(result).toMatchObject({
      completion: 'completed',
      status: 'recorded',
    });
    await expect(requests.get(requestId)).resolves.toMatchObject({
      state: 'ready',
    });
    await expect(steps.listForRequest(requestId)).resolves.toHaveLength(1);
  });

  it('reports already_terminal and appends no further transition for a terminal request', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('completed'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );

    expect(result).toMatchObject({
      completion: 'completed',
      status: 'already_terminal',
    });
    await expect(requests.get(requestId)).resolves.toMatchObject({
      state: 'completed',
    });
  });

  it('reports already_terminal for a repeated exact stepId once the earlier transition already committed', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('in_progress'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const first = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );
    expect(first.status).toBe('advanced');

    const replay = await recordProcessorStepAndAdvanceRequest(
      advanceInput(
        { requests, steps },
        {
          transitionId: privacySubjectRequestTransitionIdSchema.parse(
            'c3333333-3333-4333-8333-333333333333',
          ),
        },
      ),
    );

    expect(replay).toMatchObject({
      completion: 'completed',
      status: 'already_terminal',
    });
    await expect(steps.listForRequest(requestId)).resolves.toHaveLength(1);
  });

  it('recovers a transition dropped after a crash between append and transition, on replay of the same step', async () => {
    // Simulates a process that crashed (or threw) after the step append
    // committed but before applyTransition ran: the step is durably
    // recorded, yet the request is still sitting in_progress. Replaying the
    // exact same step must not just report step_conflict forever — it must
    // still evaluate and attempt the transition that was dropped.
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('in_progress'));
    const steps = new SyntheticPrivacyProcessorStepRepository();
    await steps.append(step());

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );

    expect(result.status).toBe('advanced');
    if (result.status !== 'advanced') {
      throw new Error('expected advanced');
    }
    expect(result.completion).toBe('completed');
    expect(result.request.state).toBe('completed');
    await expect(steps.listForRequest(requestId)).resolves.toHaveLength(1);
  });

  it('still reports step_conflict when a replayed step needs no transition', async () => {
    // The request is not yet executing, so neither the original call nor a
    // replay ever attempts a transition — step_conflict remains the correct,
    // reachable outcome for a duplicate that genuinely needs no recovery.
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('ready'));
    const steps = new SyntheticPrivacyProcessorStepRepository();
    await steps.append(step());

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );

    expect(result).toMatchObject({
      completion: 'completed',
      status: 'step_conflict',
    });
    await expect(requests.get(requestId)).resolves.toMatchObject({
      state: 'ready',
    });
  });

  it('surfaces illegal_transition rather than silently no-opping a repeated permanent failure', async () => {
    // The request state machine has no partially_failed -> partially_failed
    // self-transition; a second independent permanent failure on an already
    // partially_failed request must not be misreported as a fresh advance.
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('partially_failed'));
    const steps = new SyntheticPrivacyProcessorStepRepository();

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput(
        { requests, steps },
        { step: step({ outcome: 'permanent_failure' }) },
      ),
    );

    expect(result).toEqual({
      reason: 'illegal_transition',
      status: 'invalid_transition',
    });
  });

  it('advances partially_failed to completed once a retry clears the failure', async () => {
    const requests = new SyntheticPrivacySubjectRequestRepository();
    requests.seedForTest(requestInState('partially_failed'));
    const steps = new SyntheticPrivacyProcessorStepRepository();
    // Seed the prior permanent-failure attempt directly in the step store so
    // only the retry goes through the coordinator.
    await steps.append(
      step({
        outcome: 'permanent_failure',
        stepId: privacyProcessorStepIdSchema.parse(
          'e2222222-2222-4222-8222-222222222222',
        ),
      }),
    );

    const result = await recordProcessorStepAndAdvanceRequest(
      advanceInput({ requests, steps }),
    );

    expect(result.status).toBe('advanced');
    if (result.status !== 'advanced') {
      throw new Error('expected advanced');
    }
    expect(result.completion).toBe('completed');
    expect(result.request.state).toBe('completed');
  });
});

describe('retention preview and execution gates', () => {
  it('plans a deterministic synthetic preview without side effects', () => {
    const left = planRetentionPreview({
      policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
      policySynthetic: true,
      inventoryVersionDigest: '3'.repeat(64),
      processorDescriptorDigests: ['c'.repeat(64), 'b'.repeat(64)],
      watermark: '2026-08-18T00:00:00.000Z',
      approvedExceptionIds: [
        privacyRetentionExceptionIdSchema.parse(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
        privacyRetentionExceptionIdSchema.parse(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
      ],
      productionMode: false,
    });
    const right = planRetentionPreview({
      policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
      policySynthetic: true,
      inventoryVersionDigest: '3'.repeat(64),
      processorDescriptorDigests: ['b'.repeat(64), 'c'.repeat(64)],
      watermark: '2026-08-18T00:00:00.000Z',
      approvedExceptionIds: [
        privacyRetentionExceptionIdSchema.parse(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
        privacyRetentionExceptionIdSchema.parse(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
      ],
      productionMode: false,
    });

    expect(left.status).toBe('planned');
    expect(right.status).toBe('planned');
    if (left.status !== 'planned' || right.status !== 'planned') {
      throw new Error('expected planned');
    }
    expect(left.preview.selectionDigest).toBe(right.preview.selectionDigest);
    expect(left.preview.processorDescriptorDigests).toEqual([
      'b'.repeat(64),
      'c'.repeat(64),
    ]);
  });

  it('hard-disables production retention execution and allows synthetic tests only', () => {
    expect(
      authorizeRetentionExecution({
        productionMode: true,
        policySynthetic: true,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      }),
    ).toMatchObject({
      status: 'hard_disabled',
      reason: 'production_path',
    });

    expect(
      authorizeRetentionExecution({
        productionMode: false,
        policySynthetic: true,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      }),
    ).toEqual({ status: 'allowed_synthetic_test' });

    expect(
      authorizeRetentionExecution({
        productionMode: false,
        policySynthetic: false,
        authoritySynthetic: true,
        previewExecuted: false,
        previewExpired: false,
        digestsMatch: true,
      }),
    ).toMatchObject({
      status: 'hard_disabled',
      reason: 'synthetic_fixtures_required',
    });
  });
});

describe('selectActiveRetentionRule', () => {
  const ruleA = privacyRetentionRuleReferenceSchema.parse({
    ruleId: '11111111-1111-4111-8111-111111111111',
    ruleVersionId: '22222222-2222-4222-8222-222222222222',
    engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
      '33333333-3333-4333-8333-333333333333',
    ),
    purposeVersionId: purpose.purposeVersionId,
    policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
    action: 'delete',
    parametersDigest: 'c'.repeat(64),
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    synthetic: true,
  });

  it('denies when no active rule governs the scope', () => {
    expect(
      selectActiveRetentionRule({
        activeRules: [],
        ruleVersionId: ruleA.ruleVersionId,
      }),
    ).toEqual({ reason: 'no_active_retention_rule', status: 'invalid' });
  });

  it('denies when the caller selects a version outside the active set', () => {
    expect(
      selectActiveRetentionRule({
        activeRules: [ruleA],
        ruleVersionId: '99999999-9999-4999-8999-999999999999',
      }),
    ).toEqual({
      reason: 'retention_rule_not_active_for_scope',
      status: 'invalid',
    });
  });

  it('selects the exact caller-identified version without inferring a default', () => {
    const otherVersion = privacyRetentionRuleReferenceSchema.parse({
      ...ruleA,
      ruleVersionId: '44444444-4444-4444-8444-444444444444',
    });

    expect(
      selectActiveRetentionRule({
        activeRules: [otherVersion, ruleA],
        ruleVersionId: ruleA.ruleVersionId,
      }),
    ).toEqual({ rule: ruleA, status: 'selected' });
  });

  it('denies duplicate matches for the selected rule version', () => {
    expect(
      selectActiveRetentionRule({
        activeRules: [ruleA, ruleA],
        ruleVersionId: ruleA.ruleVersionId,
      }),
    ).toEqual({ reason: 'retention_rule_ambiguous', status: 'invalid' });
  });
});

describe('planRetentionPreviewWithRetentionRule', () => {
  const ruleA = privacyRetentionRuleReferenceSchema.parse({
    ruleId: '11111111-1111-4111-8111-111111111111',
    ruleVersionId: '22222222-2222-4222-8222-222222222222',
    engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
      '33333333-3333-4333-8333-333333333333',
    ),
    purposeVersionId: purpose.purposeVersionId,
    policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
    action: 'delete',
    parametersDigest: 'c'.repeat(64),
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    synthetic: true,
  });

  function previewInput() {
    return {
      approvedExceptionIds: [],
      engineeringCategoryId: ruleA.engineeringCategoryId,
      inventoryVersionDigest: '3'.repeat(64),
      policySynthetic: true,
      policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
      processorDescriptorDigests: ['c'.repeat(64)],
      productionMode: false,
      purposeVersionId: ruleA.purposeVersionId,
      ruleVersionId: ruleA.ruleVersionId,
      watermark: '2026-08-18T00:00:00.000Z',
    };
  }

  it('denies the preview when no active rule governs the category/purpose pair', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();

    const result = await planRetentionPreviewWithRetentionRule({
      ...previewInput(),
      retentionRules: repository,
    });

    expect(result).toEqual({
      reason: 'no_active_retention_rule',
      status: 'invalid',
    });
  });

  it('denies the preview when the caller selects a rule version not active for the scope', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();
    await repository.put(ruleA);

    const result = await planRetentionPreviewWithRetentionRule({
      ...previewInput(),
      retentionRules: repository,
      ruleVersionId: '99999999-9999-4999-8999-999999999999',
    });

    expect(result).toEqual({
      reason: 'retention_rule_not_active_for_scope',
      status: 'invalid',
    });
  });

  it('denies the preview when the active rule belongs to a different policy version', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();
    await repository.put(ruleA);

    const result = await planRetentionPreviewWithRetentionRule({
      ...previewInput(),
      policyVersionId: privacyPolicyVersionIdSchema.parse(
        '99999999-9999-4999-8999-999999999999',
      ),
      retentionRules: repository,
    });

    expect(result).toEqual({
      reason: 'retention_rule_policy_mismatch',
      status: 'invalid',
    });
  });

  it('denies the preview when rule and policy synthetic provenance differ', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();
    await repository.put(ruleA);

    const result = await planRetentionPreviewWithRetentionRule({
      ...previewInput(),
      policySynthetic: false,
      retentionRules: repository,
    });

    expect(result).toEqual({
      reason: 'retention_rule_synthetic_mismatch',
      status: 'invalid',
    });
  });

  it('plans the preview once an active rule governs the scope', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();
    await repository.put(ruleA);

    const result = await planRetentionPreviewWithRetentionRule({
      ...previewInput(),
      retentionRules: repository,
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') {
      throw new Error('expected planned');
    }
    expect(result.preview.policyVersionId).toBe(
      privacyPolicyVersionIdSchema.parse(policy.versionId),
    );
  });

  it('binds the exact retention rule into deterministic preview evidence', async () => {
    const otherRule = privacyRetentionRuleReferenceSchema.parse({
      ...ruleA,
      action: 'irreversibly_transform',
      parametersDigest: 'd'.repeat(64),
      ruleId: '55555555-5555-4555-8555-555555555555',
      ruleVersionId: '66666666-6666-4666-8666-666666666666',
    });
    const repositoryA = new SyntheticPrivacyRetentionRuleRepository();
    const repositoryB = new SyntheticPrivacyRetentionRuleRepository();
    await repositoryA.put(ruleA);
    await repositoryB.put(otherRule);

    const previewA = await planRetentionPreviewWithRetentionRule({
      ...previewInput(),
      retentionRules: repositoryA,
    });
    const previewB = await planRetentionPreviewWithRetentionRule({
      ...previewInput(),
      retentionRules: repositoryB,
      ruleVersionId: otherRule.ruleVersionId,
    });

    expect(previewA.status).toBe('planned');
    expect(previewB.status).toBe('planned');
    if (previewA.status !== 'planned' || previewB.status !== 'planned') {
      throw new Error('expected planned previews');
    }
    expect(previewA.preview.selectionDigest).not.toBe(
      previewB.preview.selectionDigest,
    );
    expect(previewA.preview.retentionRuleVersionId).toBe(ruleA.ruleVersionId);
    expect(previewB.preview.retentionRuleVersionId).toBe(
      otherRule.ruleVersionId,
    );
    expect(previewA.preview.retentionRuleDigest).not.toBe(
      previewB.preview.retentionRuleDigest,
    );
  });
});

describe('synthetic retention preview repository', () => {
  it('accepts a planned preview once, keyed by its deterministic selectionDigest', async () => {
    const plan = planRetentionPreview({
      policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
      policySynthetic: true,
      inventoryVersionDigest: '3'.repeat(64),
      processorDescriptorDigests: ['c'.repeat(64), 'b'.repeat(64)],
      watermark: '2026-08-18T00:00:00.000Z',
      approvedExceptionIds: [],
      productionMode: false,
    });
    if (plan.status !== 'planned') {
      throw new Error('expected planned');
    }

    const repository = new SyntheticPrivacyRetentionPreviewRepository();
    const record = {
      ...plan.preview,
      status: 'planned' as const,
      createdAt: '2026-08-18T00:00:01.000Z',
      executedAt: null,
    };

    await expect(repository.put(record)).resolves.toBe('accepted');
    await expect(repository.put(record)).resolves.toBe('conflict');
    await expect(
      repository.getBySelectionDigest(plan.preview.selectionDigest),
    ).resolves.toEqual(record);
    await expect(
      repository.getBySelectionDigest('0'.repeat(64)),
    ).resolves.toBeNull();
  });
});

describe('governance lifecycle proof ledger', () => {
  const requestId = privacySubjectRequestIdSchema.parse(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  );
  const processorId = privacyProcessorIdSchema.parse(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
  );
  const proofId = privacyLifecycleProofIdSchema.parse(
    '22222222-2222-4222-8222-222222222222',
  );

  function record(operationId: string, synthetic = true) {
    return {
      requestId,
      processorId,
      operationId: privacyOperationIdSchema.parse(operationId),
      result: { outcome: 'completed' as const, proofId },
      recordedAt: '2026-08-27T00:00:00.000Z',
      synthetic,
    };
  }

  it('accepts a new proof and rejects a repeat of the same operationId', async () => {
    const ledger = new SyntheticPrivacyGovernanceLifecycleLedger();
    const proof = record('33333333-3333-4333-8333-333333333333');

    await expect(ledger.append(proof)).resolves.toBe('accepted');
    await expect(ledger.append(proof)).resolves.toBe('conflict');
    await expect(ledger.getByOperationId(proof.operationId)).resolves.toEqual(
      proof,
    );
  });

  it('returns null for an unknown operationId', async () => {
    const ledger = new SyntheticPrivacyGovernanceLifecycleLedger();

    await expect(
      ledger.getByOperationId('99999999-9999-4999-8999-999999999999'),
    ).resolves.toBeNull();
  });

  it('records a denied outcome without a proofId', async () => {
    const ledger = new SyntheticPrivacyGovernanceLifecycleLedger();
    const proof = {
      requestId,
      processorId,
      operationId: privacyOperationIdSchema.parse(
        '44444444-4444-4444-8444-444444444444',
      ),
      result: { outcome: 'denied' as const },
      recordedAt: '2026-08-27T00:00:00.000Z',
      synthetic: true,
    };

    await expect(ledger.append(proof)).resolves.toBe('accepted');
    await expect(ledger.getByOperationId(proof.operationId)).resolves.toEqual(
      proof,
    );
  });
});

describe('retention rule repository', () => {
  const ruleA = privacyRetentionRuleReferenceSchema.parse({
    ruleId: '11111111-1111-4111-8111-111111111111',
    ruleVersionId: '22222222-2222-4222-8222-222222222222',
    engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
      '33333333-3333-4333-8333-333333333333',
    ),
    purposeVersionId: purpose.purposeVersionId,
    policyVersionId: privacyPolicyVersionIdSchema.parse(policy.versionId),
    action: 'delete',
    parametersDigest: 'c'.repeat(64),
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    synthetic: true,
  });

  it('accepts a new rule version and rejects a repeat of the same version', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();

    await expect(repository.put(ruleA)).resolves.toBe('accepted');
    await expect(repository.put(ruleA)).resolves.toBe('conflict');
    await expect(
      repository.getActiveVersion(ruleA.ruleVersionId),
    ).resolves.toEqual(ruleA);
  });

  it('returns null for an unknown rule version', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();

    await expect(
      repository.getActiveVersion('99999999-9999-4999-8999-999999999999'),
    ).resolves.toBeNull();
  });

  it('lists only rule versions bound to the exact category and purpose pair', async () => {
    const repository = new SyntheticPrivacyRetentionRuleRepository();
    const otherCategory = privacyRetentionRuleReferenceSchema.parse({
      ...ruleA,
      ruleVersionId: '44444444-4444-4444-8444-444444444444',
      engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
        '55555555-5555-4555-8555-555555555555',
      ),
    });

    await repository.put(ruleA);
    await repository.put(otherCategory);

    const matched = await repository.listActiveForCategoryAndPurpose(
      ruleA.engineeringCategoryId,
      ruleA.purposeVersionId,
    );
    expect(matched).toEqual([ruleA]);
  });
});

describe('synthetic privacy readiness probe', () => {
  it('reports every component not ready with the standing legal-privacy stop and mechanism/production both false', async () => {
    const probe = new SyntheticPrivacyReadinessProbe({
      evaluatedAt: '2026-08-27T00:00:00.000Z',
    });

    const result = await probe.evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(result.productionReady).toBe(false);
    expect(result.evaluatedAt).toBe('2026-08-27T00:00:00.000Z');
    expect(result.diagnosticCodes).toContain('legal_privacy_decision_required');
    expect(result.components).toContainEqual({
      componentId: 'contracts',
      state: 'ready',
      diagnosticCode: null,
    });
    expect(result.components).toContainEqual({
      componentId: 'migrations',
      state: 'not_ready',
      diagnosticCode: 'migration_missing',
    });
    expect(result.components).toHaveLength(10);
  });
});

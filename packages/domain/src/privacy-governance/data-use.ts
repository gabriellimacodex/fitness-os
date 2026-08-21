import {
  privacyAuditEventReferenceSchema,
  privacyDataUseDecisionSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacySyntheticProcessorCommandSchema,
  privacySyntheticProcessorResultSchema,
  type PrivacyCorrelationId,
  type PrivacyDataUseDecision,
  type PrivacyDataUseDenyReason,
  type PrivacyOperationId,
} from '@fitness-os/schemas';

import type {
  PrivacyDataUseEvaluationInput,
  PrivacyDataUseEvaluationResult,
  PrivacyDataUsePorts,
} from './ports.js';

const deny = (
  reasonCode: PrivacyDataUseDenyReason,
  evaluatedAt: string,
  correlationId: PrivacyCorrelationId,
): PrivacyDataUseDecision =>
  privacyDataUseDecisionSchema.parse({
    outcome: 'denied',
    reasonCode,
    evaluatedAt,
    correlationId,
  });

export async function evaluateDataUse(
  ports: PrivacyDataUsePorts,
  input: PrivacyDataUseEvaluationInput,
): Promise<PrivacyDataUseEvaluationResult> {
  const evaluatedAt = ports.clock.nowUtcMs();
  const correlationId = ports.ids.correlationId();
  const operationId = ports.ids.operationId();

  const purpose = await ports.purposes.getVersion(input.purposeVersionId);
  if (purpose === null) {
    return commitDecision(
      ports,
      deny('purpose_unknown', evaluatedAt, correlationId),
      operationId,
    );
  }

  const policy = await ports.policies.getActive(input.policyVersionId);
  if (policy === null) {
    return commitDecision(
      ports,
      deny('policy_missing', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (input.productionMode && input.actor.synthetic) {
    return commitDecision(
      ports,
      deny('actor_context_synthetic_in_production', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (input.productionMode && policy.synthetic) {
    return commitDecision(
      ports,
      deny('policy_synthetic_in_production', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (!input.actor.authorityClaims.includes('data_use_evaluate')) {
    return commitDecision(
      ports,
      deny('actor_context_lacking_authority', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (purpose.activationState !== 'active') {
    return commitDecision(
      ports,
      deny('purpose_inactive', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (purpose.policyVersionId !== policy.versionId) {
    return commitDecision(
      ports,
      deny('purpose_version_mismatched', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (!purpose.allowedOperationKinds.includes(input.operationKind)) {
    return commitDecision(
      ports,
      deny('operation_outside_purpose_binding', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (!purpose.allowedCategoryIds.includes(input.engineeringCategoryId)) {
    return commitDecision(
      ports,
      deny('category_outside_purpose_binding', evaluatedAt, correlationId),
      operationId,
    );
  }

  const processor = await ports.processors.getDescriptor(input.processorId);
  if (processor === null) {
    return commitDecision(
      ports,
      deny('processor_absent', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (input.productionMode && processor.synthetic) {
    return commitDecision(
      ports,
      deny('processor_undeclared', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (!processor.allowedPurposeIds.includes(purpose.purposeId)) {
    return commitDecision(
      ports,
      deny('processor_descriptor_mismatched', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (
    input.processorCapability !== 'access' ||
    !processor.capabilities.includes(input.processorCapability)
  ) {
    return commitDecision(
      ports,
      deny('processor_descriptor_mismatched', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (
    purpose.evidenceRequired &&
    (input.evidenceId === null || input.evidenceId.length === 0)
  ) {
    return commitDecision(
      ports,
      deny('evidence_missing', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (input.evidenceId !== null) {
    const evidence = await ports.evidence.getEvidence(input.evidenceId);
    if (evidence === null) {
      return commitDecision(
        ports,
        deny('evidence_invalid', evaluatedAt, correlationId),
        operationId,
      );
    }

    if (evidence.purposeId !== purpose.purposeId) {
      return commitDecision(
        ports,
        deny('evidence_mismatched', evaluatedAt, correlationId),
        operationId,
      );
    }

    const withdrawal = await ports.evidence.getAuthoritativeWithdrawal(
      input.evidenceId,
    );
    if (withdrawal !== null && withdrawal.state === 'withdrawn') {
      return commitDecision(
        ports,
        deny('evidence_withdrawn', evaluatedAt, correlationId),
        operationId,
      );
    }
  }

  let boundProcessor;
  try {
    boundProcessor = await ports.processorResolver.resolve(input.processorId);
  } catch {
    return commitDecision(
      ports,
      deny('dependency_unavailable', evaluatedAt, correlationId),
      operationId,
    );
  }

  if (boundProcessor === null) {
    return commitDecision(
      ports,
      deny('processor_handler_missing', evaluatedAt, correlationId),
      operationId,
    );
  }

  let boundDescriptor;
  try {
    boundDescriptor = privacyProcessorDescriptorReferenceSchema.safeParse(
      boundProcessor.descriptorReference(),
    );
  } catch {
    return commitDecision(
      ports,
      deny('dependency_unavailable', evaluatedAt, correlationId),
      operationId,
    );
  }
  if (
    !boundDescriptor.success ||
    boundDescriptor.data.processorId !== processor.processorId ||
    boundDescriptor.data.descriptorDigest !== processor.descriptorDigest ||
    !boundDescriptor.data.capabilities.includes(input.processorCapability)
  ) {
    return commitDecision(
      ports,
      deny('processor_descriptor_mismatched', evaluatedAt, correlationId),
      operationId,
    );
  }

  const allowed = privacyDataUseDecisionSchema.parse({
    outcome: 'allowed',
    subjectScopeId: input.subjectScopeId,
    actorContextDigest: input.actor.principalReferenceDigest,
    purposeVersionId: purpose.purposeVersionId,
    operationKind: input.operationKind,
    engineeringCategoryId: input.engineeringCategoryId,
    processorDescriptorVersionDigest: processor.descriptorDigest,
    policyVersionId: policy.versionId,
    policyDigest: policy.contentDigest,
    evaluatedAt,
    correlationId,
  });

  const committed = await commitDecision(ports, allowed, operationId);
  if (committed.status === 'audit_unavailable') {
    return committed;
  }

  try {
    const command = privacySyntheticProcessorCommandSchema.parse({
      processorId: input.processorId,
      capability: input.processorCapability,
      subjectScopeId: input.subjectScopeId,
      correlationId,
      operationId,
      productionMode: input.productionMode,
    });
    const result = privacySyntheticProcessorResultSchema.parse(
      await boundProcessor.execute(command),
    );
    if (
      result.status !== 'completed' ||
      result.operationId !== operationId ||
      result.correlationId !== correlationId ||
      result.capability !== input.processorCapability
    ) {
      throw new Error('processor result correlation mismatch');
    }
  } catch {
    throw new Error('Privacy processor execution failed');
  }

  return committed;
}

async function commitDecision(
  ports: PrivacyDataUsePorts,
  decision: PrivacyDataUseDecision,
  operationId: PrivacyOperationId,
): Promise<PrivacyDataUseEvaluationResult> {
  const audit = privacyAuditEventReferenceSchema.parse({
    auditEventId: ports.ids.auditEventId(),
    kind: 'data_use_evaluated',
    outcome: decision.outcome === 'allowed' ? 'succeeded' : 'denied',
    reasonCode: decision.outcome === 'denied' ? decision.reasonCode : null,
    policyVersionId:
      decision.outcome === 'allowed' ? decision.policyVersionId : null,
    evidenceId: null,
    requestId: null,
    operationId,
    correlationId: decision.correlationId,
    recordedAt: decision.evaluatedAt,
  });

  const appended = await ports.audit.append(audit);
  if (appended === 'unavailable') {
    const failClosedDecision = {
      outcome: 'denied',
      reasonCode: 'audit_unavailable',
      evaluatedAt: decision.evaluatedAt,
      correlationId: decision.correlationId,
    } as const;
    return {
      decision: failClosedDecision,
      status: 'audit_unavailable',
    };
  }

  return { decision, status: 'evaluated' };
}

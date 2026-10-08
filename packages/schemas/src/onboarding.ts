import { z } from 'zod';

const uuidV4 = () => z.uuidv4();

export const principalIdSchema = uuidV4().brand<'PrincipalId'>();
export const principalBindingIdSchema = uuidV4().brand<'PrincipalBindingId'>();
export const principalRoleMappingIdSchema =
  uuidV4().brand<'PrincipalRoleMappingId'>();
export const principalReferenceAliasIdSchema =
  uuidV4().brand<'PrincipalReferenceAliasId'>();
export const onboardingInvitationIdSchema =
  uuidV4().brand<'OnboardingInvitationId'>();
export const onboardingAttemptIdSchema =
  uuidV4().brand<'OnboardingAttemptId'>();
export const onboardingOperationIdSchema =
  uuidV4().brand<'OnboardingOperationId'>();
export const onboardingCompletionIdSchema =
  uuidV4().brand<'OnboardingCompletionId'>();
export const onboardingPolicyInteractionIdSchema =
  uuidV4().brand<'OnboardingPolicyInteractionId'>();
export const onboardingPolicyEvidenceIdSchema =
  uuidV4().brand<'OnboardingPolicyEvidenceId'>();
export const onboardingPolicyPackageIdSchema =
  uuidV4().brand<'OnboardingPolicyPackageId'>();

export const principalReferenceSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
  .brand<'PrincipalReference'>();

export const retryTokenSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
  .brand<'OnboardingRetryToken'>();

export const invitationClaimSecretSchema = z
  .string()
  .min(22)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/)
  .brand<'InvitationClaimSecret'>();

export const opaqueCursorSchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const proposedRoleSchema = z.enum(['student', 'coach']);
export const invitationPurposeSchema = z.enum([
  'coach_bootstrap',
  'student_onboarding',
]);
export const invitationStateSchema = z.enum([
  'issued',
  'claimed',
  'revoked',
  'expired',
]);
export const attemptLifecycleSchema = z.enum([
  'policy_pending',
  'ready_to_claim',
  'completed',
  'terminal',
]);
export const attemptTerminalReasonSchema = z.enum([
  'abandoned',
  'expired',
  'superseded',
  'invitation_unavailable',
  'mapping_conflict',
  'hard_disabled',
]);
export const sessionContextClassificationSchema = z.enum([
  'unauthenticated',
  'pre_binding',
  'bound',
  'synthetic',
]);
export const canonicalizationVersionSchema = z.literal('utf8-json-sha256.v1');
export const onboardingCommandNamespaceSchema = z.enum([
  'create_attempt',
  'resume_attempt',
  'abandon_attempt',
  'refresh_policy',
  'claim_attempt',
  'issue_student_invitation',
  'revoke_student_invitation',
  'inspect_invitation',
]);
export const operationStateSchema = z.enum([
  'operation_pending',
  'operation_reconciling',
  'operation_committed',
  'operation_replayed',
  'operation_input_mismatch',
]);
export const selectionResultSchema = z.enum([
  'attempt_selected',
  'selection_required',
  'no_active_attempt',
  'active_attempt_limit_reached',
]);
export const policyGatewayStatusSchema = z.enum([
  'interaction_pending',
  'ready',
  'blocked',
]);
export const commandOutcomeSchema = z.enum([
  'command_succeeded',
  'completed',
  'current_state',
  'already_terminal',
  'invalid_or_unavailable',
  'mapping_conflict',
]);
export const boundaryOutcomeSchema = z.enum([
  'unauthenticated',
  'forbidden',
  'dependency_unavailable',
  'internal_corrupt_state',
]);

export const inspectInvitationRequestSchema = z
  .object({
    claimSecret: invitationClaimSecretSchema,
  })
  .strict();

export const inspectInvitationResponseSchema = z
  .object({
    purpose: invitationPurposeSchema,
    proposedRole: proposedRoleSchema,
    state: z.literal('issued'),
  })
  .strict();

export const createAttemptRequestSchema = z
  .object({
    retryToken: retryTokenSchema,
    claimSecret: invitationClaimSecretSchema,
  })
  .strict();

export const resumeAttemptRequestSchema = z
  .object({
    retryToken: retryTokenSchema,
  })
  .strict();

export const abandonAttemptRequestSchema = z
  .object({
    retryToken: retryTokenSchema,
  })
  .strict();

export const policyRefreshRequestSchema = z
  .object({
    retryToken: retryTokenSchema,
  })
  .strict();

export const claimAttemptRequestSchema = z
  .object({
    retryToken: retryTokenSchema,
    claimSecret: invitationClaimSecretSchema,
  })
  .strict();

export const issueStudentInvitationRequestSchema = z
  .object({
    retryToken: retryTokenSchema,
  })
  .strict();

export const revokeStudentInvitationRequestSchema = z
  .object({
    retryToken: retryTokenSchema,
  })
  .strict();

export const attemptLocatorSchema = z
  .object({
    attemptId: onboardingAttemptIdSchema,
  })
  .strict();

export const invitationLocatorSchema = z
  .object({
    invitationId: onboardingInvitationIdSchema,
  })
  .strict();

export const emptyOnboardingQuerySchema = z.object({}).strict();

export const onboardingCurrentQuerySchema = z
  .object({
    cursor: opaqueCursorSchema.optional(),
  })
  .strict();

export const attemptSummarySchema = z
  .object({
    attemptId: onboardingAttemptIdSchema,
    proposedRole: proposedRoleSchema,
    purpose: invitationPurposeSchema,
    lifecycle: attemptLifecycleSchema,
    ordinal: z.number().int().min(1).max(4),
  })
  .strict();

export const roleMappingSummarySchema = z
  .object({
    mappingId: principalRoleMappingIdSchema,
    role: proposedRoleSchema,
  })
  .strict();

export const currentOnboardingResponseSchema = z
  .object({
    mappings: z.array(roleMappingSummarySchema).max(2),
    attempts: z.array(attemptSummarySchema).max(4),
    nextCursor: opaqueCursorSchema.nullable(),
  })
  .strict();

export const policyHandoffSchema = z
  .object({
    status: policyGatewayStatusSchema,
    interactionId: onboardingPolicyInteractionIdSchema,
    packageId: onboardingPolicyPackageIdSchema,
    evidenceId: onboardingPolicyEvidenceIdSchema.nullable(),
    integrityDigest: sha256HexSchema,
    packageVersion: z.number().int().min(1),
  })
  .strict();

export const attemptDetailSchema = z
  .object({
    attemptId: onboardingAttemptIdSchema,
    invitationId: onboardingInvitationIdSchema,
    proposedRole: proposedRoleSchema,
    purpose: invitationPurposeSchema,
    lifecycle: attemptLifecycleSchema,
    ordinal: z.number().int().min(1).max(4),
    predecessorAttemptId: onboardingAttemptIdSchema.nullable(),
    terminalReason: attemptTerminalReasonSchema.nullable(),
    policy: policyHandoffSchema.nullable(),
  })
  .strict();

export const studentInvitationMetadataSchema = z
  .object({
    invitationId: onboardingInvitationIdSchema,
    state: invitationStateSchema,
    purpose: z.literal('student_onboarding'),
  })
  .strict();

export const studentInvitationListResponseSchema = z
  .object({
    items: z.array(studentInvitationMetadataSchema).max(50),
  })
  .strict();

export const issuedInvitationResponseSchema = z
  .object({
    invitationId: onboardingInvitationIdSchema,
    claimSecret: invitationClaimSecretSchema,
    purpose: z.literal('student_onboarding'),
    state: z.literal('issued'),
  })
  .strict();

export const operationEnvelopeSchema = z
  .object({
    operationId: onboardingOperationIdSchema,
    namespace: onboardingCommandNamespaceSchema,
    canonicalizationVersion: canonicalizationVersionSchema,
    digest: sha256HexSchema,
    state: operationStateSchema,
  })
  .strict();

export const onboardingCommandResultSchema = z.union([
  z
    .object({
      outcome: z.literal('command_succeeded'),
      command: z.literal('inspect_invitation'),
      inspection: inspectInvitationResponseSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('command_succeeded'),
      command: z.literal('attempt'),
      attempt: attemptDetailSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('command_succeeded'),
      command: z.literal('issue_student_invitation'),
      issued: issuedInvitationResponseSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('command_succeeded'),
      command: z.literal('revoke_student_invitation'),
      invitation: studentInvitationMetadataSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('completed'),
      completionId: onboardingCompletionIdSchema,
      mappingId: principalRoleMappingIdSchema,
      role: proposedRoleSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('current_state'),
      attempt: attemptDetailSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('already_terminal'),
      attempt: attemptDetailSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal('invalid_or_unavailable'),
    })
    .strict(),
  z
    .object({
      outcome: z.literal('mapping_conflict'),
    })
    .strict(),
  z
    .object({
      outcome: z.enum([
        'attempt_selected',
        'selection_required',
        'no_active_attempt',
        'active_attempt_limit_reached',
      ]),
      attempts: z.array(attemptSummarySchema).max(4),
    })
    .strict(),
]);

export const onboardingOperationResponseSchema = z
  .object({
    operation: operationEnvelopeSchema,
    result: onboardingCommandResultSchema.nullable(),
  })
  .strict();

export const onboardingMechanismReadinessSchema = z
  .object({
    ready: z.boolean(),
    diagnostics: z.array(
      z.enum([
        'synthetic_adapter',
        'missing_keyring',
        'replica_epoch_mismatch',
        'required_migration_missing',
        'production_stop_active',
      ]),
    ),
  })
  .strict();

// PRD 07 Contracts: "a safe onboarding readiness schema or closed readiness
// classifications." Mirrors `OnboardingReadinessDiagnostic` /
// `OnboardingReadinessComponentId` / `OnboardingReadinessComponent` /
// `OnboardingReadinessResult` in
// `packages/domain/src/onboarding/readiness.ts` exactly, so a frozen
// contract exists for `GET /v1/onboarding/synthetic/readiness`'s response
// (the same role `privacyReadinessResultSchema` plays for the analogous
// privacy-governance route).
export const onboardingReadinessDiagnosticCodeSchema = z.enum([
  'migration_missing',
  'schema_mismatch',
  'identity_adapter_missing',
  'identity_adapter_synthetic',
  'policy_gateway_missing',
  'policy_gateway_synthetic',
  'policy_gateway_blocked',
  'credential_unavailable',
  'operation_reconciliation_incomplete',
  'dual_role_self_coach_bypass',
  'recovery_unverified',
  'configuration_mismatch',
  'legal_privacy_decision_required',
  'human_perception_required',
]);
export type OnboardingReadinessDiagnosticCode = z.infer<
  typeof onboardingReadinessDiagnosticCodeSchema
>;

export const onboardingReadinessComponentStateSchema = z.enum([
  'ready',
  'not_ready',
]);
export type OnboardingReadinessComponentState = z.infer<
  typeof onboardingReadinessComponentStateSchema
>;

export const onboardingReadinessComponentIdSchema = z.enum([
  'schema',
  'clock',
  'id_factory',
  'secret_factory',
  'invitation_repository',
  'attempt_repository',
  'operation_repository',
  'role_mapping_repository',
  'secret_verifier',
  'identity_adapter',
  'policy_gateway',
]);
export type OnboardingReadinessComponentId = z.infer<
  typeof onboardingReadinessComponentIdSchema
>;

// Unlike the analogous privacy-governance component schema, a 'ready'
// onboarding component may still carry an advisory diagnosticCode (e.g.
// `identity_adapter_synthetic`/`policy_gateway_synthetic` for a component
// that is mechanically ready but not production-grade) — this is real,
// already-shipped behavior in `SyntheticOnboardingReadinessProbe`, not a gap.
// Only the fail-closed direction is a genuine invariant: a 'not_ready'
// component must always carry a closed diagnosticCode as evidence.
export const onboardingReadinessComponentSchema = z
  .object({
    componentId: onboardingReadinessComponentIdSchema,
    state: onboardingReadinessComponentStateSchema,
    diagnosticCode: onboardingReadinessDiagnosticCodeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.state === 'not_ready' && value.diagnosticCode === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'a not_ready component requires a closed diagnosticCode',
        path: ['diagnosticCode'],
      });
    }
  });
export type OnboardingReadinessComponent = z.infer<
  typeof onboardingReadinessComponentSchema
>;

const onboardingReadinessEvaluatedAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

/**
 * `mechanismReady: true` never implies `productionReady: true` by itself;
 * production additionally requires a non-synthetic identity/policy
 * composition and the real-user activation decision to have cleared (PRD 07,
 * "Readiness": "Production onboarding readiness additionally requires ...").
 * `productionReady` can therefore only be true when `mechanismReady` is also
 * true — the converse does not hold.
 */
export const onboardingReadinessResultSchema = z
  .object({
    evaluatedAt: onboardingReadinessEvaluatedAtSchema,
    mechanismReady: z.boolean(),
    productionReady: z.boolean(),
    components: z.array(onboardingReadinessComponentSchema).max(32),
    diagnosticCodes: z.array(onboardingReadinessDiagnosticCodeSchema).max(64),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.productionReady && !value.mechanismReady) {
      ctx.addIssue({
        code: 'custom',
        message: 'productionReady requires mechanismReady',
        path: ['productionReady'],
      });
    }
  });
export type OnboardingReadinessResult = z.infer<
  typeof onboardingReadinessResultSchema
>;

export type PrincipalId = z.infer<typeof principalIdSchema>;
export type PrincipalBindingId = z.infer<typeof principalBindingIdSchema>;
export type PrincipalRoleMappingId = z.infer<
  typeof principalRoleMappingIdSchema
>;
export type PrincipalReference = z.infer<typeof principalReferenceSchema>;
export type OnboardingInvitationId = z.infer<
  typeof onboardingInvitationIdSchema
>;
export type OnboardingAttemptId = z.infer<typeof onboardingAttemptIdSchema>;
export type OnboardingOperationId = z.infer<typeof onboardingOperationIdSchema>;
export type InvitationClaimSecret = z.infer<typeof invitationClaimSecretSchema>;
export type OnboardingRetryToken = z.infer<typeof retryTokenSchema>;
export type AttemptDetail = z.infer<typeof attemptDetailSchema>;
export type PolicyHandoff = z.infer<typeof policyHandoffSchema>;
export type OnboardingOperationResponse = z.infer<
  typeof onboardingOperationResponseSchema
>;

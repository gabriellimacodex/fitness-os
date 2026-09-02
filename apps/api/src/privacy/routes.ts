import {
  buildRequestProcessorPlan,
  compareExpectedInventoryToRuntime,
  createPrivacyGovernanceExecutionReceiptVerifier,
  createSyntheticPrivacyDataUsePorts,
  digestRetentionExecutionInput,
  evaluateDataUse,
  planRetentionPreview,
  planRetentionPreviewWithRetentionRule,
  planWithdrawal,
  recordProcessorStepAndAdvanceRequest,
  resolveRetentionExecutionAuthorization,
  SyntheticPrivacyAuthorizationEvidenceLedger,
  SyntheticPrivacyGovernanceLifecycleLedger,
  SyntheticPrivacyGovernanceLifecycleBindingVerifier,
  SyntheticPrivacyIdFactory,
  SyntheticPrivacyAttributionVerifier,
  SyntheticPrivacyIntegrityVerifier,
  SyntheticPrivacyProcessorStepRepository,
  SyntheticPrivacyRetentionRuleRepository,
  SyntheticPrivacySubjectDataProcessor,
  SyntheticPrivacySubjectRequestRepository,
  SyntheticPrivacyTrustedClock,
  type PrivacyAttributionVerifier,
  type PrivacyAuditSink,
  type PrivacyAuthorizationEvidenceLedger,
  type PrivacyExpectedProcessorInventoryPort,
  type PrivacyGovernanceExecutionReceiptSource,
  type PrivacyGovernanceLifecycleLedger,
  type PrivacyGovernanceLifecycleBindingVerifier,
  type PrivacyIdFactory,
  type PrivacyIntegrityVerifier,
  type PrivacyPolicyPackageRepository,
  type PrivacyProcessorStepRepository,
  type PrivacyPurposeRegistry,
  type PrivacyRetentionPreviewRepository,
  type PrivacyRetentionRuleRepository,
  type PrivacyRuntimeProcessorRegistry,
  type PrivacySubjectRequestRepository,
  type PrivacySubjectDataProcessorResolver,
  type PrivacyTrustedClock,
} from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  privacyGovernanceLifecycleProofReferenceSchema,
  privacyReadinessResultSchema,
  privacySyntheticDataUseEvaluateRequestSchema,
  privacySyntheticDataUseEvaluateResponseSchema,
  privacySyntheticExpectedInventoryResponseSchema,
  privacySyntheticGovernanceLifecycleRecordRequestSchema,
  privacySyntheticGovernanceLifecycleRecordResponseSchema,
  privacySyntheticInventoryCoverageRequestSchema,
  privacySyntheticInventoryCoverageResponseSchema,
  privacySyntheticRuntimeProcessorsResponseSchema,
  privacySyntheticProcessorExecuteRequestSchema,
  privacySyntheticProcessorExecuteResponseSchema,
  privacySyntheticProcessorPlanRequestSchema,
  privacySyntheticProcessorPlanResponseSchema,
  privacySyntheticProcessorStepRecordRequestSchema,
  privacySyntheticProcessorStepRecordResponseSchema,
  privacySyntheticRetentionExecutionAuthorizeRequestSchema,
  privacySyntheticRetentionExecutionAuthorizeResponseSchema,
  privacySyntheticRetentionPreviewRequestSchema,
  privacySyntheticRetentionPreviewResponseSchema,
  privacySubjectRequestIdentityEquals,
  privacySyntheticSubjectRequestTransitionRequestSchema,
  privacySyntheticSubjectRequestTransitionResponseSchema,
  privacySyntheticWithdrawalPlanRequestSchema,
  privacySyntheticWithdrawalPlanResponseSchema,
  type ApiErrorCode,
  type PrivacyGovernanceLifecycleBinding,
  type PrivacyReadinessResult,
  type PrivacyRetentionPreviewRecord,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface PrivacySyntheticOptions {
  /** Complete, fail-closed mechanism evidence. Omission is never ready. */
  readiness?: {
    evaluate(): Promise<PrivacyReadinessResult>;
  };
  /**
   * Optional trusted clock. Defaults to `SyntheticPrivacyTrustedClock` using
   * `clock.nowUtcMs()` (or the synthetic default instant).
   */
  clock?: PrivacyTrustedClock;
  /** Fixed clock for deterministic tests; defaults to domain synthetic clock. */
  fixedUtcMs?: string;
  /**
   * Optional ID factory for audit/correlation/operation/subject-scope IDs.
   * Defaults to `SyntheticPrivacyIdFactory`.
   */
  ids?: PrivacyIdFactory;
  /**
   * Optional subject-request repository. Defaults to an in-memory synthetic
   * repository shared for the lifetime of this route registration.
   */
  subjectRequests?: PrivacySubjectRequestRepository;
  /**
   * Optional append-only processor-step repository. Defaults to an
   * in-memory synthetic repository shared for the lifetime of this route
   * registration.
   */
  processorSteps?: PrivacyProcessorStepRepository;
  /**
   * Optional disposable governance-lifecycle proof ledger (e.g. Postgres).
   * Defaults to an in-memory synthetic ledger shared for the lifetime of
   * this route registration. Recording a row is not authorization to
   * execute a governance-lifecycle command.
   */
  governanceLifecycle?: PrivacyGovernanceLifecycleLedger;
  /**
   * Read-only receipts from an execution/coordinator authority that is
   * independent from `governanceLifecycle`, the append target. Used only when
   * an explicit `governanceLifecycleVerifier` is not supplied.
   */
  governanceExecutionReceipts?: PrivacyGovernanceExecutionReceiptSource;
  /**
   * Composition-owned verifier for the exact request/processor/operation/result
   * tuple. Defaults to an empty fail-closed verifier.
   */
  governanceLifecycleVerifier?: PrivacyGovernanceLifecycleBindingVerifier;
  /**
   * Optional disposable evidence ledger (e.g. Postgres). When omitted, the
   * in-memory synthetic ledger is used and may be seeded from the request body.
   */
  evidence?: PrivacyAuthorizationEvidenceLedger;
  /**
   * Optional disposable audit sink. When omitted, the in-memory synthetic sink
   * is used.
   */
  audit?: PrivacyAuditSink;
  /**
   * Optional disposable policy package repository. When set, data-use-evaluate
   * loads policy by version id from this port instead of seeding in-memory.
   */
  policies?: PrivacyPolicyPackageRepository;
  /**
   * Optional disposable purpose registry. When set, data-use-evaluate loads
   * purpose by version id from this port instead of seeding in-memory.
   */
  purposes?: PrivacyPurposeRegistry;
  /**
   * Optional reviewed expected-inventory port. When set, inventory-coverage may
   * omit `expected` in the request body and load it from this port.
   */
  expectedInventory?: PrivacyExpectedProcessorInventoryPort;
  /**
   * Optional runtime processor registry. When set, inventory-coverage may omit
   * `runtime` in the request body and load descriptors via `listDescriptors`;
   * data-use-evaluate also loads the processor from this port instead of seeding.
   */
  processors?: PrivacyRuntimeProcessorRegistry;
  /** Explicitly bound processor handlers; descriptors never create handlers. */
  processorResolver?: PrivacySubjectDataProcessorResolver;
  /**
   * Optional integrity verifier. Defaults to a synthetic sealer that production
   * readiness continues to reject.
   */
  integrityVerifier?: PrivacyIntegrityVerifier;
  /**
   * Optional attribution verifier for opaque synthetic actor/subject bindings.
   */
  attributionVerifier?: PrivacyAttributionVerifier;
  /**
   * Optional disposable retention preview repository (e.g. Postgres). When
   * set, a successfully planned retention preview is additionally persisted
   * keyed by its deterministic `selectionDigest`; execution authorization reads
   * it back and atomically binds the `planned` -> `executed` transition to one
   * operation ID. No processor deletion/transformation occurs on this route.
   */
  retentionPreviews?: PrivacyRetentionPreviewRepository;
  /**
   * Optional retention-rule registry (e.g. Postgres). Defaults to an
   * in-memory synthetic registry shared for the lifetime of this route
   * registration, seeded with no rules — an unrecognized request keeps
   * failing closed as `no_active_retention_rule` until a rule is seeded or
   * injected. Only consulted when a request includes
   * `retentionRuleSelection`.
   */
  retentionRules?: PrivacyRetentionRuleRepository;
}

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: 400 | 404 | 503,
  code: ApiErrorCode,
  message: string,
) {
  reply.header('cache-control', 'no-store');

  return reply.code(statusCode).send(
    apiErrorResponseSchema.parse({
      error: {
        code,
        message,
        requestId: request.id,
      },
    }),
  );
}

function sameGovernanceLifecycleBinding(
  presented: PrivacyGovernanceLifecycleBinding,
  trusted: PrivacyGovernanceLifecycleBinding,
): boolean {
  return (
    presented.requestId === trusted.requestId &&
    presented.processorId === trusted.processorId &&
    presented.operationId === trusted.operationId &&
    presented.result.outcome === trusted.result.outcome &&
    (presented.result.outcome === 'denied' ||
      (trusted.result.outcome !== 'denied' &&
        presented.result.proofId === trusted.result.proofId))
  );
}

function unavailableSyntheticMechanismReadiness(
  evaluatedAt: string,
): PrivacyReadinessResult {
  return privacyReadinessResultSchema.parse({
    mechanismReady: false,
    productionReady: false,
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    schemaDigest: 'a'.repeat(64),
    inventoryVersionDigest: 'b'.repeat(64),
    components: [
      {
        componentId: 'contracts',
        state: 'ready',
        diagnosticCode: null,
      },
      {
        componentId: 'migrations',
        state: 'not_ready',
        diagnosticCode: 'migration_missing',
      },
      {
        componentId: 'repositories',
        state: 'unavailable',
        diagnosticCode: 'repository_unavailable',
      },
      {
        componentId: 'audit_sink',
        state: 'unavailable',
        diagnosticCode: 'audit_unavailable',
      },
      {
        componentId: 'expected_inventory',
        state: 'not_ready',
        diagnosticCode: 'inventory_mismatch',
      },
      {
        componentId: 'runtime_processors',
        state: 'not_ready',
        diagnosticCode: 'processor_missing',
      },
      {
        componentId: 'governance_lifecycle',
        state: 'not_ready',
        diagnosticCode: 'governance_table_lifecycle_missing',
      },
      {
        componentId: 'identity_boundary',
        state: 'not_ready',
        diagnosticCode: 'identity_boundary_missing',
      },
      {
        componentId: 'policy_package',
        state: 'not_ready',
        diagnosticCode: 'policy_missing',
      },
      {
        componentId: 'recovery',
        state: 'not_ready',
        diagnosticCode: 'recovery_unverified',
      },
    ],
    diagnosticCodes: [
      'audit_unavailable',
      'governance_table_lifecycle_missing',
      'identity_boundary_missing',
      'inventory_mismatch',
      'legal_privacy_decision_required',
      'migration_missing',
      'policy_missing',
      'processor_missing',
      'recovery_unverified',
      'repository_unavailable',
    ],
    evaluatedAt,
  });
}

/**
 * Disposable synthetic privacy surfaces only. Must never be composed without
 * `allowSyntheticPrivacy`. Public production privacy routes remain unauthorized.
 */
export function registerPrivacySyntheticRoutes(
  app: FastifyInstance,
  options: PrivacySyntheticOptions = {},
): void {
  const fixedUtcMs = options.fixedUtcMs ?? '2026-08-18T12:00:00.000Z';
  const clock = options.clock ?? new SyntheticPrivacyTrustedClock(fixedUtcMs);
  const ids = options.ids ?? new SyntheticPrivacyIdFactory();
  const subjectRequests =
    options.subjectRequests ?? new SyntheticPrivacySubjectRequestRepository();
  const processorSteps =
    options.processorSteps ?? new SyntheticPrivacyProcessorStepRepository();
  const governanceLifecycle =
    options.governanceLifecycle ??
    new SyntheticPrivacyGovernanceLifecycleLedger();
  const governanceLifecycleVerifier =
    options.governanceLifecycleVerifier ??
    (options.governanceExecutionReceipts === undefined
      ? new SyntheticPrivacyGovernanceLifecycleBindingVerifier()
      : createPrivacyGovernanceExecutionReceiptVerifier(
          options.governanceExecutionReceipts,
        ));
  const injectedEvidence = options.evidence;
  const injectedAudit = options.audit;
  const injectedPolicies = options.policies;
  const injectedPurposes = options.purposes;
  const expectedInventory = options.expectedInventory;
  const processors = options.processors;
  const readiness = options.readiness;
  const retentionPreviews = options.retentionPreviews;
  const retentionRules =
    options.retentionRules ?? new SyntheticPrivacyRetentionRuleRepository();

  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/v1/privacy/synthetic')) {
      reply.header('cache-control', 'no-store');
    }
    return payload;
  });

  app.get('/v1/privacy/synthetic/readiness', async () => {
    const result = privacyReadinessResultSchema.parse(
      readiness === undefined
        ? unavailableSyntheticMechanismReadiness(clock.nowUtcMs())
        : await readiness.evaluate(),
    );
    if (
      result.productionReady ||
      !result.diagnosticCodes.includes('legal_privacy_decision_required')
    ) {
      throw new Error('Synthetic privacy cannot clear the active legal stop');
    }
    return result;
  });

  app.get(
    '/v1/privacy/synthetic/expected-inventory',
    async (request, reply) => {
      if (expectedInventory === undefined) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }

      const inventory = await expectedInventory.getInventory();
      return privacySyntheticExpectedInventoryResponseSchema.parse({
        evaluatedAt: clock.nowUtcMs(),
        inventory,
      });
    },
  );

  app.get(
    '/v1/privacy/synthetic/runtime-processors',
    async (request, reply) => {
      if (processors === undefined) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }

      const runtime = await processors.listDescriptors();
      return privacySyntheticRuntimeProcessorsResponseSchema.parse({
        evaluatedAt: clock.nowUtcMs(),
        runtime,
      });
    },
  );

  app.post(
    '/v1/privacy/synthetic/data-use-evaluate',
    async (request, reply) => {
      const body = privacySyntheticDataUseEvaluateRequestSchema.safeParse(
        request.body,
      );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const syntheticPorts = createSyntheticPrivacyDataUsePorts({
        clock,
        // Dual zod brand across package boundaries — same pattern as privacy tests.
        ids: ids as never,
        expectedInventory,
        integrityVerifier: options.integrityVerifier,
        attributionVerifier: options.attributionVerifier,
      });
      if (injectedPolicies === undefined) {
        syntheticPorts.policies.seed(body.data.policy);
      }
      if (injectedPurposes === undefined) {
        syntheticPorts.purposes.seed(body.data.purpose);
      }
      if (processors === undefined) {
        syntheticPorts.processors.seed(body.data.processor);
      }
      if (
        body.data.evidence !== null &&
        injectedEvidence === undefined &&
        syntheticPorts.evidence instanceof
          SyntheticPrivacyAuthorizationEvidenceLedger
      ) {
        syntheticPorts.evidence.seedEvidence(body.data.evidence);
      }

      // Admit request-local digests into the default synthetic sealer when
      // PG/injected repositories skip seed hooks. Injected verifiers are left
      // untouched so tests can force invalid/unavailable results.
      if (
        options.integrityVerifier === undefined &&
        syntheticPorts.integrityVerifier instanceof
          SyntheticPrivacyIntegrityVerifier
      ) {
        syntheticPorts.integrityVerifier.sealPolicy(body.data.policy);
        if (body.data.evidence !== null) {
          syntheticPorts.integrityVerifier.sealEvidence(body.data.evidence);
        }
      }

      if (
        options.attributionVerifier === undefined &&
        syntheticPorts.attributionVerifier instanceof
          SyntheticPrivacyAttributionVerifier
      ) {
        syntheticPorts.attributionVerifier.sealPolicyAttribution(
          body.data.policy.versionId,
          {
            actorPrincipalDigest: body.data.actor.principalReferenceDigest,
            synthetic: body.data.actor.synthetic,
          },
        );
        if (body.data.evidence !== null) {
          syntheticPorts.attributionVerifier.sealEvidenceAttribution(
            body.data.evidence.evidenceId,
            {
              actorPrincipalDigest: body.data.actor.principalReferenceDigest,
              subjectScopeId: body.data.subjectScopeId,
              synthetic: body.data.actor.synthetic,
            },
          );
        }
      }

      const ports = {
        ...syntheticPorts,
        audit: injectedAudit ?? syntheticPorts.audit,
        evidence: injectedEvidence ?? syntheticPorts.evidence,
        policies: injectedPolicies ?? syntheticPorts.policies,
        purposes: injectedPurposes ?? syntheticPorts.purposes,
        processors: processors ?? syntheticPorts.processors,
        expectedInventory:
          expectedInventory ?? syntheticPorts.expectedInventory,
        integrityVerifier: syntheticPorts.integrityVerifier,
        attributionVerifier: syntheticPorts.attributionVerifier,
        processorResolver:
          options.processorResolver ?? syntheticPorts.processorResolver,
      };

      const result = await evaluateDataUse(ports, {
        actor: body.data.actor,
        purposeVersionId: body.data.purpose.purposeVersionId,
        policyVersionId: body.data.policy.versionId,
        operationKind: body.data.operationKind,
        engineeringCategoryId: body.data.engineeringCategoryId,
        processorId: body.data.processor.processorId,
        processorCapability: body.data.processorCapability,
        evidenceId: body.data.evidence?.evidenceId ?? null,
        subjectScopeId: body.data.subjectScopeId,
        productionMode: body.data.productionMode,
      });

      const response = privacySyntheticDataUseEvaluateResponseSchema.parse({
        status: result.status,
        decision: result.decision,
      });

      if (result.status === 'audit_unavailable') {
        return reply.code(503).send(response);
      }

      return response;
    },
  );

  app.post(
    '/v1/privacy/synthetic/subject-request-transition',
    async (request, reply) => {
      const body =
        privacySyntheticSubjectRequestTransitionRequestSchema.safeParse(
          request.body,
        );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const incoming = body.data.request;
      const transitionAt = clock.nowUtcMs();
      const existing = await subjectRequests.get(incoming.requestId);
      if (existing === null) {
        if (incoming.state !== 'received') {
          return privacySyntheticSubjectRequestTransitionResponseSchema.parse({
            status: 'invalid',
            reason: 'illegal_transition',
          });
        }

        const putResult = await subjectRequests.createReceived(
          incoming,
          transitionAt,
        );
        if (putResult === 'invalid_initial_state') {
          return privacySyntheticSubjectRequestTransitionResponseSchema.parse({
            status: 'invalid',
            reason: 'illegal_transition',
          });
        }
        if (putResult === 'conflict') {
          // Concurrent seed: only continue when the winner shares identity.
          const raced = await subjectRequests.get(incoming.requestId);
          if (
            raced === null ||
            !privacySubjectRequestIdentityEquals(raced, incoming)
          ) {
            return privacySyntheticSubjectRequestTransitionResponseSchema.parse(
              {
                status: 'conflict',
              },
            );
          }
        }
      } else if (!privacySubjectRequestIdentityEquals(existing, incoming)) {
        // Same requestId must never bind a different subject/policy/type.
        return privacySyntheticSubjectRequestTransitionResponseSchema.parse({
          status: 'conflict',
        });
      }

      const result = await subjectRequests.applyTransition({
        requestId: incoming.requestId,
        next: body.data.next,
        updatedAt: transitionAt,
        transitionId: body.data.transitionId,
        operationId: body.data.operationId,
        correlationId: body.data.correlationId,
        reasonCode: body.data.reasonCode,
        verification: body.data.verification,
        productionMode: body.data.productionMode,
      });

      if (result.status === 'invalid') {
        return privacySyntheticSubjectRequestTransitionResponseSchema.parse({
          status: 'invalid',
          reason: result.reason,
        });
      }

      if (result.status === 'conflict') {
        return privacySyntheticSubjectRequestTransitionResponseSchema.parse({
          status: 'conflict',
        });
      }

      if (result.status === 'already_terminal') {
        return privacySyntheticSubjectRequestTransitionResponseSchema.parse({
          status: 'already_terminal',
          request: result.request,
        });
      }

      return privacySyntheticSubjectRequestTransitionResponseSchema.parse({
        status: 'advanced',
        request: result.request,
        transition: result.transition,
      });
    },
  );

  app.post('/v1/privacy/synthetic/withdrawal-plan', async (request, reply) => {
    const body = privacySyntheticWithdrawalPlanRequestSchema.safeParse(
      request.body,
    );

    if (!body.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    // When a disposable evidence ledger is injected, persist via appendWithdrawal
    // (ledger owns authoritative existing state). Without inject, keep the pure
    // planWithdrawal seam used by in-memory tests.
    if (injectedEvidence !== undefined) {
      const candidate = {
        withdrawalId: body.data.withdrawalId,
        evidenceId: body.data.evidenceId,
        state: 'withdrawn' as const,
        withdrawnAt: clock.nowUtcMs(),
        operationId: body.data.operationId,
        processingOutcome: 'accepted' as const,
      };

      const status = await injectedEvidence.appendWithdrawal(candidate);

      if (status === 'conflict') {
        return privacySyntheticWithdrawalPlanResponseSchema.parse({
          status: 'conflict',
        });
      }

      const stored = await injectedEvidence.getAuthoritativeWithdrawal(
        body.data.evidenceId,
      );

      if (stored === null) {
        return privacySyntheticWithdrawalPlanResponseSchema.parse({
          status: 'conflict',
        });
      }

      return privacySyntheticWithdrawalPlanResponseSchema.parse({
        status,
        withdrawal:
          status === 'idempotent_replay'
            ? { ...stored, processingOutcome: 'idempotent_replay' }
            : stored,
      });
    }

    const result = planWithdrawal({
      existing: body.data.existing,
      withdrawalId: body.data.withdrawalId,
      evidenceId: body.data.evidenceId,
      operationId: body.data.operationId,
      withdrawnAt: clock.nowUtcMs(),
    });

    if (result.status === 'conflict') {
      return privacySyntheticWithdrawalPlanResponseSchema.parse({
        status: 'conflict',
      });
    }

    return privacySyntheticWithdrawalPlanResponseSchema.parse({
      status: result.status,
      withdrawal: result.withdrawal,
    });
  });

  app.post(
    '/v1/privacy/synthetic/retention-preview',
    async (request, reply) => {
      const body = privacySyntheticRetentionPreviewRequestSchema.safeParse(
        request.body,
      );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const { retentionRuleSelection, ...previewInput } = body.data;

      const result =
        retentionRuleSelection === undefined
          ? planRetentionPreview(previewInput)
          : await planRetentionPreviewWithRetentionRule({
              ...previewInput,
              retentionRules,
              engineeringCategoryId:
                retentionRuleSelection.engineeringCategoryId,
              purposeVersionId: retentionRuleSelection.purposeVersionId,
              ruleVersionId: retentionRuleSelection.ruleVersionId,
            });

      if (result.status === 'invalid') {
        return privacySyntheticRetentionPreviewResponseSchema.parse({
          status: 'invalid',
          reason: result.reason,
        });
      }

      if (retentionPreviews !== undefined) {
        // Idempotent write-through: replanning the identical input yields the
        // identical selectionDigest, so a 'conflict' here is an expected
        // no-op, not an error to surface to the caller. The persisted record
        // keeps the frozen `privacyRetentionPreviewRecordSchema` shape as-is;
        // a rule-aware plan's `retentionRuleDigest`/`retentionRuleVersionId`
        // stay response-only until that record contract is separately
        // extended.
        const preview = result.preview;
        await retentionPreviews.put({
          policyVersionId: preview.policyVersionId,
          inventoryVersionDigest: preview.inventoryVersionDigest,
          processorDescriptorDigests: preview.processorDescriptorDigests,
          watermark: preview.watermark,
          selectionDigest: preview.selectionDigest,
          approvedExceptionIds: preview.approvedExceptionIds,
          synthetic: preview.synthetic,
          status: 'planned',
          createdAt: clock.nowUtcMs(),
          executedAt: null,
        });
      }

      return privacySyntheticRetentionPreviewResponseSchema.parse({
        status: 'planned',
        preview: result.preview,
      });
    },
  );

  app.post(
    '/v1/privacy/synthetic/retention-execution-authorize',
    async (request, reply) => {
      const body =
        privacySyntheticRetentionExecutionAuthorizeRequestSchema.safeParse(
          request.body,
        );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      if (body.data.productionMode) {
        return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse({
          reason: 'production_path',
          status: 'hard_disabled',
        });
      }

      if (retentionPreviews === undefined) {
        return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse({
          reason: 'preview_mismatch',
          status: 'hard_disabled',
        });
      }

      const executionInputDigest = digestRetentionExecutionInput({
        previewTtlMs: body.data.previewTtlMs,
        requestedSelectionDigest: body.data.requestedSelectionDigest,
      });

      let preview: PrivacyRetentionPreviewRecord | null;
      try {
        preview = await retentionPreviews.getBySelectionDigest(
          body.data.requestedSelectionDigest,
        );
      } catch {
        return sendError(
          request,
          reply,
          503,
          'SERVICE_UNAVAILABLE',
          'Retention authorization evidence unavailable',
        );
      }

      if (preview?.status === 'executed') {
        try {
          const replay = await retentionPreviews.markExecuted({
            executedAt: preview.executedAt ?? preview.createdAt,
            inputDigest: executionInputDigest,
            operationId: body.data.operationId,
            selectionDigest: body.data.requestedSelectionDigest,
          });

          if (replay === 'not_found') {
            return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse(
              {
                reason: 'preview_mismatch',
                status: 'hard_disabled',
              },
            );
          }

          return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse(
            { status: replay },
          );
        } catch {
          return sendError(
            request,
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'Retention execution transition unavailable',
          );
        }
      }

      let result: ReturnType<typeof resolveRetentionExecutionAuthorization>;
      let nowUtcMs: string;
      try {
        const currentInventoryVersionDigest =
          expectedInventory === undefined
            ? ''
            : (await expectedInventory.getInventory()).inventoryVersionDigest;
        const currentProcessorDescriptorDigests =
          processors === undefined
            ? []
            : (await processors.listDescriptors()).map(
                (descriptor) => descriptor.descriptorDigest,
              );
        nowUtcMs = clock.nowUtcMs();

        result = resolveRetentionExecutionAuthorization({
          authoritySynthetic: true,
          currentInventoryVersionDigest,
          currentProcessorDescriptorDigests,
          nowUtcMs,
          policySynthetic: true,
          preview,
          previewTtlMs: body.data.previewTtlMs,
          productionMode: false,
          requestedSelectionDigest: body.data.requestedSelectionDigest,
        });
      } catch {
        return sendError(
          request,
          reply,
          503,
          'SERVICE_UNAVAILABLE',
          'Retention authorization evidence unavailable',
        );
      }

      if (result.status === 'hard_disabled') {
        return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse({
          status: 'hard_disabled',
          reason: result.reason,
        });
      }

      let transition:
        'executed' | 'idempotent_replay' | 'conflict' | 'not_found';
      try {
        transition = await retentionPreviews.markExecuted({
          executedAt: nowUtcMs,
          inputDigest: executionInputDigest,
          operationId: body.data.operationId,
          selectionDigest: body.data.requestedSelectionDigest,
        });
      } catch {
        return sendError(
          request,
          reply,
          503,
          'SERVICE_UNAVAILABLE',
          'Retention execution transition unavailable',
        );
      }

      if (transition === 'not_found') {
        return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse({
          reason: 'preview_mismatch',
          status: 'hard_disabled',
        });
      }

      return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse({
        status: transition,
      });
    },
  );

  app.post('/v1/privacy/synthetic/processor-plan', async (request, reply) => {
    const body = privacySyntheticProcessorPlanRequestSchema.safeParse(
      request.body,
    );

    if (!body.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    const result = buildRequestProcessorPlan(body.data);

    if (result.status === 'empty_inventory') {
      return privacySyntheticProcessorPlanResponseSchema.parse({
        status: 'empty_inventory',
      });
    }

    if (result.status === 'incomplete') {
      return privacySyntheticProcessorPlanResponseSchema.parse({
        status: 'incomplete',
        undeclaredProcessorIds: result.undeclaredProcessorIds,
      });
    }

    return privacySyntheticProcessorPlanResponseSchema.parse({
      status: 'planned',
      steps: result.steps,
      excluded: result.excluded,
    });
  });

  app.post(
    '/v1/privacy/synthetic/processor-step-record',
    async (request, reply) => {
      const body = privacySyntheticProcessorStepRecordRequestSchema.safeParse(
        request.body,
      );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const result = await recordProcessorStepAndAdvanceRequest({
        requests: subjectRequests,
        steps: processorSteps,
        step: body.data.step,
        expected: body.data.expected,
        updatedAt: clock.nowUtcMs(),
        transitionId: body.data.transitionId,
        operationId: body.data.operationId,
        correlationId: body.data.correlationId,
        productionMode: body.data.productionMode,
      });

      if (result.status === 'invalid_transition') {
        return privacySyntheticProcessorStepRecordResponseSchema.parse({
          status: 'invalid_transition',
          reason: result.reason,
        });
      }

      if (
        result.status === 'transition_conflict' ||
        result.status === 'request_not_found'
      ) {
        return privacySyntheticProcessorStepRecordResponseSchema.parse({
          status: result.status,
        });
      }

      if (result.status === 'advanced') {
        return privacySyntheticProcessorStepRecordResponseSchema.parse({
          status: 'advanced',
          completion: result.completion,
          request: result.request,
          transition: result.transition,
        });
      }

      return privacySyntheticProcessorStepRecordResponseSchema.parse({
        status: result.status,
        completion: result.completion,
        request: result.request,
      });
    },
  );

  app.post(
    '/v1/privacy/synthetic/governance-lifecycle-record',
    async (request, reply) => {
      const body =
        privacySyntheticGovernanceLifecycleRecordRequestSchema.safeParse(
          request.body,
        );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      let verification;
      try {
        verification = await governanceLifecycleVerifier.verify(body.data);
      } catch {
        return sendError(
          request,
          reply,
          503,
          'SERVICE_UNAVAILABLE',
          'Lifecycle binding verification unavailable',
        );
      }

      if (verification.status === 'unavailable') {
        return sendError(
          request,
          reply,
          503,
          'SERVICE_UNAVAILABLE',
          'Lifecycle binding verification unavailable',
        );
      }

      if (
        verification.status === 'invalid' ||
        !sameGovernanceLifecycleBinding(body.data, verification.binding)
      ) {
        return sendError(
          request,
          reply,
          400,
          'BAD_REQUEST',
          'Lifecycle binding invalid',
        );
      }

      const record = {
        ...verification.binding,
        recordedAt: clock.nowUtcMs(),
        synthetic: true,
      };

      let status;
      try {
        status = await governanceLifecycle.append(record);
      } catch {
        return sendError(
          request,
          reply,
          503,
          'SERVICE_UNAVAILABLE',
          'Lifecycle proof ledger unavailable',
        );
      }

      if (status === 'conflict') {
        let existing;
        try {
          existing = await governanceLifecycle.getByOperationId(
            verification.binding.operationId,
          );
        } catch {
          return sendError(
            request,
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'Lifecycle proof ledger unavailable',
          );
        }
        if (existing === null) {
          return sendError(
            request,
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'Lifecycle proof ledger inconsistent',
          );
        }

        const stored =
          privacyGovernanceLifecycleProofReferenceSchema.safeParse(existing);
        if (
          !stored.success ||
          stored.data.synthetic !== true ||
          !sameGovernanceLifecycleBinding(verification.binding, stored.data)
        ) {
          return sendError(
            request,
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'Lifecycle proof ledger inconsistent',
          );
        }

        return privacySyntheticGovernanceLifecycleRecordResponseSchema.parse({
          status: 'conflict',
          proof: stored.data,
        });
      }

      return privacySyntheticGovernanceLifecycleRecordResponseSchema.parse({
        status: 'recorded',
        proof: record,
      });
    },
  );

  app.post(
    '/v1/privacy/synthetic/processor-execute',
    async (request, reply) => {
      const body = privacySyntheticProcessorExecuteRequestSchema.safeParse(
        request.body,
      );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      // This seam is synthetic-only: productionMode always hard-denies here,
      // regardless of a client-supplied descriptor.synthetic flag.
      if (body.data.command.productionMode === true) {
        return privacySyntheticProcessorExecuteResponseSchema.parse({
          status: 'denied',
          reasonCode: 'synthetic_processor_in_production',
          capability: body.data.command.capability,
          families: [],
          accessLocatorDigest: null,
          exportManifestDigest: null,
          operationId: body.data.command.operationId,
          correlationId: body.data.command.correlationId,
        });
      }

      const processor = new SyntheticPrivacySubjectDataProcessor(
        { ...body.data.descriptor, synthetic: true },
        body.data.families,
      );
      const result = await processor.execute({
        ...body.data.command,
        productionMode: false,
      });
      return privacySyntheticProcessorExecuteResponseSchema.parse(result);
    },
  );

  app.post(
    '/v1/privacy/synthetic/inventory-coverage',
    async (request, reply) => {
      const body = privacySyntheticInventoryCoverageRequestSchema.safeParse(
        request.body,
      );

      if (!body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const expected =
        body.data.expected ??
        (expectedInventory !== undefined
          ? await expectedInventory.getInventory()
          : undefined);

      if (expected === undefined) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const runtime =
        body.data.runtime ??
        (processors !== undefined
          ? await processors.listDescriptors()
          : undefined);

      if (runtime === undefined) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const coverage = compareExpectedInventoryToRuntime({
        expected,
        runtime,
      });

      return privacySyntheticInventoryCoverageResponseSchema.parse({
        evaluatedAt: clock.nowUtcMs(),
        mismatches: coverage.status === 'mismatched' ? coverage.mismatches : [],
        status: coverage.status,
      });
    },
  );
}

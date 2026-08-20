import {
  authorizeRetentionExecution,
  createSyntheticPrivacyDataUsePorts,
  evaluateDataUse,
  planRetentionPreview,
  planWithdrawal,
  SyntheticPrivacyAuthorizationEvidenceLedger,
  SyntheticPrivacyIdFactory,
  SyntheticPrivacySubjectDataProcessor,
  SyntheticPrivacySubjectRequestRepository,
  SyntheticPrivacyTrustedClock,
  type PrivacyAuditSink,
  type PrivacyAuthorizationEvidenceLedger,
  type PrivacyIdFactory,
  type PrivacySubjectRequestRepository,
  type PrivacyTrustedClock,
} from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  privacyReadinessResultSchema,
  privacySyntheticDataUseEvaluateRequestSchema,
  privacySyntheticDataUseEvaluateResponseSchema,
  privacySyntheticProcessorExecuteRequestSchema,
  privacySyntheticProcessorExecuteResponseSchema,
  privacySyntheticRetentionExecutionAuthorizeRequestSchema,
  privacySyntheticRetentionExecutionAuthorizeResponseSchema,
  privacySyntheticRetentionPreviewRequestSchema,
  privacySyntheticRetentionPreviewResponseSchema,
  privacySyntheticSubjectRequestTransitionRequestSchema,
  privacySyntheticSubjectRequestTransitionResponseSchema,
  privacySyntheticWithdrawalPlanRequestSchema,
  privacySyntheticWithdrawalPlanResponseSchema,
  type ApiErrorCode,
  type PrivacyReadinessResult,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface PrivacySyntheticOptions {
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
   * Optional disposable evidence ledger (e.g. Postgres). When omitted, the
   * in-memory synthetic ledger is used and may be seeded from the request body.
   */
  evidence?: PrivacyAuthorizationEvidenceLedger;
  /**
   * Optional disposable audit sink. When omitted, the in-memory synthetic sink
   * is used.
   */
  audit?: PrivacyAuditSink;
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

function syntheticMechanismReadiness(
  evaluatedAt: string,
): PrivacyReadinessResult {
  // Mechanism may be healthy while production activation stays false under
  // LEGAL_PRIVACY_DECISION_REQUIRED.
  return privacyReadinessResultSchema.parse({
    mechanismReady: true,
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
        componentId: 'policy_package',
        state: 'ready',
        diagnosticCode: null,
      },
    ],
    diagnosticCodes: ['legal_privacy_decision_required'],
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
  const injectedEvidence = options.evidence;
  const injectedAudit = options.audit;

  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/v1/privacy/synthetic')) {
      reply.header('cache-control', 'no-store');
    }
    return payload;
  });

  app.get('/v1/privacy/synthetic/readiness', async () =>
    syntheticMechanismReadiness(clock.nowUtcMs()),
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
      });
      syntheticPorts.policies.seed(body.data.policy);
      syntheticPorts.purposes.seed(body.data.purpose);
      syntheticPorts.processors.seed(body.data.processor);
      if (
        body.data.evidence !== null &&
        injectedEvidence === undefined &&
        syntheticPorts.evidence instanceof
          SyntheticPrivacyAuthorizationEvidenceLedger
      ) {
        syntheticPorts.evidence.seedEvidence(body.data.evidence);
      }

      const ports = {
        ...syntheticPorts,
        audit: injectedAudit ?? syntheticPorts.audit,
        evidence: injectedEvidence ?? syntheticPorts.evidence,
      };

      const result = await evaluateDataUse(ports, {
        actor: body.data.actor,
        purposeVersionId: body.data.purpose.purposeVersionId,
        policyVersionId: body.data.policy.versionId,
        operationKind: body.data.operationKind,
        engineeringCategoryId: body.data.engineeringCategoryId,
        processorId: body.data.processor.processorId,
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

      const existing = await subjectRequests.get(body.data.request.requestId);
      if (existing === null) {
        // Concurrent seed may lose the race; proceed to applyTransition on the
        // winner rather than mapping "already exists" as a transition conflict.
        await subjectRequests.put(body.data.request);
      }

      const result = await subjectRequests.applyTransition({
        requestId: body.data.request.requestId,
        next: body.data.next,
        updatedAt: clock.nowUtcMs(),
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

      const result = planRetentionPreview(body.data);

      if (result.status === 'invalid') {
        return privacySyntheticRetentionPreviewResponseSchema.parse({
          status: 'invalid',
          reason: result.reason,
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

      const result = authorizeRetentionExecution(body.data);

      if (result.status === 'hard_disabled') {
        return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse({
          status: 'hard_disabled',
          reason: result.reason,
        });
      }

      return privacySyntheticRetentionExecutionAuthorizeResponseSchema.parse({
        status: 'allowed_synthetic_test',
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
}

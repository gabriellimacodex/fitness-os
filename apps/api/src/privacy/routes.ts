import {
  authorizeRetentionExecution,
  createSyntheticPrivacyDataUsePorts,
  evaluateDataUse,
  planRetentionPreview,
  planWithdrawal,
  SyntheticPrivacySubjectRequestRepository,
  type PrivacySubjectRequestRepository,
} from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  privacyReadinessResultSchema,
  privacySyntheticDataUseEvaluateRequestSchema,
  privacySyntheticDataUseEvaluateResponseSchema,
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
  /** Fixed clock for deterministic tests; defaults to domain synthetic clock. */
  fixedUtcMs?: string;
  /**
   * Optional subject-request repository. Defaults to an in-memory synthetic
   * repository shared for the lifetime of this route registration.
   */
  subjectRequests?: PrivacySubjectRequestRepository;
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
  const subjectRequests =
    options.subjectRequests ?? new SyntheticPrivacySubjectRequestRepository();

  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/v1/privacy/synthetic')) {
      reply.header('cache-control', 'no-store');
    }
    return payload;
  });

  app.get('/v1/privacy/synthetic/readiness', async () =>
    syntheticMechanismReadiness(fixedUtcMs),
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

      const ports = createSyntheticPrivacyDataUsePorts({ fixedUtcMs });
      ports.policies.seed(body.data.policy);
      ports.purposes.seed(body.data.purpose);
      ports.processors.seed(body.data.processor);
      if (body.data.evidence !== null) {
        ports.evidence.seedEvidence(body.data.evidence);
      }

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
        updatedAt: fixedUtcMs,
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
      withdrawnAt: fixedUtcMs,
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
}

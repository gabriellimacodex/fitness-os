import {
  createSyntheticPrivacyDataUsePorts,
  evaluateDataUse,
} from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  privacyReadinessResultSchema,
  privacySyntheticDataUseEvaluateRequestSchema,
  privacySyntheticDataUseEvaluateResponseSchema,
  type ApiErrorCode,
  type PrivacyReadinessResult,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface PrivacySyntheticOptions {
  /** Fixed clock for deterministic tests; defaults to domain synthetic clock. */
  fixedUtcMs?: string;
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
}

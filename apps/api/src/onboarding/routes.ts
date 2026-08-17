import { createHash, randomUUID } from 'node:crypto';

import {
  canAllocateAttempt,
  evaluateClaimEligibility,
  inspectInvitationState,
  isNonterminal,
} from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  attemptDetailSchema,
  attemptLocatorSchema,
  attemptSummarySchema,
  createAttemptRequestSchema,
  currentOnboardingResponseSchema,
  inspectInvitationRequestSchema,
  onboardingCurrentQuerySchema,
  onboardingOperationResponseSchema,
  type ApiErrorCode,
  type AttemptDetail,
  type ProposedRole,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  createOnboardingStore,
  createStoredAttempt,
  findInvitationBySecret,
  getAttemptForPrincipal,
  mappingIdFor,
  type OnboardingStore,
  type StoredAttempt,
} from './store.js';

export interface OnboardingContext {
  mappedRoles: readonly ProposedRole[];
  principalKey: string;
  synthetic: true;
}

export type ResolveOnboardingContext = (
  request: FastifyRequest,
) => OnboardingContext | null | Promise<OnboardingContext | null>;

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404,
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

function digestOperation(input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(input), 'utf8')
    .digest('hex');
}

function committedOperation(
  namespace: 'inspect_invitation' | 'create_attempt',
  input: unknown,
  result: unknown,
) {
  return onboardingOperationResponseSchema.parse({
    operation: {
      canonicalizationVersion: 'utf8-json-sha256.v1',
      digest: digestOperation({ input, namespace }),
      namespace,
      operationId: randomUUID(),
      state: 'operation_committed',
    },
    result,
  });
}

function summarizeAttempt(attempt: AttemptDetail) {
  return attemptSummarySchema.parse({
    attemptId: attempt.attemptId,
    lifecycle: attempt.lifecycle,
    ordinal: attempt.ordinal,
    proposedRole: attempt.proposedRole,
    purpose: attempt.purpose,
  });
}

function attemptsForPrincipalRole(
  store: OnboardingStore,
  principalKey: string,
  proposedRole: ProposedRole,
): StoredAttempt[] {
  return [...store.attempts.values()].filter(
    (record) =>
      record.principalKey === principalKey &&
      record.detail.proposedRole === proposedRole &&
      isNonterminal(record.detail.lifecycle),
  );
}

export function registerOnboardingRoutes(
  app: FastifyInstance,
  options: {
    resolveContext?: ResolveOnboardingContext;
    store?: OnboardingStore;
  } = {},
): void {
  const store = options.store ?? createOnboardingStore();
  const resolveContext = options.resolveContext ?? (() => null);

  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? '';

    if (path === '/v1/onboarding' || path.startsWith('/v1/onboarding/')) {
      reply.header('cache-control', 'no-store');
    }

    return payload;
  });

  const requireContext = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<OnboardingContext | null> => {
    const context = await resolveContext(request);

    if (context === null) {
      await sendError(
        request,
        reply,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
      return null;
    }

    return context;
  };

  app.get('/v1/onboarding/current', async (request, reply) => {
    const query = onboardingCurrentQuerySchema.safeParse(request.query);

    if (!query.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    const context = await requireContext(request, reply);
    if (context === null) {
      return;
    }

    const attempts = [...store.attempts.values()]
      .filter((record) => record.principalKey === context.principalKey)
      .map((record) => summarizeAttempt(record.detail))
      .slice(0, 4);

    return currentOnboardingResponseSchema.parse({
      attempts,
      mappings: context.mappedRoles.map((role) => ({
        mappingId: mappingIdFor(context.principalKey, role),
        role,
      })),
      nextCursor: null,
    });
  });

  app.post('/v1/onboarding/invitations/inspect', async (request, reply) => {
    const body = inspectInvitationRequestSchema.safeParse(request.body);

    if (!body.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    const context = await requireContext(request, reply);
    if (context === null) {
      return;
    }

    const invitation = findInvitationBySecret(store, body.data.claimSecret);
    const inspection = invitation
      ? inspectInvitationState(invitation.state)
      : 'invalid_or_unavailable';

    if (inspection !== 'issued' || invitation === undefined) {
      return committedOperation(
        'inspect_invitation',
        { claim: 'redacted' },
        {
          outcome: 'invalid_or_unavailable',
        },
      );
    }

    return committedOperation(
      'inspect_invitation',
      { claim: 'redacted' },
      {
        command: 'inspect_invitation',
        inspection: {
          proposedRole: invitation.proposedRole,
          purpose: invitation.purpose,
          state: 'issued',
        },
        outcome: 'command_succeeded',
      },
    );
  });

  app.post('/v1/onboarding/attempts', async (request, reply) => {
    const body = createAttemptRequestSchema.safeParse(request.body);

    if (!body.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    const context = await requireContext(request, reply);
    if (context === null) {
      return;
    }

    const invitation = findInvitationBySecret(store, body.data.claimSecret);

    if (
      invitation === undefined ||
      inspectInvitationState(invitation.state) !== 'issued'
    ) {
      return committedOperation(
        'create_attempt',
        { retry: body.data.retryToken },
        {
          outcome: 'invalid_or_unavailable',
        },
      );
    }

    const eligibility = evaluateClaimEligibility({
      alreadyMappedRoles: context.mappedRoles,
      invitationPurpose: invitation.purpose,
      proposedRole: invitation.proposedRole,
      targetCoachIsSelf: false,
    });

    if (eligibility.status === 'hard_disabled') {
      return sendError(request, reply, 403, 'FORBIDDEN', 'Request forbidden');
    }

    const activeForRole = attemptsForPrincipalRole(
      store,
      context.principalKey,
      invitation.proposedRole,
    );

    if (!canAllocateAttempt(activeForRole.length)) {
      return committedOperation(
        'create_attempt',
        { retry: body.data.retryToken },
        {
          attempts: activeForRole.map((record) =>
            summarizeAttempt(record.detail),
          ),
          outcome: 'active_attempt_limit_reached',
        },
      );
    }

    const existing = activeForRole.find(
      (record) => record.detail.invitationId === invitation.invitationId,
    );

    if (existing !== undefined) {
      return committedOperation(
        'create_attempt',
        { retry: body.data.retryToken },
        {
          attempt: existing.detail,
          command: 'attempt',
          outcome: 'command_succeeded',
        },
      );
    }

    const record = createStoredAttempt(
      invitation,
      activeForRole.length + 1,
      context.principalKey,
    );
    store.attempts.set(record.detail.attemptId, record);

    return committedOperation(
      'create_attempt',
      { retry: body.data.retryToken },
      {
        attempt: record.detail,
        command: 'attempt',
        outcome: 'command_succeeded',
      },
    );
  });

  app.get('/v1/onboarding/attempts/:attemptId', async (request, reply) => {
    const params = attemptLocatorSchema.safeParse(request.params);

    if (!params.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    const context = await requireContext(request, reply);
    if (context === null) {
      return;
    }

    const attempt = getAttemptForPrincipal(
      store,
      params.data.attemptId,
      context.principalKey,
    );

    if (attempt === undefined) {
      return sendError(request, reply, 404, 'NOT_FOUND', 'Resource not found');
    }

    return attemptDetailSchema.parse(attempt);
  });
}

import { createHash, randomUUID } from 'node:crypto';

import {
  canAllocateAttempt,
  evaluateClaimEligibility,
  inspectInvitationState,
  isNonterminal,
  transitionAttempt,
  type ProposedRole,
} from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  attemptDetailSchema,
  attemptLocatorSchema,
  attemptSummarySchema,
  abandonAttemptRequestSchema,
  claimAttemptRequestSchema,
  createAttemptRequestSchema,
  currentOnboardingResponseSchema,
  inspectInvitationRequestSchema,
  onboardingCompletionIdSchema,
  onboardingCurrentQuerySchema,
  onboardingOperationResponseSchema,
  onboardingPolicyInteractionIdSchema,
  onboardingPolicyPackageIdSchema,
  policyRefreshRequestSchema,
  resumeAttemptRequestSchema,
  type ApiErrorCode,
  type AttemptDetail,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { digestUtf8JsonSha256V1 } from './canonical.js';
import {
  compareAttemptOrder,
  createOnboardingStore,
  createStoredAttempt,
  decodeAttemptCursor,
  digestClaimSecret,
  digestRetryToken,
  encodeAttemptCursor,
  findInvitationBySecret,
  getAttemptForPrincipal,
  isAfterCursor,
  mappingIdFor,
  newOperationId,
  nextOrdinalForRole,
  mappedRolesFor,
  operationBindingKey,
  recordRoleMapping,
  type OnboardingMutationNamespace,
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

const CURRENT_PAGE_SIZE = 4;

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

function summarizeAttempt(attempt: AttemptDetail) {
  return attemptSummarySchema.parse({
    attemptId: attempt.attemptId,
    lifecycle: attempt.lifecycle,
    ordinal: attempt.ordinal,
    proposedRole: attempt.proposedRole,
    purpose: attempt.purpose,
  });
}

function invitationReference(store: OnboardingStore, secret: string): string {
  const invitation = findInvitationBySecret(store, secret);
  return invitation?.invitationId ?? digestClaimSecret(secret, store.pepper);
}

function syntheticPolicyHandoff() {
  const packageId = onboardingPolicyPackageIdSchema.parse(randomUUID());
  const interactionId = onboardingPolicyInteractionIdSchema.parse(randomUUID());
  return {
    evidenceId: null,
    integrityDigest: createHash('sha256')
      .update(`synthetic-policy:${packageId}:${interactionId}`, 'utf8')
      .digest('hex'),
    interactionId,
    packageId,
    packageVersion: 1,
    status: 'ready' as const,
  };
}

function semanticDigest(input: Record<string, string>): string {
  return digestUtf8JsonSha256V1(input);
}

function operationEnvelope(input: {
  digest: string;
  namespace: 'inspect_invitation' | OnboardingMutationNamespace;
  operationId: string;
  result: unknown;
  state:
    'operation_committed' | 'operation_replayed' | 'operation_input_mismatch';
}) {
  return onboardingOperationResponseSchema.parse({
    operation: {
      canonicalizationVersion: 'utf8-json-sha256.v1',
      digest: input.digest,
      namespace: input.namespace,
      operationId: input.operationId,
      state: input.state,
    },
    result: input.result,
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

    let cursor:
      | {
          attemptId: string;
          createdAt: string;
        }
      | undefined;

    if (query.data.cursor !== undefined) {
      const decoded = decodeAttemptCursor(store, query.data.cursor);

      if (decoded === null) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      cursor = decoded;
    }

    const ordered = [...store.attempts.values()]
      .filter(
        (record) =>
          record.principalKey === context.principalKey &&
          isNonterminal(record.detail.lifecycle),
      )
      .sort(compareAttemptOrder)
      .filter(
        (record) => cursor === undefined || isAfterCursor(record, cursor),
      );

    const page = ordered.slice(0, CURRENT_PAGE_SIZE);
    const last = page.at(-1);
    const nextCursor =
      ordered.length > CURRENT_PAGE_SIZE && last !== undefined
        ? encodeAttemptCursor(store, last.createdAt, last.detail.attemptId)
        : null;

    return currentOnboardingResponseSchema.parse({
      attempts: page.map((record) => summarizeAttempt(record.detail)),
      mappings: [
        ...new Set([
          ...context.mappedRoles,
          ...mappedRolesFor(store, context.principalKey),
        ]),
      ].map((role) => ({
        mappingId: mappingIdFor(context.principalKey, role),
        role,
      })),
      nextCursor,
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
    const digest = semanticDigest({
      authority: context.principalKey,
      invitationRef: invitationReference(store, body.data.claimSecret),
      namespace: 'inspect_invitation',
    });
    const inspection = invitation
      ? inspectInvitationState(invitation.state)
      : 'invalid_or_unavailable';

    if (inspection !== 'issued' || invitation === undefined) {
      return operationEnvelope({
        digest,
        namespace: 'inspect_invitation',
        operationId: newOperationId(),
        result: { outcome: 'invalid_or_unavailable' },
        state: 'operation_committed',
      });
    }

    return operationEnvelope({
      digest,
      namespace: 'inspect_invitation',
      operationId: newOperationId(),
      result: {
        command: 'inspect_invitation',
        inspection: {
          proposedRole: invitation.proposedRole,
          purpose: invitation.purpose,
          state: 'issued',
        },
        outcome: 'command_succeeded',
      },
      state: 'operation_committed',
    });
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

    const digest = semanticDigest({
      authority: context.principalKey,
      invitationRef: invitationReference(store, body.data.claimSecret),
      namespace: 'create_attempt',
    });
    const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
    const bindingKey = operationBindingKey(
      context.principalKey,
      'create_attempt',
      retryDigest,
    );
    const existingOperation = store.operations.get(bindingKey);

    if (existingOperation !== undefined) {
      if (existingOperation.digest !== digest) {
        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'create_attempt',
          operationId: existingOperation.operationId,
          result: null,
          state: 'operation_input_mismatch',
        });
      }

      return operationEnvelope({
        digest: existingOperation.digest,
        namespace: 'create_attempt',
        operationId: existingOperation.operationId,
        result: existingOperation.result,
        state: 'operation_replayed',
      });
    }

    const invitation = findInvitationBySecret(store, body.data.claimSecret);

    const commit = (result: unknown) => {
      const operationId = newOperationId();
      store.operations.set(bindingKey, {
        digest,
        namespace: 'create_attempt',
        operationId,
        result,
        retryDigest,
      });

      return operationEnvelope({
        digest,
        namespace: 'create_attempt',
        operationId,
        result,
        state: 'operation_committed',
      });
    };

    if (
      invitation === undefined ||
      inspectInvitationState(invitation.state) !== 'issued'
    ) {
      return commit({ outcome: 'invalid_or_unavailable' });
    }

    const alreadyMappedRoles = [
      ...new Set([
        ...context.mappedRoles,
        ...mappedRolesFor(store, context.principalKey),
      ]),
    ];

    if (alreadyMappedRoles.includes(invitation.proposedRole)) {
      return commit({ outcome: 'mapping_conflict' });
    }

    const eligibility = evaluateClaimEligibility({
      alreadyMappedRoles,
      invitationPurpose: invitation.purpose,
      proposedRole: invitation.proposedRole,
      targetCoachIsSelf:
        invitation.targetCoachPrincipalKey !== null &&
        invitation.targetCoachPrincipalKey === context.principalKey,
    });

    if (eligibility.status === 'hard_disabled') {
      return commit({ outcome: 'invalid_or_unavailable' });
    }

    const activeForRole = attemptsForPrincipalRole(
      store,
      context.principalKey,
      invitation.proposedRole,
    );

    if (!canAllocateAttempt(activeForRole.length)) {
      return commit({
        attempts: activeForRole.map((record) =>
          summarizeAttempt(record.detail),
        ),
        outcome: 'active_attempt_limit_reached',
      });
    }

    const existing = activeForRole.find(
      (record) => record.detail.invitationId === invitation.invitationId,
    );

    if (existing !== undefined) {
      return commit({
        attempt: existing.detail,
        command: 'attempt',
        outcome: 'command_succeeded',
      });
    }

    const record = createStoredAttempt(
      invitation,
      nextOrdinalForRole(store, context.principalKey, invitation.proposedRole),
      context.principalKey,
    );
    store.attempts.set(record.detail.attemptId, record);

    return commit({
      attempt: record.detail,
      command: 'attempt',
      outcome: 'command_succeeded',
    });
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

  app.post(
    '/v1/onboarding/attempts/:attemptId/resume',
    async (request, reply) => {
      const params = attemptLocatorSchema.safeParse(request.params);
      const body = resumeAttemptRequestSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const context = await requireContext(request, reply);
      if (context === null) {
        return;
      }

      const digest = semanticDigest({
        attemptId: params.data.attemptId,
        authority: context.principalKey,
        namespace: 'resume_attempt',
      });
      const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
      const bindingKey = operationBindingKey(
        context.principalKey,
        'resume_attempt',
        retryDigest,
      );
      const existingOperation = store.operations.get(bindingKey);

      if (existingOperation !== undefined) {
        if (existingOperation.digest !== digest) {
          return operationEnvelope({
            digest: existingOperation.digest,
            namespace: 'resume_attempt',
            operationId: existingOperation.operationId,
            result: null,
            state: 'operation_input_mismatch',
          });
        }

        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'resume_attempt',
          operationId: existingOperation.operationId,
          result: existingOperation.result,
          state: 'operation_replayed',
        });
      }

      const commit = (result: unknown) => {
        const operationId = newOperationId();
        store.operations.set(bindingKey, {
          digest,
          namespace: 'resume_attempt',
          operationId,
          result,
          retryDigest,
        });
        return operationEnvelope({
          digest,
          namespace: 'resume_attempt',
          operationId,
          result,
          state: 'operation_committed',
        });
      };

      const record = store.attempts.get(params.data.attemptId);
      if (
        record === undefined ||
        record.principalKey !== context.principalKey
      ) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }

      if (!isNonterminal(record.detail.lifecycle)) {
        return commit({
          attempt: record.detail,
          outcome: 'already_terminal',
        });
      }

      return commit({
        attempt: record.detail,
        outcome: 'current_state',
      });
    },
  );

  app.post(
    '/v1/onboarding/attempts/:attemptId/abandon',
    async (request, reply) => {
      const params = attemptLocatorSchema.safeParse(request.params);
      const body = abandonAttemptRequestSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const context = await requireContext(request, reply);
      if (context === null) {
        return;
      }

      const digest = semanticDigest({
        attemptId: params.data.attemptId,
        authority: context.principalKey,
        namespace: 'abandon_attempt',
      });
      const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
      const bindingKey = operationBindingKey(
        context.principalKey,
        'abandon_attempt',
        retryDigest,
      );
      const existingOperation = store.operations.get(bindingKey);

      if (existingOperation !== undefined) {
        if (existingOperation.digest !== digest) {
          return operationEnvelope({
            digest: existingOperation.digest,
            namespace: 'abandon_attempt',
            operationId: existingOperation.operationId,
            result: null,
            state: 'operation_input_mismatch',
          });
        }

        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'abandon_attempt',
          operationId: existingOperation.operationId,
          result: existingOperation.result,
          state: 'operation_replayed',
        });
      }

      const commit = (result: unknown) => {
        const operationId = newOperationId();
        store.operations.set(bindingKey, {
          digest,
          namespace: 'abandon_attempt',
          operationId,
          result,
          retryDigest,
        });
        return operationEnvelope({
          digest,
          namespace: 'abandon_attempt',
          operationId,
          result,
          state: 'operation_committed',
        });
      };

      const record = store.attempts.get(params.data.attemptId);
      if (
        record === undefined ||
        record.principalKey !== context.principalKey
      ) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }

      if (!isNonterminal(record.detail.lifecycle)) {
        return commit({
          attempt: record.detail,
          outcome: 'already_terminal',
        });
      }

      const abandoned = transitionAttempt(
        record.detail,
        'terminal',
        'abandoned',
      );
      if (abandoned.status !== 'advanced') {
        return commit({ outcome: 'invalid_or_unavailable' });
      }

      store.attempts.set(record.detail.attemptId, {
        ...record,
        detail: abandoned.attempt,
      });

      return commit({
        attempt: abandoned.attempt,
        command: 'attempt',
        outcome: 'command_succeeded',
      });
    },
  );

  app.post(
    '/v1/onboarding/attempts/:attemptId/policy-refresh',
    async (request, reply) => {
      const params = attemptLocatorSchema.safeParse(request.params);
      const body = policyRefreshRequestSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const context = await requireContext(request, reply);
      if (context === null) {
        return;
      }

      const digest = semanticDigest({
        attemptId: params.data.attemptId,
        authority: context.principalKey,
        namespace: 'refresh_policy',
      });
      const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
      const bindingKey = operationBindingKey(
        context.principalKey,
        'refresh_policy',
        retryDigest,
      );
      const existingOperation = store.operations.get(bindingKey);

      if (existingOperation !== undefined) {
        if (existingOperation.digest !== digest) {
          return operationEnvelope({
            digest: existingOperation.digest,
            namespace: 'refresh_policy',
            operationId: existingOperation.operationId,
            result: null,
            state: 'operation_input_mismatch',
          });
        }

        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'refresh_policy',
          operationId: existingOperation.operationId,
          result: existingOperation.result,
          state: 'operation_replayed',
        });
      }

      const record = store.attempts.get(params.data.attemptId);
      if (
        record === undefined ||
        record.principalKey !== context.principalKey
      ) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }

      const commit = (result: unknown) => {
        const operationId = newOperationId();
        store.operations.set(bindingKey, {
          digest,
          namespace: 'refresh_policy',
          operationId,
          result,
          retryDigest,
        });
        return operationEnvelope({
          digest,
          namespace: 'refresh_policy',
          operationId,
          result,
          state: 'operation_committed',
        });
      };

      if (record.detail.lifecycle === 'ready_to_claim') {
        return commit({
          attempt: record.detail,
          command: 'attempt',
          outcome: 'command_succeeded',
        });
      }

      const advanced = transitionAttempt(record.detail, 'ready_to_claim');
      if (advanced.status !== 'advanced') {
        return commit({ outcome: 'invalid_or_unavailable' });
      }

      const updated = attemptDetailSchema.parse({
        ...advanced.attempt,
        policy: syntheticPolicyHandoff(),
      });
      store.attempts.set(record.detail.attemptId, {
        ...record,
        detail: updated,
      });

      return commit({
        attempt: updated,
        command: 'attempt',
        outcome: 'command_succeeded',
      });
    },
  );

  app.post(
    '/v1/onboarding/attempts/:attemptId/claim',
    async (request, reply) => {
      const params = attemptLocatorSchema.safeParse(request.params);
      const body = claimAttemptRequestSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const context = await requireContext(request, reply);
      if (context === null) {
        return;
      }

      const digest = semanticDigest({
        attemptId: params.data.attemptId,
        authority: context.principalKey,
        invitationRef: invitationReference(store, body.data.claimSecret),
        namespace: 'claim_attempt',
      });
      const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
      const bindingKey = operationBindingKey(
        context.principalKey,
        'claim_attempt',
        retryDigest,
      );
      const existingOperation = store.operations.get(bindingKey);

      if (existingOperation !== undefined) {
        if (existingOperation.digest !== digest) {
          return operationEnvelope({
            digest: existingOperation.digest,
            namespace: 'claim_attempt',
            operationId: existingOperation.operationId,
            result: null,
            state: 'operation_input_mismatch',
          });
        }

        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'claim_attempt',
          operationId: existingOperation.operationId,
          result: existingOperation.result,
          state: 'operation_replayed',
        });
      }

      const commit = (result: unknown) => {
        const operationId = newOperationId();
        store.operations.set(bindingKey, {
          digest,
          namespace: 'claim_attempt',
          operationId,
          result,
          retryDigest,
        });
        return operationEnvelope({
          digest,
          namespace: 'claim_attempt',
          operationId,
          result,
          state: 'operation_committed',
        });
      };

      const record = store.attempts.get(params.data.attemptId);
      if (
        record === undefined ||
        record.principalKey !== context.principalKey
      ) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }

      if (record.detail.lifecycle !== 'ready_to_claim') {
        return commit({ outcome: 'invalid_or_unavailable' });
      }

      const invitation = findInvitationBySecret(store, body.data.claimSecret);
      if (
        invitation === undefined ||
        invitation.invitationId !== record.detail.invitationId ||
        inspectInvitationState(invitation.state) !== 'issued'
      ) {
        return commit({ outcome: 'invalid_or_unavailable' });
      }

      const completed = transitionAttempt(record.detail, 'completed');
      if (completed.status !== 'advanced') {
        return commit({ outcome: 'invalid_or_unavailable' });
      }

      invitation.state = 'claimed';
      store.invitations.set(invitation.invitationId, invitation);
      store.attempts.set(record.detail.attemptId, {
        ...record,
        detail: completed.attempt,
      });
      recordRoleMapping(
        store,
        context.principalKey,
        record.detail.proposedRole,
      );

      return commit({
        completionId: onboardingCompletionIdSchema.parse(randomUUID()),
        mappingId: mappingIdFor(
          context.principalKey,
          record.detail.proposedRole,
        ),
        outcome: 'completed',
        role: record.detail.proposedRole,
      });
    },
  );
}

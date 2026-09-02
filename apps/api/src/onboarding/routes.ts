import { randomUUID } from 'node:crypto';

import {
  canAllocateAttempt,
  checkClaimThrottle,
  CryptoOnboardingIdFactory,
  CryptoOnboardingSecretFactory,
  DEFAULT_CLAIM_THROTTLE_WINDOW,
  evaluateClaimEligibility,
  HmacInvitationSecretVerifier,
  inspectInvitationState,
  isNonterminal,
  revokeInvitation,
  SyntheticClaimFailureTracker,
  SyntheticIdentitySessionPort,
  SyntheticIdentitySessionStore,
  SyntheticOnboardingClaimRepository,
  SyntheticOnboardingPolicyGateway,
  SyntheticOnboardingReadinessProbe,
  SyntheticOnboardingTransitionSink,
  SyntheticPrincipalBindingRepository,
  SyntheticPrincipalReferenceDeriver,
  SystemTrustedClock,
  transitionAttempt,
  type ClaimFailureTracker,
  type ClaimThrottleWindow,
  type IdentitySessionPort,
  type IdentitySessionStore,
  type InvitationSecretVerifier,
  type OnboardingClaimRepository,
  type OnboardingIdFactory,
  type OnboardingPolicyGateway,
  type OnboardingReadinessProbe,
  type OnboardingSecretFactory,
  type OnboardingTransitionSink,
  type PrincipalBindingRepository,
  type PrincipalReferenceDeriver,
  type ProposedRole,
  type TrustedClock,
} from '@fitness-os/domain';
import {
  abandonAttemptRequestSchema,
  apiErrorResponseSchema,
  attemptDetailSchema,
  attemptLocatorSchema,
  attemptSummarySchema,
  claimAttemptRequestSchema,
  createAttemptRequestSchema,
  currentOnboardingResponseSchema,
  emptyOnboardingQuerySchema,
  inspectInvitationRequestSchema,
  invitationClaimSecretSchema,
  invitationLocatorSchema,
  issueStudentInvitationRequestSchema,
  onboardingCompletionIdSchema,
  onboardingCurrentQuerySchema,
  onboardingOperationResponseSchema,
  policyRefreshRequestSchema,
  resumeAttemptRequestSchema,
  revokeStudentInvitationRequestSchema,
  studentInvitationListResponseSchema,
  type ApiErrorCode,
  type AttemptDetail,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { digestUtf8JsonSha256V1 } from './canonical.js';
import {
  hydrateCoachInvitations,
  hydratePrincipalAttempts,
  hydratePrincipalMappings,
  loadAttempt,
  loadInvitation,
  loadInvitationByClaimDigest,
  loadOperation,
  persistAttempt,
  persistInvitation,
  persistOperation,
  persistRoleMapping,
  type OnboardingPgPersistence,
} from './pg-persistence.js';
import {
  compareAttemptOrder,
  createOnboardingStore,
  createStoredAttempt,
  decodeAttemptCursor,
  digestRetryToken,
  encodeAttemptCursor,
  getAttemptForPrincipal,
  isAfterCursor,
  mappingIdFor,
  mappedRolesFor,
  nextOrdinalForRole,
  operationBindingKey,
  recordRoleMapping,
  type OnboardingMutationNamespace,
  type OnboardingStore,
  type StoredAttempt,
  type StoredInvitation,
  type StoredOperation,
} from './store.js';

export interface OnboardingContext {
  mappedRoles: readonly ProposedRole[];
  principalKey: string;
  synthetic: boolean;
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

function invitationReference(
  store: OnboardingStore,
  secret: string,
  digestSecret: (value: string) => string,
): string {
  const digest = digestSecret(secret);
  for (const invitation of store.invitations.values()) {
    if (invitation.claimDigest === digest) {
      return invitation.invitationId;
    }
  }
  return digest;
}

function effectiveMappedRoles(
  store: OnboardingStore,
  context: OnboardingContext,
): ProposedRole[] {
  return [
    ...new Set([
      ...context.mappedRoles,
      ...mappedRolesFor(store, context.principalKey),
    ]),
  ];
}

function hasCoachMapping(
  store: OnboardingStore,
  context: OnboardingContext,
): boolean {
  return effectiveMappedRoles(store, context).includes('coach');
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
    claimFailureTracker?: ClaimFailureTracker;
    claimRepository?: OnboardingClaimRepository;
    claimThrottleWindow?: ClaimThrottleWindow;
    clock?: TrustedClock;
    idFactory?: OnboardingIdFactory;
    identitySession?: IdentitySessionPort;
    identitySessionStore?: IdentitySessionStore;
    persistence?: OnboardingPgPersistence;
    policyGateway?: OnboardingPolicyGateway;
    principalBinding?: PrincipalBindingRepository;
    principalReference?: PrincipalReferenceDeriver;
    readinessProbe?: OnboardingReadinessProbe;
    resolveContext?: ResolveOnboardingContext;
    secretFactory?: OnboardingSecretFactory;
    secretVerifier?: InvitationSecretVerifier;
    store?: OnboardingStore;
    syntheticReadiness?: boolean;
    transitionSink?: OnboardingTransitionSink;
  } = {},
): void {
  const store = options.store ?? createOnboardingStore();
  const persistence = options.persistence;
  const resolveContext = options.resolveContext ?? (() => null);
  const policyGateway =
    options.policyGateway ?? new SyntheticOnboardingPolicyGateway();
  const identitySession =
    options.identitySession ?? new SyntheticIdentitySessionPort();
  const identitySessionStore =
    options.identitySessionStore ?? new SyntheticIdentitySessionStore();
  const principalBinding =
    options.principalBinding ?? new SyntheticPrincipalBindingRepository();
  const principalReference =
    options.principalReference ?? new SyntheticPrincipalReferenceDeriver();
  const claimRepository =
    options.claimRepository ?? new SyntheticOnboardingClaimRepository();
  const transitionSink =
    options.transitionSink ?? new SyntheticOnboardingTransitionSink();
  const idFactory = options.idFactory ?? new CryptoOnboardingIdFactory();
  const secretFactory =
    options.secretFactory ?? new CryptoOnboardingSecretFactory();
  const secretVerifier =
    options.secretVerifier ?? new HmacInvitationSecretVerifier(store.pepper);
  const clock = options.clock ?? new SystemTrustedClock();
  const digestSecret = (secret: string) => secretVerifier.digest(secret);
  const readinessProbe =
    options.readinessProbe ??
    new SyntheticOnboardingReadinessProbe({
      evaluatedAt: '2026-08-19T12:00:00.000Z',
    });
  const claimFailureTracker =
    options.claimFailureTracker ?? new SyntheticClaimFailureTracker();
  const claimThrottleWindow =
    options.claimThrottleWindow ?? DEFAULT_CLAIM_THROTTLE_WINDOW;

  /**
   * PRD 07's claim-secret brute-force control: throttle before the invitation
   * lookup rather than after, and never distinguish a throttled response from
   * an ordinary invalid/unavailable invitation result.
   */
  const claimThrottleGuard = async (
    principalKey: string,
  ): Promise<'allowed' | 'throttled'> =>
    checkClaimThrottle({
      key: principalKey,
      nowUtcMs: Date.parse(clock.nowUtcMs()),
      tracker: claimFailureTracker,
      window: claimThrottleWindow,
    });

  const recordClaimFailure = async (principalKey: string): Promise<void> => {
    await claimFailureTracker.recordFailure(
      principalKey,
      Date.parse(clock.nowUtcMs()),
    );
  };

  const rememberOperation = async (
    bindingKey: string,
    principalKey: string,
    operation: StoredOperation,
  ): Promise<void> => {
    store.operations.set(bindingKey, operation);
    if (persistence !== undefined) {
      await persistOperation(persistence, bindingKey, principalKey, operation);
    }
  };

  const rememberInvitation = async (
    invitation: StoredInvitation,
  ): Promise<void> => {
    store.invitations.set(invitation.invitationId, invitation);
    if (persistence !== undefined) {
      await persistInvitation(persistence, invitation);
    }
  };

  const rememberAttempt = async (attempt: StoredAttempt): Promise<void> => {
    store.attempts.set(attempt.detail.attemptId, attempt);
    if (persistence !== undefined) {
      await persistAttempt(persistence, attempt);
    }
  };

  const rememberRoleMapping = async (
    principalKey: string,
    role: ProposedRole,
  ): Promise<void> => {
    recordRoleMapping(store, principalKey, role);
    if (persistence !== undefined) {
      await persistRoleMapping(persistence, {
        mappingId: mappingIdFor(principalKey, role),
        principalKey,
        role,
      });
    }
  };

  const appendTransition = async (input: {
    aggregate: 'invitation' | 'attempt' | 'role_mapping' | 'operation';
    aggregateId: string;
    nextState: string;
    operationId: string;
    previousState: string;
    reason: string;
  }): Promise<void> => {
    await transitionSink.append({
      aggregate: input.aggregate,
      aggregateId: input.aggregateId,
      nextState: input.nextState,
      operationId: input.operationId,
      previousState: input.previousState,
      reason: input.reason,
      recordedAt: clock.nowUtcMs(),
    });
  };

  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? '';

    if (path === '/v1/onboarding' || path.startsWith('/v1/onboarding/')) {
      reply.header('cache-control', 'no-store');
    }

    return payload;
  });

  if (options.syntheticReadiness === true) {
    app.get('/v1/onboarding/synthetic/readiness', async () =>
      readinessProbe.evaluate(),
    );
  }

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

    const derived = await principalReference.derive({
      environment: 'synthetic',
      issuer: 'synthetic.fitness-os',
      productionMode: false,
      subjectDigest: context.principalKey,
    });

    if (derived.status !== 'derived' || derived.candidates.length === 0) {
      await sendError(
        request,
        reply,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
      return null;
    }

    const resolved = await identitySession.resolve({
      mappedRoles: context.mappedRoles,
      productionMode: false,
      synthetic: context.synthetic,
      trustedPrincipalKey: context.principalKey,
    });

    if (resolved.status !== 'resolved') {
      await sendError(
        request,
        reply,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
      return null;
    }

    const binding = await principalBinding.resolveOrEstablish({
      nowUtcMs: clock.nowUtcMs(),
      principalKey: resolved.context.principalKey,
      productionMode: false,
    });

    if (binding.status === 'denied') {
      await sendError(
        request,
        reply,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
      return null;
    }

    const sessionId = `synthetic-session:${binding.binding.principalKey}`;
    const nowUtcMs = clock.nowUtcMs();
    let session = await identitySessionStore.get(sessionId);
    if (session === null) {
      const putResult = await identitySessionStore.put({
        createdAt: nowUtcMs,
        expiresAt: nowUtcMs,
        principalKey: binding.binding.principalKey,
        sessionId,
      });
      if (putResult === 'conflict') {
        session = await identitySessionStore.get(sessionId);
      } else {
        session = {
          createdAt: nowUtcMs,
          expiresAt: nowUtcMs,
          principalKey: binding.binding.principalKey,
          sessionId,
        };
      }
    }

    if (
      session === null ||
      session.principalKey !== binding.binding.principalKey
    ) {
      await sendError(
        request,
        reply,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
      return null;
    }

    return {
      mappedRoles: resolved.context.mappedRoles,
      principalKey: binding.binding.principalKey,
      synthetic: resolved.context.synthetic,
    };
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

    if (persistence !== undefined) {
      await hydratePrincipalAttempts(store, persistence, context.principalKey);
      await hydratePrincipalMappings(store, persistence, context.principalKey);
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

    if ((await claimThrottleGuard(context.principalKey)) === 'throttled') {
      return operationEnvelope({
        digest: semanticDigest({
          authority: context.principalKey,
          claimStatus: 'throttled',
          namespace: 'inspect_invitation',
        }),
        namespace: 'inspect_invitation',
        operationId: idFactory.operationId(),
        result: { outcome: 'invalid_or_unavailable' },
        state: 'operation_committed',
      });
    }

    const digest = semanticDigest({
      authority: context.principalKey,
      invitationRef: invitationReference(
        store,
        body.data.claimSecret,
        digestSecret,
      ),
      namespace: 'inspect_invitation',
    });

    const invitation = await loadInvitationByClaimDigest(
      store,
      persistence,
      digestSecret(body.data.claimSecret),
    );
    const inspection = invitation
      ? inspectInvitationState(invitation.state)
      : 'invalid_or_unavailable';

    if (inspection !== 'issued' || invitation === undefined) {
      await recordClaimFailure(context.principalKey);
      return operationEnvelope({
        digest,
        namespace: 'inspect_invitation',
        operationId: idFactory.operationId(),
        result: { outcome: 'invalid_or_unavailable' },
        state: 'operation_committed',
      });
    }

    return operationEnvelope({
      digest,
      namespace: 'inspect_invitation',
      operationId: idFactory.operationId(),
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

    const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
    const bindingKey = operationBindingKey(
      context.principalKey,
      'create_attempt',
      retryDigest,
    );
    const existingOperation = await loadOperation(
      store,
      persistence,
      bindingKey,
    );

    if ((await claimThrottleGuard(context.principalKey)) === 'throttled') {
      if (existingOperation !== undefined) {
        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'create_attempt',
          operationId: existingOperation.operationId,
          result: existingOperation.result,
          state: 'operation_replayed',
        });
      }

      const digest = semanticDigest({
        authority: context.principalKey,
        claimStatus: 'throttled',
        namespace: 'create_attempt',
      });
      const operationId = idFactory.operationId();
      const result = { outcome: 'invalid_or_unavailable' };
      await rememberOperation(bindingKey, context.principalKey, {
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
    }

    const digest = semanticDigest({
      authority: context.principalKey,
      invitationRef: invitationReference(
        store,
        body.data.claimSecret,
        digestSecret,
      ),
      namespace: 'create_attempt',
    });

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

    const commit = async (result: unknown) => {
      const operationId = idFactory.operationId();
      await rememberOperation(bindingKey, context.principalKey, {
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

    const invitation = await loadInvitationByClaimDigest(
      store,
      persistence,
      digestSecret(body.data.claimSecret),
    );

    if (
      invitation === undefined ||
      inspectInvitationState(invitation.state) !== 'issued'
    ) {
      await recordClaimFailure(context.principalKey);
      return await commit({ outcome: 'invalid_or_unavailable' });
    }

    if (persistence !== undefined) {
      await hydratePrincipalMappings(store, persistence, context.principalKey);
    }

    const alreadyMappedRoles = [
      ...new Set([
        ...context.mappedRoles,
        ...mappedRolesFor(store, context.principalKey),
      ]),
    ];

    if (alreadyMappedRoles.includes(invitation.proposedRole)) {
      return await commit({ outcome: 'mapping_conflict' });
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
      return await commit({ outcome: 'invalid_or_unavailable' });
    }

    const activeForRole = attemptsForPrincipalRole(
      store,
      context.principalKey,
      invitation.proposedRole,
    );

    if (!canAllocateAttempt(activeForRole.length)) {
      return await commit({
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
      return await commit({
        attempt: existing.detail,
        command: 'attempt',
        outcome: 'command_succeeded',
      });
    }

    const record = createStoredAttempt(
      invitation,
      nextOrdinalForRole(store, context.principalKey, invitation.proposedRole),
      context.principalKey,
      clock.nowUtcMs(),
      idFactory.attemptId(),
    );
    await rememberAttempt(record);

    const operationId = idFactory.operationId();
    await appendTransition({
      aggregate: 'attempt',
      aggregateId: record.detail.attemptId,
      nextState: record.detail.lifecycle,
      operationId,
      previousState: 'unallocated',
      reason: 'create_attempt',
    });
    const result = {
      attempt: record.detail,
      command: 'attempt' as const,
      outcome: 'command_succeeded' as const,
    };
    await rememberOperation(bindingKey, context.principalKey, {
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
      const existingOperation = await loadOperation(
        store,
        persistence,
        bindingKey,
      );

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

      const commit = async (result: unknown) => {
        const operationId = idFactory.operationId();
        await rememberOperation(bindingKey, context.principalKey, {
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

      const record = await loadAttempt(
        store,
        persistence,
        params.data.attemptId,
      );
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
        return await commit({
          attempt: record.detail,
          outcome: 'already_terminal',
        });
      }

      const operationId = idFactory.operationId();
      await appendTransition({
        aggregate: 'attempt',
        aggregateId: record.detail.attemptId,
        nextState: record.detail.lifecycle,
        operationId,
        previousState: record.detail.lifecycle,
        reason: 'resume_attempt',
      });
      const result = {
        attempt: record.detail,
        outcome: 'current_state' as const,
      };
      await rememberOperation(bindingKey, context.principalKey, {
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
      const existingOperation = await loadOperation(
        store,
        persistence,
        bindingKey,
      );

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

      const commit = async (result: unknown) => {
        const operationId = idFactory.operationId();
        await rememberOperation(bindingKey, context.principalKey, {
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

      const record = await loadAttempt(
        store,
        persistence,
        params.data.attemptId,
      );
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
        return await commit({
          attempt: record.detail,
          outcome: 'already_terminal',
        });
      }

      const previousLifecycle = record.detail.lifecycle;
      const abandoned = transitionAttempt(
        record.detail,
        'terminal',
        'abandoned',
      );
      if (abandoned.status !== 'advanced') {
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      await rememberAttempt({
        ...record,
        detail: abandoned.attempt,
      });

      const operationId = idFactory.operationId();
      await appendTransition({
        aggregate: 'attempt',
        aggregateId: record.detail.attemptId,
        nextState: abandoned.attempt.lifecycle,
        operationId,
        previousState: previousLifecycle,
        reason: 'abandon_attempt',
      });
      const result = {
        attempt: abandoned.attempt,
        command: 'attempt' as const,
        outcome: 'command_succeeded' as const,
      };
      await rememberOperation(bindingKey, context.principalKey, {
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
      const existingOperation = await loadOperation(
        store,
        persistence,
        bindingKey,
      );

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

      const record = await loadAttempt(
        store,
        persistence,
        params.data.attemptId,
      );
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

      const commit = async (result: unknown) => {
        const operationId = idFactory.operationId();
        await rememberOperation(bindingKey, context.principalKey, {
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
        return await commit({
          attempt: record.detail,
          command: 'attempt',
          outcome: 'command_succeeded',
        });
      }

      const previousLifecycle = record.detail.lifecycle;
      const advanced = transitionAttempt(record.detail, 'ready_to_claim');
      if (advanced.status !== 'advanced') {
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      const policyResult = await policyGateway.refresh({
        attemptId: record.detail.attemptId,
        productionMode: false,
      });
      if (policyResult.status !== 'started') {
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      const updated = attemptDetailSchema.parse({
        ...advanced.attempt,
        policy: policyResult.handoff,
      });
      await rememberAttempt({
        ...record,
        detail: updated,
      });

      const operationId = idFactory.operationId();
      await appendTransition({
        aggregate: 'attempt',
        aggregateId: record.detail.attemptId,
        nextState: updated.lifecycle,
        operationId,
        previousState: previousLifecycle,
        reason: 'refresh_policy',
      });
      const result = {
        attempt: updated,
        command: 'attempt' as const,
        outcome: 'command_succeeded' as const,
      };
      await rememberOperation(bindingKey, context.principalKey, {
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

      if (persistence !== undefined) {
        await hydratePrincipalMappings(
          store,
          persistence,
          context.principalKey,
        );
      }

      const digest = semanticDigest({
        attemptId: params.data.attemptId,
        authority: context.principalKey,
        invitationRef: invitationReference(
          store,
          body.data.claimSecret,
          digestSecret,
        ),
        namespace: 'claim_attempt',
      });
      const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
      const bindingKey = operationBindingKey(
        context.principalKey,
        'claim_attempt',
        retryDigest,
      );
      const existingOperation = await loadOperation(
        store,
        persistence,
        bindingKey,
      );

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

      const commit = async (result: unknown) => {
        const operationId = idFactory.operationId();
        await rememberOperation(bindingKey, context.principalKey, {
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

      const record = await loadAttempt(
        store,
        persistence,
        params.data.attemptId,
      );
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
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      const invitation = await loadInvitationByClaimDigest(
        store,
        persistence,
        digestSecret(body.data.claimSecret),
      );
      if (
        invitation === undefined ||
        invitation.invitationId !== record.detail.invitationId ||
        inspectInvitationState(invitation.state) !== 'issued' ||
        secretVerifier.verify(body.data.claimSecret, invitation.claimDigest)
          .status !== 'matched'
      ) {
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      const recordedAt = clock.nowUtcMs();
      const mappingId = mappingIdFor(
        context.principalKey,
        record.detail.proposedRole,
      );
      const claimResult = await claimRepository.commit({
        attempt: {
          createdAt: record.createdAt,
          detail: record.detail,
          principalKey: record.principalKey,
          updatedAt: recordedAt,
        },
        invitation: {
          claimDigest: invitation.claimDigest,
          invitationId: invitation.invitationId,
          proposedRole: invitation.proposedRole,
          purpose: invitation.purpose,
          state: invitation.state,
          targetCoachPrincipalKey: invitation.targetCoachPrincipalKey,
          updatedAt: recordedAt,
        },
        mapping: {
          createdAt: recordedAt,
          mappingId,
          principalKey: context.principalKey,
          role: record.detail.proposedRole,
        },
        productionMode: false,
      });

      if (claimResult.status !== 'committed') {
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      const completed = transitionAttempt(record.detail, 'completed');
      if (completed.status !== 'advanced') {
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      invitation.state = claimResult.invitation.state;
      await rememberInvitation(invitation);
      await rememberAttempt({
        ...record,
        detail: completed.attempt,
      });
      await rememberRoleMapping(
        context.principalKey,
        record.detail.proposedRole,
      );

      const operationId = idFactory.operationId();
      await transitionSink.append({
        aggregate: 'invitation',
        aggregateId: invitation.invitationId,
        nextState: claimResult.invitation.state,
        operationId,
        previousState: 'issued',
        reason: 'claim_attempt',
        recordedAt,
      });
      await transitionSink.append({
        aggregate: 'attempt',
        aggregateId: record.detail.attemptId,
        nextState: completed.attempt.lifecycle,
        operationId,
        previousState: 'ready_to_claim',
        reason: 'claim_attempt',
        recordedAt,
      });
      await transitionSink.append({
        aggregate: 'role_mapping',
        aggregateId: mappingId,
        nextState: record.detail.proposedRole,
        operationId,
        previousState: 'unmapped',
        reason: 'claim_attempt',
        recordedAt,
      });

      const result = {
        completionId: onboardingCompletionIdSchema.parse(randomUUID()),
        mappingId,
        outcome: 'completed' as const,
        role: record.detail.proposedRole,
      };
      await rememberOperation(bindingKey, context.principalKey, {
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
    },
  );

  app.get('/v1/onboarding/student-invitations', async (request, reply) => {
    const query = emptyOnboardingQuerySchema.safeParse(request.query);

    if (!query.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    const context = await requireContext(request, reply);
    if (context === null) {
      return;
    }

    if (persistence !== undefined) {
      await hydratePrincipalMappings(store, persistence, context.principalKey);
    }

    if (!hasCoachMapping(store, context)) {
      return sendError(request, reply, 403, 'FORBIDDEN', 'Forbidden');
    }

    if (persistence !== undefined) {
      await hydrateCoachInvitations(store, persistence, context.principalKey);
    }

    const items = [...store.invitations.values()]
      .filter(
        (invitation) =>
          invitation.purpose === 'student_onboarding' &&
          invitation.targetCoachPrincipalKey === context.principalKey,
      )
      .map((invitation) => ({
        invitationId: invitation.invitationId,
        purpose: 'student_onboarding' as const,
        state: invitation.state,
      }))
      .sort((left, right) =>
        left.invitationId < right.invitationId
          ? -1
          : left.invitationId > right.invitationId
            ? 1
            : 0,
      )
      .slice(0, 50);

    return studentInvitationListResponseSchema.parse({ items });
  });

  app.post('/v1/onboarding/student-invitations', async (request, reply) => {
    const body = issueStudentInvitationRequestSchema.safeParse(request.body);

    if (!body.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    const context = await requireContext(request, reply);
    if (context === null) {
      return;
    }

    if (persistence !== undefined) {
      await hydratePrincipalMappings(store, persistence, context.principalKey);
    }

    if (!hasCoachMapping(store, context)) {
      return sendError(request, reply, 403, 'FORBIDDEN', 'Forbidden');
    }

    const digest = semanticDigest({
      authority: context.principalKey,
      namespace: 'issue_student_invitation',
    });
    const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
    const bindingKey = operationBindingKey(
      context.principalKey,
      'issue_student_invitation',
      retryDigest,
    );
    const existingOperation = await loadOperation(
      store,
      persistence,
      bindingKey,
    );

    if (existingOperation !== undefined) {
      if (existingOperation.digest !== digest) {
        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'issue_student_invitation',
          operationId: existingOperation.operationId,
          result: null,
          state: 'operation_input_mismatch',
        });
      }

      return operationEnvelope({
        digest: existingOperation.digest,
        namespace: 'issue_student_invitation',
        operationId: existingOperation.operationId,
        result: existingOperation.result,
        state: 'operation_replayed',
      });
    }

    const claimSecret = invitationClaimSecretSchema.parse(
      secretFactory.claimSecret(),
    );
    const invitationId = idFactory.invitationId();
    await rememberInvitation({
      claimDigest: digestSecret(claimSecret),
      invitationId,
      proposedRole: 'student',
      purpose: 'student_onboarding',
      state: 'issued',
      targetCoachPrincipalKey: context.principalKey,
    });

    const result = {
      command: 'issue_student_invitation' as const,
      issued: {
        claimSecret,
        invitationId,
        purpose: 'student_onboarding' as const,
        state: 'issued' as const,
      },
      outcome: 'command_succeeded' as const,
    };

    const operationId = idFactory.operationId();
    await appendTransition({
      aggregate: 'invitation',
      aggregateId: invitationId,
      nextState: 'issued',
      operationId,
      previousState: 'unissued',
      reason: 'issue_student_invitation',
    });
    await rememberOperation(bindingKey, context.principalKey, {
      digest,
      namespace: 'issue_student_invitation',
      operationId,
      result,
      retryDigest,
    });

    return operationEnvelope({
      digest,
      namespace: 'issue_student_invitation',
      operationId,
      result,
      state: 'operation_committed',
    });
  });

  app.post(
    '/v1/onboarding/student-invitations/:invitationId/revoke',
    async (request, reply) => {
      const params = invitationLocatorSchema.safeParse(request.params);
      const body = revokeStudentInvitationRequestSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      const context = await requireContext(request, reply);
      if (context === null) {
        return;
      }

      if (persistence !== undefined) {
        await hydratePrincipalMappings(
          store,
          persistence,
          context.principalKey,
        );
      }

      if (!hasCoachMapping(store, context)) {
        return sendError(request, reply, 403, 'FORBIDDEN', 'Forbidden');
      }

      const digest = semanticDigest({
        authority: context.principalKey,
        invitationId: params.data.invitationId,
        namespace: 'revoke_student_invitation',
      });
      const retryDigest = digestRetryToken(body.data.retryToken, store.pepper);
      const bindingKey = operationBindingKey(
        context.principalKey,
        'revoke_student_invitation',
        retryDigest,
      );
      const existingOperation = await loadOperation(
        store,
        persistence,
        bindingKey,
      );

      if (existingOperation !== undefined) {
        if (existingOperation.digest !== digest) {
          return operationEnvelope({
            digest: existingOperation.digest,
            namespace: 'revoke_student_invitation',
            operationId: existingOperation.operationId,
            result: null,
            state: 'operation_input_mismatch',
          });
        }

        return operationEnvelope({
          digest: existingOperation.digest,
          namespace: 'revoke_student_invitation',
          operationId: existingOperation.operationId,
          result: existingOperation.result,
          state: 'operation_replayed',
        });
      }

      const commit = async (result: unknown) => {
        const operationId = idFactory.operationId();
        await rememberOperation(bindingKey, context.principalKey, {
          digest,
          namespace: 'revoke_student_invitation',
          operationId,
          result,
          retryDigest,
        });
        return operationEnvelope({
          digest,
          namespace: 'revoke_student_invitation',
          operationId,
          result,
          state: 'operation_committed',
        });
      };

      const invitation = await loadInvitation(
        store,
        persistence,
        params.data.invitationId,
      );
      if (
        invitation === undefined ||
        invitation.purpose !== 'student_onboarding' ||
        invitation.targetCoachPrincipalKey !== context.principalKey
      ) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }

      const revoked = revokeInvitation(invitation.state);
      if (revoked.status === 'already_terminal') {
        return await commit({
          command: 'revoke_student_invitation',
          invitation: {
            invitationId: invitation.invitationId,
            purpose: 'student_onboarding',
            state: invitation.state,
          },
          outcome: 'command_succeeded',
        });
      }

      if (revoked.status !== 'advanced') {
        return await commit({ outcome: 'invalid_or_unavailable' });
      }

      const previousState = invitation.state;
      invitation.state = revoked.state;
      await rememberInvitation(invitation);

      const operationId = idFactory.operationId();
      await appendTransition({
        aggregate: 'invitation',
        aggregateId: invitation.invitationId,
        nextState: invitation.state,
        operationId,
        previousState,
        reason: 'revoke_student_invitation',
      });
      const result = {
        command: 'revoke_student_invitation' as const,
        invitation: {
          invitationId: invitation.invitationId,
          purpose: 'student_onboarding' as const,
          state: invitation.state,
        },
        outcome: 'command_succeeded' as const,
      };
      await rememberOperation(bindingKey, context.principalKey, {
        digest,
        namespace: 'revoke_student_invitation',
        operationId,
        result,
        retryDigest,
      });
      return operationEnvelope({
        digest,
        namespace: 'revoke_student_invitation',
        operationId,
        result,
        state: 'operation_committed',
      });
    },
  );
}

import type { ExerciseKnowledgeReader } from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  healthResponseSchema,
  notReadyResponseSchema,
  readyResponseSchema,
} from '@fitness-os/schemas';
import cors from '@fastify/cors';
import Fastify, {
  errorCodes,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { randomUUID } from 'node:crypto';

import {
  registerExerciseCatalogRoutes,
  type ExerciseCatalogRouteDependencies,
} from './exercise-catalog-routes.js';
import {
  registerOnboardingRoutes,
  type ResolveOnboardingContext,
} from './onboarding/routes.js';
import type { OnboardingStore } from './onboarding/store.js';
import { registerMovementRoutes } from './movement-routes.js';
import {
  registerPrivacySyntheticRoutes,
  type PrivacySyntheticOptions,
} from './privacy/routes.js';

export type ReadinessCheck = () => boolean | Promise<boolean>;

export interface PlatformOptions {
  allowSyntheticOnboarding?: boolean;
  allowSyntheticPrivacy?: boolean;
  corsAllowedOrigins?: readonly string[];
  exerciseCatalog?: {
    reader: ExerciseKnowledgeReader;
    isInvalidRequest?: ExerciseCatalogRouteDependencies['isInvalidRequest'];
    isStorageUnavailable?: ExerciseCatalogRouteDependencies['isStorageUnavailable'];
  };
  onboarding?: {
    claimRepository?: import('@fitness-os/domain').OnboardingClaimRepository;
    identitySession?: import('@fitness-os/domain').IdentitySessionPort;
    identitySessionStore?: import('@fitness-os/domain').IdentitySessionStore;
    persistence?: import('./onboarding/pg-persistence.js').OnboardingPgPersistence;
    policyGateway?: import('@fitness-os/domain').OnboardingPolicyGateway;
    principalBinding?: import('@fitness-os/domain').PrincipalBindingRepository;
    principalReference?: import('@fitness-os/domain').PrincipalReferenceDeriver;
    readinessProbe?: import('@fitness-os/domain').OnboardingReadinessProbe;
    resolveContext?: ResolveOnboardingContext;
    store?: OnboardingStore;
    transitionSink?: import('@fitness-os/domain').OnboardingTransitionSink;
  };
  privacy?: PrivacySyntheticOptions;
  readinessCheck?: ReadinessCheck;
}

function isFastifyClientInputError(
  error: unknown,
  validationErrors: WeakSet<Error>,
): boolean {
  if (
    error instanceof errorCodes.FST_ERR_CTP_BODY_TOO_LARGE ||
    error instanceof errorCodes.FST_ERR_CTP_EMPTY_JSON_BODY ||
    error instanceof errorCodes.FST_ERR_CTP_INVALID_CONTENT_LENGTH ||
    error instanceof errorCodes.FST_ERR_CTP_INVALID_JSON_BODY ||
    error instanceof errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE
  ) {
    return true;
  }

  return error instanceof Error && validationErrors.has(error);
}

export function buildApp(
  options: FastifyServerOptions = {},
  platform: PlatformOptions = {},
): FastifyInstance {
  const validationErrors = new WeakSet<Error>();
  const formatSchemaError = (): Error => {
    const error = new Error('Request validation failed');
    validationErrors.add(error);
    return error;
  };
  const app = Fastify({
    ...options,
    genReqId: () => randomUUID(),
    routerOptions: {
      ...options.routerOptions,
      onBadUrl: (_path, _request, response) => {
        const requestId = randomUUID();
        const payload = JSON.stringify(
          apiErrorResponseSchema.parse({
            error: {
              code: 'BAD_REQUEST',
              message: 'Invalid request',
              requestId,
            },
          }),
        );

        response.statusCode = 400;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.setHeader('x-request-id', requestId);
        response.end(payload);
      },
    },
    requestIdHeader: false,
    schemaErrorFormatter: formatSchemaError,
  });
  if (
    platform.onboarding !== undefined &&
    platform.allowSyntheticOnboarding !== true
  ) {
    throw new Error(
      'Synthetic onboarding composition requires an explicit test seam',
    );
  }

  if (
    platform.privacy !== undefined &&
    platform.allowSyntheticPrivacy !== true
  ) {
    throw new Error(
      'Synthetic privacy composition requires an explicit test seam',
    );
  }

  const corsAllowedOrigins = new Set(
    platform.corsAllowedOrigins ?? ['http://localhost:3000'],
  );
  const readinessCheck = platform.readinessCheck ?? (() => true);

  app.addHook('onRoute', (routeOptions) => {
    routeOptions.schemaErrorFormatter = formatSchemaError;
  });

  void app.register(cors, {
    credentials: false,
    origin: (origin, callback) => {
      callback(null, origin === undefined || corsAllowedOrigins.has(origin));
    },
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(
      apiErrorResponseSchema.parse({
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
          requestId: request.id,
        },
      }),
    ),
  );

  app.setErrorHandler((error, request, reply) => {
    const isClientError = isFastifyClientInputError(error, validationErrors);
    const path = request.url.split('?')[0] ?? '';

    if (
      path === '/movements' ||
      path.startsWith('/movements/') ||
      path === '/exercises' ||
      path.startsWith('/exercises/') ||
      path === '/exercise-taxonomy' ||
      path.startsWith('/exercise-taxonomy/')
    ) {
      reply.header('cache-control', 'no-store');
    }

    if (!isClientError) {
      request.log.error({ err: error }, 'Request failed');
    }

    return reply.code(isClientError ? 400 : 500).send(
      apiErrorResponseSchema.parse({
        error: {
          code: isClientError ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
          message: isClientError ? 'Invalid request' : 'Unexpected error',
          requestId: request.id,
        },
      }),
    );
  });

  app.get('/health', async () =>
    healthResponseSchema.parse({
      status: 'ok',
    }),
  );

  app.get('/ready', async (request, reply) => {
    let ready = false;

    try {
      ready = (await readinessCheck()) === true;
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
    }

    if (!ready) {
      return reply
        .code(503)
        .send(notReadyResponseSchema.parse({ status: 'not_ready' }));
    }

    return readyResponseSchema.parse({ status: 'ready' });
  });

  registerMovementRoutes(app);
  registerOnboardingRoutes(app, {
    ...platform.onboarding,
    syntheticReadiness: platform.allowSyntheticOnboarding === true,
  });

  if (platform.allowSyntheticPrivacy === true) {
    registerPrivacySyntheticRoutes(app, platform.privacy ?? {});
  }

  if (platform.exerciseCatalog !== undefined) {
    registerExerciseCatalogRoutes(app, {
      reader: platform.exerciseCatalog.reader,
      isInvalidRequest:
        platform.exerciseCatalog.isInvalidRequest ?? (() => false),
      isStorageUnavailable:
        platform.exerciseCatalog.isStorageUnavailable ?? (() => false),
    });
  }

  return app;
}

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
  registerOnboardingRoutes,
  type ResolveOnboardingContext,
} from './onboarding/routes.js';
import type { OnboardingStore } from './onboarding/store.js';
import { registerMovementRoutes } from './movement-routes.js';

export type ReadinessCheck = () => boolean | Promise<boolean>;

export interface PlatformOptions {
  corsAllowedOrigins?: readonly string[];
  onboarding?: {
    resolveContext?: ResolveOnboardingContext;
    store?: OnboardingStore;
  };
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

    if (path === '/movements' || path.startsWith('/movements/')) {
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
  registerOnboardingRoutes(app, platform.onboarding);

  return app;
}

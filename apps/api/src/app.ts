import {
  apiErrorResponseSchema,
  healthResponseSchema,
  notReadyResponseSchema,
  readyResponseSchema,
} from '@fitness-os/schemas';
import cors from '@fastify/cors';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { randomUUID } from 'node:crypto';

export type ReadinessCheck = () => boolean | Promise<boolean>;

export interface PlatformOptions {
  corsAllowedOrigins?: readonly string[];
  readinessCheck?: ReadinessCheck;
}

export function buildApp(
  options: FastifyServerOptions = {},
  platform: PlatformOptions = {},
): FastifyInstance {
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
  });
  const corsAllowedOrigins = new Set(
    platform.corsAllowedOrigins ?? ['http://localhost:3000'],
  );
  const readinessCheck = platform.readinessCheck ?? (() => true);

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
    const isClientError =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500;

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

  return app;
}

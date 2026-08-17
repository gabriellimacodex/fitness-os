import {
  getMovementById,
  listMovements,
  type MovementLookupResult,
} from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  movementDetailParamsSchema,
  movementDetailResponseSchema,
  movementEmptyQuerySchema,
  movementListResponseSchema,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface MovementRouteCatalog {
  getMovementById(movementId: string): MovementLookupResult;
  listMovements(): ReturnType<typeof listMovements>;
}

const defaultCatalog: MovementRouteCatalog = {
  getMovementById,
  listMovements,
};

function sendPlatformError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: 400 | 404,
  code: 'BAD_REQUEST' | 'NOT_FOUND',
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

export function registerMovementRoutes(
  app: FastifyInstance,
  catalog: MovementRouteCatalog = defaultCatalog,
): void {
  const movements = catalog ?? defaultCatalog;
  app.get('/movements', async (request, reply) => {
    const query = movementEmptyQuerySchema.safeParse(request.query);

    if (!query.success) {
      return sendPlatformError(
        request,
        reply,
        400,
        'BAD_REQUEST',
        'Invalid request',
      );
    }

    reply.header('cache-control', 'no-store');

    return movementListResponseSchema.parse({
      items: movements.listMovements(),
    });
  });

  app.get('/movements/:movementId', async (request, reply) => {
    const query = movementEmptyQuerySchema.safeParse(request.query);

    if (!query.success) {
      return sendPlatformError(
        request,
        reply,
        400,
        'BAD_REQUEST',
        'Invalid request',
      );
    }

    const params = movementDetailParamsSchema.safeParse(request.params);

    if (!params.success) {
      return sendPlatformError(
        request,
        reply,
        400,
        'BAD_REQUEST',
        'Invalid request',
      );
    }

    const result = movements.getMovementById(params.data.movementId);

    if (result.status === 'invalid') {
      return sendPlatformError(
        request,
        reply,
        400,
        'BAD_REQUEST',
        'Invalid request',
      );
    }

    if (result.status === 'not_found') {
      return sendPlatformError(
        request,
        reply,
        404,
        'NOT_FOUND',
        'Resource not found',
      );
    }

    reply.header('cache-control', 'no-store');

    return movementDetailResponseSchema.parse(result.value);
  });
}

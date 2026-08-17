import type { ExerciseKnowledgeReader } from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  exerciseDetailSchema,
  exerciseIdParamsSchema,
  exerciseListPageSchema,
  exerciseListQuerySchema,
  exerciseRevisionParamsSchema,
  exerciseRevisionSchema,
  taxonomyDiscoveryPageSchema,
  taxonomyDiscoveryQuerySchema,
  type ApiErrorCode,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface ExerciseCatalogRouteDependencies {
  readonly reader: ExerciseKnowledgeReader;
  readonly isStorageUnavailable: (error: unknown) => boolean;
  readonly isInvalidRequest?: (error: unknown) => boolean;
}

const sendError = (
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: 400 | 404 | 500 | 503,
  code: ApiErrorCode,
  message: string,
) =>
  reply.code(statusCode).send(
    apiErrorResponseSchema.parse({
      error: { code, message, requestId: request.id },
    }),
  );

const logReadFailure = (request: FastifyRequest, error: unknown): void => {
  request.log.error(
    { errorClass: error instanceof Error ? error.name : 'UnknownError' },
    'Exercise catalog read failed',
  );
};

const isClassified = (
  classifier: ((error: unknown) => boolean) | undefined,
  error: unknown,
): boolean => {
  try {
    return classifier?.(error) ?? false;
  } catch {
    return false;
  }
};

const hasNoQueryFields = (query: unknown): boolean =>
  typeof query === 'object' &&
  query !== null &&
  !Array.isArray(query) &&
  Object.keys(query).length === 0;

const sendReadFailure = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  dependencies: ExerciseCatalogRouteDependencies,
) => {
  if (isClassified(dependencies.isInvalidRequest, error)) {
    return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
  }
  if (isClassified(dependencies.isStorageUnavailable, error)) {
    return sendError(
      request,
      reply,
      503,
      'SERVICE_UNAVAILABLE',
      'Service unavailable',
    );
  }
  logReadFailure(request, error);
  return sendError(request, reply, 500, 'INTERNAL_ERROR', 'Unexpected error');
};

export function registerExerciseCatalogRoutes(
  app: FastifyInstance,
  dependencies: ExerciseCatalogRouteDependencies,
): void {
  app.get('/exercises', async (request, reply) => {
    const query = exerciseListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    try {
      const page = exerciseListPageSchema.safeParse(
        await dependencies.reader.listExercises(query.data),
      );
      if (!page.success) {
        logReadFailure(request, new Error('Invalid catalog response'));
        return sendError(
          request,
          reply,
          500,
          'INTERNAL_ERROR',
          'Unexpected error',
        );
      }
      return page.data;
    } catch (error) {
      return sendReadFailure(request, reply, error, dependencies);
    }
  });

  app.get('/exercises/:exerciseId', async (request, reply) => {
    const params = exerciseIdParamsSchema.safeParse(request.params);
    if (!params.success || !hasNoQueryFields(request.query)) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    try {
      const result = await dependencies.reader.getCurrentExercise(
        params.data.exerciseId,
      );
      if (result === null) {
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }
      const detail = exerciseDetailSchema.safeParse(result);
      if (!detail.success) {
        logReadFailure(request, new Error('Invalid catalog response'));
        return sendError(
          request,
          reply,
          500,
          'INTERNAL_ERROR',
          'Unexpected error',
        );
      }
      return detail.data;
    } catch (error) {
      return sendReadFailure(request, reply, error, dependencies);
    }
  });

  app.get(
    '/exercises/:exerciseId/revisions/:revision',
    async (request, reply) => {
      const params = exerciseRevisionParamsSchema.safeParse(request.params);
      if (!params.success || !hasNoQueryFields(request.query)) {
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      try {
        const result = await dependencies.reader.getExerciseRevision(
          params.data.exerciseId,
          params.data.revision,
        );
        if (result === null) {
          return sendError(
            request,
            reply,
            404,
            'NOT_FOUND',
            'Resource not found',
          );
        }
        const revision = exerciseRevisionSchema.safeParse(result);
        if (!revision.success) {
          logReadFailure(request, new Error('Invalid catalog response'));
          return sendError(
            request,
            reply,
            500,
            'INTERNAL_ERROR',
            'Unexpected error',
          );
        }
        return revision.data;
      } catch (error) {
        return sendReadFailure(request, reply, error, dependencies);
      }
    },
  );

  app.get('/exercise-taxonomy', async (request, reply) => {
    const query = taxonomyDiscoveryQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    try {
      const page = taxonomyDiscoveryPageSchema.safeParse(
        await dependencies.reader.listTaxonomy(query.data),
      );
      if (!page.success) {
        logReadFailure(request, new Error('Invalid catalog response'));
        return sendError(
          request,
          reply,
          500,
          'INTERNAL_ERROR',
          'Unexpected error',
        );
      }
      return page.data;
    } catch (error) {
      return sendReadFailure(request, reply, error, dependencies);
    }
  });
}

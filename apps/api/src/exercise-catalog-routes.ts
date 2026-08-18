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
  type ExerciseDetail,
  type ExerciseRevision,
  type ExerciseTaxonomyAssignments,
  type TaxonomyTerm,
} from '@fitness-os/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface ExerciseCatalogRouteDependencies {
  readonly reader: ExerciseKnowledgeReader;
  readonly isStorageUnavailable: (error: unknown) => boolean;
  readonly isInvalidRequest: (error: unknown) => boolean;
}

const sendError = (
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: 400 | 404 | 500 | 503,
  code: ApiErrorCode,
  message: string,
) => {
  reply.header('cache-control', 'no-store');
  return reply.code(statusCode).send(
    apiErrorResponseSchema.parse({
      error: { code, message, requestId: request.id },
    }),
  );
};

const isClassified = (
  classifier: (error: unknown) => boolean,
  error: unknown,
): boolean => {
  try {
    return classifier(error);
  } catch {
    return false;
  }
};

const hasNoQueryFields = (query: unknown): boolean =>
  typeof query === 'object' &&
  query !== null &&
  !Array.isArray(query) &&
  Object.keys(query).length === 0;

const MAX_LOG_DURATION_MS = 86_400_000;
const SAFE_ERROR_CLASS = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const corruptResponseError = Object.assign(new Error(), {
  name: 'CatalogResponseValidationError',
});
const requestValidationError = Object.assign(new Error(), {
  name: 'RequestValidationError',
});

type ReadOperation =
  | 'list_exercises'
  | 'get_current_exercise'
  | 'get_exercise_revision'
  | 'list_taxonomy';
type ReadOutcome =
  | 'success'
  | 'invalid_request'
  | 'not_found'
  | 'storage_unavailable'
  | 'corrupt_response'
  | 'unexpected_error';

interface CatalogProjection {
  readonly taxonomyTerms?: readonly TaxonomyTerm[];
  readonly assignments?: readonly ExerciseTaxonomyAssignments[];
  readonly revisions?: readonly ExerciseRevision[];
  readonly detail?: ExerciseDetail;
}

const isCatalogProjectionConsistent = ({
  taxonomyTerms = [],
  assignments = [],
  revisions = [],
  detail,
}: CatalogProjection): boolean => {
  const termProjectionById = new Map<string, string>();
  const dimensionIdByKey = new Map<string, string>();
  const dimensionKeyById = new Map<string, string>();
  const termIdByDimensionAndKey = new Map<string, string>();
  const termById = new Map<string, TaxonomyTerm>();
  const validateTerm = (term: TaxonomyTerm): boolean => {
    const projection = JSON.stringify([
      term.dimensionId,
      term.dimension,
      term.key,
      term.label,
      term.meaning,
      term.lifecycle,
      term.replacedByTermId,
    ]);
    const existing = termProjectionById.get(term.id);
    if (existing !== undefined && existing !== projection) {
      return false;
    }
    const dimensionId = dimensionIdByKey.get(term.dimension);
    const dimensionKey = dimensionKeyById.get(term.dimensionId);
    const dimensionAndTermKey = JSON.stringify([term.dimensionId, term.key]);
    const termId = termIdByDimensionAndKey.get(dimensionAndTermKey);
    if (
      (dimensionId !== undefined && dimensionId !== term.dimensionId) ||
      (dimensionKey !== undefined && dimensionKey !== term.dimension) ||
      (termId !== undefined && termId !== term.id)
    ) {
      return false;
    }
    termProjectionById.set(term.id, projection);
    dimensionIdByKey.set(term.dimension, term.dimensionId);
    dimensionKeyById.set(term.dimensionId, term.dimension);
    termIdByDimensionAndKey.set(dimensionAndTermKey, term.id);
    termById.set(term.id, term);
    return true;
  };

  const allRevisions = [
    ...revisions,
    ...(detail === undefined ? [] : [detail.currentRevision]),
  ];
  const allAssignments = [
    ...assignments,
    ...allRevisions.map((revision) => revision.taxonomy),
    ...(detail === undefined ? [] : [detail.taxonomy]),
  ];
  const taxonomyTermsAreConsistent = taxonomyTerms.every(validateTerm);
  const assignmentsAreConsistent = allAssignments.every((assignment) => {
    const terms = [assignment.modality, ...assignment.equipment];
    return (
      new Set(terms.map((term) => term.id)).size === terms.length &&
      terms.every(validateTerm)
    );
  });
  const revisionsAreConsistent = allRevisions.every((revision) => {
    const referenceIds = new Set<string>();
    const referenceIdentities = new Set<string>();
    for (const reference of revision.references) {
      const identity = JSON.stringify([
        reference.kind,
        reference.locator,
        reference.purpose,
      ]);
      if (referenceIds.has(reference.id) || referenceIdentities.has(identity)) {
        return false;
      }
      referenceIds.add(reference.id);
      referenceIdentities.add(identity);
    }

    const provenanceReferences = revision.references.filter(
      (reference) => reference.purpose === 'provenance',
    );
    if (revision.provenance.originKind === 'internally_curated') {
      return (
        revision.provenance.primaryProvenanceReferenceId === null &&
        provenanceReferences.length === 0
      );
    }
    return (
      revision.provenance.primaryProvenanceReferenceId !== null &&
      provenanceReferences.length === 1 &&
      provenanceReferences[0]?.id ===
        revision.provenance.primaryProvenanceReferenceId
    );
  });
  const detailIsConsistent =
    detail === undefined ||
    (detail.currentRevision.exerciseId === detail.id &&
      detail.currentRevision.displayName === detail.currentName &&
      JSON.stringify(detail.taxonomy) ===
        JSON.stringify(detail.currentRevision.taxonomy));
  const visitedTermIds = new Set<string>();
  const visitingTermIds = new Set<string>();
  const hasReplacementCycleFrom = (termId: string): boolean => {
    if (visitedTermIds.has(termId)) {
      return false;
    }
    if (visitingTermIds.has(termId)) {
      return true;
    }
    visitingTermIds.add(termId);
    const successorId = termById.get(termId)?.replacedByTermId;
    if (
      successorId !== null &&
      successorId !== undefined &&
      termById.has(successorId) &&
      hasReplacementCycleFrom(successorId)
    ) {
      return true;
    }
    visitingTermIds.delete(termId);
    visitedTermIds.add(termId);
    return false;
  };
  const replacementGraphIsAcyclic = [...termById.keys()].every(
    (termId) => !hasReplacementCycleFrom(termId),
  );
  const predecessorBySuccessorId = new Map<string, string>();
  const replacementDimensionsAreConsistent = [...termById.values()].every(
    (term) => {
      const successor =
        term.replacedByTermId === null
          ? undefined
          : termById.get(term.replacedByTermId);
      return (
        successor === undefined ||
        (successor.dimensionId === term.dimensionId &&
          successor.dimension === term.dimension)
      );
    },
  );
  const replacementPredecessorsAreUnique = [...termById.values()].every(
    (term) => {
      const successorId = term.replacedByTermId;
      if (successorId === null) {
        return true;
      }
      const predecessorId = predecessorBySuccessorId.get(successorId);
      if (predecessorId !== undefined && predecessorId !== term.id) {
        return false;
      }
      predecessorBySuccessorId.set(successorId, term.id);
      return true;
    },
  );

  return (
    taxonomyTermsAreConsistent &&
    assignmentsAreConsistent &&
    revisionsAreConsistent &&
    detailIsConsistent &&
    replacementGraphIsAcyclic &&
    replacementDimensionsAreConsistent &&
    replacementPredecessorsAreUnique
  );
};

const toErrorClass = (error: unknown): string =>
  error instanceof Error && SAFE_ERROR_CLASS.test(error.name)
    ? error.name
    : 'UnknownError';

const logReadOutcome = (
  request: FastifyRequest,
  operation: ReadOperation,
  outcome: ReadOutcome,
  startedAt: number,
  error?: unknown,
): void => {
  const durationMs = Math.min(
    MAX_LOG_DURATION_MS,
    Math.max(0, Math.round(performance.now() - startedAt)),
  );
  const fields = {
    operation,
    outcome,
    requestId: request.id,
    durationMs,
    ...(error === undefined ? {} : { errorClass: toErrorClass(error) }),
  };
  if (outcome === 'corrupt_response' || outcome === 'unexpected_error') {
    request.log.error(fields, 'Exercise catalog read completed');
  } else if (
    outcome === 'invalid_request' ||
    outcome === 'storage_unavailable'
  ) {
    request.log.warn(fields, 'Exercise catalog read completed');
  } else {
    request.log.info(fields, 'Exercise catalog read completed');
  }
};

const sendReadFailure = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  dependencies: ExerciseCatalogRouteDependencies,
  operation: ReadOperation,
  startedAt: number,
) => {
  if (isClassified(dependencies.isInvalidRequest, error)) {
    logReadOutcome(request, operation, 'invalid_request', startedAt, error);
    return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
  }
  if (isClassified(dependencies.isStorageUnavailable, error)) {
    logReadOutcome(request, operation, 'storage_unavailable', startedAt, error);
    return sendError(
      request,
      reply,
      503,
      'SERVICE_UNAVAILABLE',
      'Service unavailable',
    );
  }
  logReadOutcome(request, operation, 'unexpected_error', startedAt, error);
  return sendError(request, reply, 500, 'INTERNAL_ERROR', 'Unexpected error');
};

export function registerExerciseCatalogRoutes(
  app: FastifyInstance,
  dependencies: ExerciseCatalogRouteDependencies,
): void {
  app.get('/exercises', async (request, reply) => {
    const startedAt = performance.now();
    const query = exerciseListQuerySchema.safeParse(request.query);
    if (!query.success) {
      logReadOutcome(
        request,
        'list_exercises',
        'invalid_request',
        startedAt,
        requestValidationError,
      );
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    try {
      const page = exerciseListPageSchema.safeParse(
        await dependencies.reader.listExercises(query.data),
      );
      if (
        !page.success ||
        page.data.items.length > query.data.limit ||
        (page.data.nextCursor !== null &&
          page.data.items.length !== query.data.limit) ||
        (query.data.cursor !== undefined &&
          page.data.nextCursor === query.data.cursor) ||
        page.data.items.some(
          (item, index, items) => index > 0 && item.id <= items[index - 1]!.id,
        ) ||
        new Set(page.data.items.map((item) => item.canonicalKey)).size !==
          page.data.items.length ||
        !isCatalogProjectionConsistent({
          assignments: page.data.items.map((item) => item.taxonomy),
        }) ||
        page.data.items.some((item) => {
          if (item.lifecycle !== 'active') {
            return true;
          }
          if (query.data.taxonomyTermIds === undefined) {
            return false;
          }
          const assignedTermIds = new Set([
            item.taxonomy.modality.id,
            ...item.taxonomy.equipment.map((term) => term.id),
          ]);
          return query.data.taxonomyTermIds.some(
            (termId) => !assignedTermIds.has(termId),
          );
        })
      ) {
        logReadOutcome(
          request,
          'list_exercises',
          'corrupt_response',
          startedAt,
          corruptResponseError,
        );
        return sendError(
          request,
          reply,
          500,
          'INTERNAL_ERROR',
          'Unexpected error',
        );
      }
      logReadOutcome(request, 'list_exercises', 'success', startedAt);
      return page.data;
    } catch (error) {
      return sendReadFailure(
        request,
        reply,
        error,
        dependencies,
        'list_exercises',
        startedAt,
      );
    }
  });

  app.get('/exercises/:exerciseId', async (request, reply) => {
    const startedAt = performance.now();
    const params = exerciseIdParamsSchema.safeParse(request.params);
    if (!params.success || !hasNoQueryFields(request.query)) {
      logReadOutcome(
        request,
        'get_current_exercise',
        'invalid_request',
        startedAt,
        requestValidationError,
      );
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    try {
      const result = await dependencies.reader.getCurrentExercise(
        params.data.exerciseId,
      );
      if (result === null) {
        logReadOutcome(request, 'get_current_exercise', 'not_found', startedAt);
        return sendError(
          request,
          reply,
          404,
          'NOT_FOUND',
          'Resource not found',
        );
      }
      const detail = exerciseDetailSchema.safeParse(result);
      if (
        !detail.success ||
        detail.data.id !== params.data.exerciseId ||
        !isCatalogProjectionConsistent({
          detail: detail.data,
        })
      ) {
        logReadOutcome(
          request,
          'get_current_exercise',
          'corrupt_response',
          startedAt,
          corruptResponseError,
        );
        return sendError(
          request,
          reply,
          500,
          'INTERNAL_ERROR',
          'Unexpected error',
        );
      }
      logReadOutcome(request, 'get_current_exercise', 'success', startedAt);
      return detail.data;
    } catch (error) {
      return sendReadFailure(
        request,
        reply,
        error,
        dependencies,
        'get_current_exercise',
        startedAt,
      );
    }
  });

  app.get(
    '/exercises/:exerciseId/revisions/:revision',
    async (request, reply) => {
      const startedAt = performance.now();
      const params = exerciseRevisionParamsSchema.safeParse(request.params);
      if (!params.success || !hasNoQueryFields(request.query)) {
        logReadOutcome(
          request,
          'get_exercise_revision',
          'invalid_request',
          startedAt,
          requestValidationError,
        );
        return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
      }

      try {
        const result = await dependencies.reader.getExerciseRevision(
          params.data.exerciseId,
          params.data.revision,
        );
        if (result === null) {
          logReadOutcome(
            request,
            'get_exercise_revision',
            'not_found',
            startedAt,
          );
          return sendError(
            request,
            reply,
            404,
            'NOT_FOUND',
            'Resource not found',
          );
        }
        const revision = exerciseRevisionSchema.safeParse(result);
        if (
          !revision.success ||
          revision.data.exerciseId !== params.data.exerciseId ||
          revision.data.revision !== params.data.revision ||
          !isCatalogProjectionConsistent({
            revisions: [revision.data],
          })
        ) {
          logReadOutcome(
            request,
            'get_exercise_revision',
            'corrupt_response',
            startedAt,
            corruptResponseError,
          );
          return sendError(
            request,
            reply,
            500,
            'INTERNAL_ERROR',
            'Unexpected error',
          );
        }
        logReadOutcome(request, 'get_exercise_revision', 'success', startedAt);
        return revision.data;
      } catch (error) {
        return sendReadFailure(
          request,
          reply,
          error,
          dependencies,
          'get_exercise_revision',
          startedAt,
        );
      }
    },
  );

  app.get('/exercise-taxonomy', async (request, reply) => {
    const startedAt = performance.now();
    const query = taxonomyDiscoveryQuerySchema.safeParse(request.query);
    if (!query.success) {
      logReadOutcome(
        request,
        'list_taxonomy',
        'invalid_request',
        startedAt,
        requestValidationError,
      );
      return sendError(request, reply, 400, 'BAD_REQUEST', 'Invalid request');
    }

    try {
      const page = taxonomyDiscoveryPageSchema.safeParse(
        await dependencies.reader.listTaxonomy(query.data),
      );
      if (
        !page.success ||
        page.data.items.length > query.data.limit ||
        (page.data.nextCursor !== null &&
          page.data.items.length !== query.data.limit) ||
        (query.data.cursor !== undefined &&
          page.data.nextCursor === query.data.cursor) ||
        new Set(page.data.items.map((item) => item.dimensionId)).size > 1 ||
        !isCatalogProjectionConsistent({ taxonomyTerms: page.data.items }) ||
        page.data.items.some((item, index, items) => {
          if (index === 0) {
            return false;
          }
          const previous = items[index - 1]!;
          return (
            item.dimensionId < previous.dimensionId ||
            (item.dimensionId === previous.dimensionId &&
              item.id <= previous.id)
          );
        }) ||
        page.data.items.some(
          (item) =>
            item.dimension !== query.data.dimension ||
            (query.data.lifecycle !== 'all' &&
              item.lifecycle !== query.data.lifecycle),
        )
      ) {
        logReadOutcome(
          request,
          'list_taxonomy',
          'corrupt_response',
          startedAt,
          corruptResponseError,
        );
        return sendError(
          request,
          reply,
          500,
          'INTERNAL_ERROR',
          'Unexpected error',
        );
      }
      logReadOutcome(request, 'list_taxonomy', 'success', startedAt);
      return page.data;
    } catch (error) {
      return sendReadFailure(
        request,
        reply,
        error,
        dependencies,
        'list_taxonomy',
        startedAt,
      );
    }
  });
}

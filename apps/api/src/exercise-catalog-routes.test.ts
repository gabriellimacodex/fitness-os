import type { ExerciseKnowledgeReader } from '@fitness-os/domain';
import {
  apiErrorResponseSchema,
  exerciseDetailSchema,
  exerciseListPageSchema,
  exerciseRevisionSchema,
  taxonomyDiscoveryPageSchema,
  type ExerciseDetail,
  type ExerciseRevision,
  type TaxonomyDiscoveryPage,
} from '@fitness-os/schemas';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from './app.js';
import { registerExerciseCatalogRoutes } from './exercise-catalog-routes.js';

const exerciseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const archivedDetail = exerciseDetailSchema.parse({
  id: exerciseId,
  canonicalKey: 'fixture-squat',
  currentName: 'Fixture Squat',
  lifecycle: 'archived',
  taxonomy: {
    modality: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      dimensionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      dimension: 'modality',
      key: 'fixture-modality',
      label: 'Fixture modality',
      meaning: 'Synthetic modality used by tests.',
      lifecycle: 'active',
      replacedByTermId: null,
    },
    equipment: [],
  },
  currentRevision: {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    exerciseId,
    revision: 1,
    displayName: 'Fixture Squat',
    aliases: ['Fixture Back Squat'],
    description: 'A neutral synthetic catalog fixture.',
    taxonomy: {
      modality: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        dimensionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        dimension: 'modality',
        key: 'fixture-modality',
        label: 'Fixture modality',
        meaning: 'Synthetic modality used by tests.',
        lifecycle: 'active',
        replacedByTermId: null,
      },
      equipment: [],
    },
    provenance: {
      originKind: 'internally_curated',
      recordedAt: '2026-01-01T00:00:00.000Z',
      changeReason: 'Initial fixture publication',
      primaryProvenanceReferenceId: null,
    },
    references: [],
    contentHash: '0'.repeat(64),
    publishedAt: '2026-01-01T00:00:00.000Z',
  },
});

const createReader = (): ExerciseKnowledgeReader => ({
  listExercises: vi.fn(async () => ({ items: [], nextCursor: null })),
  getCurrentExercise: vi.fn(async (): Promise<ExerciseDetail | null> => null),
  getExerciseRevision: vi.fn(
    async (): Promise<ExerciseRevision | null> => null,
  ),
  listTaxonomy: vi.fn(async (): Promise<TaxonomyDiscoveryPage> => ({
    items: [],
    nextCursor: null,
  })),
});

const createLogger = () => {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const logger: FastifyBaseLogger = {
    level: 'info',
    child: () => logger,
    debug: vi.fn(),
    error,
    fatal: vi.fn(),
    info,
    silent: vi.fn(),
    trace: vi.fn(),
    warn,
  };
  return { logger, info, warn, error };
};

const compileOnlyMissingInvalidRequest = (
  app: ReturnType<typeof buildApp>,
  reader: ExerciseKnowledgeReader,
): void => {
  // @ts-expect-error isInvalidRequest is a required integration boundary
  registerExerciseCatalogRoutes(app, {
    reader,
    isStorageUnavailable: () => false,
  });
};
void compileOnlyMissingInvalidRequest;

describe('exercise catalog read routes', () => {
  const apps: ReturnType<typeof buildApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('returns an empty exercise page and applies the frozen query defaults', async () => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({ method: 'GET', url: '/exercises' });

    expect(response.statusCode).toBe(200);
    expect(exerciseListPageSchema.parse(response.json())).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(reader.listExercises).toHaveBeenCalledWith({ limit: 25 });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('records a bounded structured success outcome', async () => {
    const reader = createReader();
    const { logger, info } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({ method: 'GET', url: '/exercises' });

    expect(info).toHaveBeenCalledWith(
      {
        operation: 'list_exercises',
        outcome: 'success',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
      },
      'Exercise catalog read completed',
    );
    const fields = info.mock.calls.find(
      ([, message]) => message === 'Exercise catalog read completed',
    )?.[0] as { durationMs: number } | undefined;
    expect(fields?.durationMs).toBeGreaterThanOrEqual(0);
    expect(fields?.durationMs).toBeLessThanOrEqual(86_400_000);
  });

  it('returns an archived exercise when directly addressed', async () => {
    const reader = createReader();
    vi.mocked(reader.getCurrentExercise).mockResolvedValue(archivedDetail);
    const { logger, info } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(exerciseDetailSchema.parse(response.json())).toEqual(archivedDetail);
    expect(reader.getCurrentExercise).toHaveBeenCalledWith(archivedDetail.id);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get_current_exercise',
        outcome: 'success',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
      }),
      'Exercise catalog read completed',
    );
  });

  it('fails closed when current detail belongs to another exercise', async () => {
    const otherExerciseId = '11111111-1111-4111-8111-111111111111';
    const reader = createReader();
    vi.mocked(reader.getCurrentExercise).mockResolvedValue(
      exerciseDetailSchema.parse({
        ...archivedDetail,
        id: otherExerciseId,
        currentRevision: {
          ...archivedDetail.currentRevision,
          exerciseId: otherExerciseId,
        },
      }),
    );
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}`,
    });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get_current_exercise',
        outcome: 'corrupt_response',
        requestId: response.headers['x-request-id'],
      }),
      'Exercise catalog read completed',
    );
  });

  it('returns an immutable historical revision', async () => {
    const reader = createReader();
    vi.mocked(reader.getExerciseRevision).mockResolvedValue(
      archivedDetail.currentRevision,
    );
    const { logger, info } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}/revisions/1`,
    });

    expect(response.statusCode).toBe(200);
    expect(exerciseRevisionSchema.parse(response.json())).toEqual(
      archivedDetail.currentRevision,
    );
    expect(reader.getExerciseRevision).toHaveBeenCalledWith(
      archivedDetail.id,
      1,
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get_exercise_revision',
        outcome: 'success',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
      }),
      'Exercise catalog read completed',
    );
  });

  it('fails closed when a historical revision belongs to another exercise', async () => {
    const reader = createReader();
    vi.mocked(reader.getExerciseRevision).mockResolvedValue(
      exerciseRevisionSchema.parse({
        ...archivedDetail.currentRevision,
        exerciseId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}/revisions/1`,
    });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get_exercise_revision',
        outcome: 'corrupt_response',
        requestId: response.headers['x-request-id'],
      }),
      'Exercise catalog read completed',
    );
  });

  it('fails closed when a historical response has another revision number', async () => {
    const reader = createReader();
    vi.mocked(reader.getExerciseRevision).mockResolvedValue(
      exerciseRevisionSchema.parse({
        ...archivedDetail.currentRevision,
        revision: 2,
      }),
    );
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}/revisions/1`,
    });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get_exercise_revision',
        outcome: 'corrupt_response',
        requestId: response.headers['x-request-id'],
      }),
      'Exercise catalog read completed',
    );
  });

  it('returns an empty known taxonomy dimension with frozen defaults', async () => {
    const reader = createReader();
    const { logger, info } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercise-taxonomy?dimension=equipment',
    });

    expect(response.statusCode).toBe(200);
    expect(taxonomyDiscoveryPageSchema.parse(response.json())).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(reader.listTaxonomy).toHaveBeenCalledWith({
      dimension: 'equipment',
      lifecycle: 'active',
      limit: 50,
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'list_taxonomy',
        outcome: 'success',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
      }),
      'Exercise catalog read completed',
    );
  });

  it('passes bounded exercise filters and taxonomy discovery options to the reader', async () => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });
    const termOne = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const termTwo = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    const exerciseResponse = await app.inject({
      method: 'GET',
      url: `/exercises?cursor=fixture_cursor&limit=10&taxonomyTermIds=${termOne}&taxonomyTermIds=${termTwo}`,
    });
    const taxonomyResponse = await app.inject({
      method: 'GET',
      url: '/exercise-taxonomy?dimension=modality&lifecycle=archived&cursor=fixture_cursor&limit=12',
    });

    expect(exerciseResponse.statusCode).toBe(200);
    expect(reader.listExercises).toHaveBeenCalledWith({
      cursor: 'fixture_cursor',
      limit: 10,
      taxonomyTermIds: [termOne, termTwo],
    });
    expect(taxonomyResponse.statusCode).toBe(200);
    expect(reader.listTaxonomy).toHaveBeenCalledWith({
      dimension: 'modality',
      lifecycle: 'archived',
      cursor: 'fixture_cursor',
      limit: 12,
    });
  });

  it.each([
    '/exercises?limit=0',
    '/exercises?cursor=%25%25',
    '/exercises?unknown=true',
    `/exercises?taxonomyTermIds=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee&taxonomyTermIds=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`,
    '/exercises/not-a-uuid',
    `/exercises/${exerciseId}?unknown=true`,
    `/exercises/${exerciseId}/revisions/0`,
    `/exercises/${exerciseId}/revisions/1?unknown=true`,
    '/exercise-taxonomy',
    '/exercise-taxonomy?dimension=unknown',
    '/exercise-taxonomy?dimension=equipment&limit=101',
  ])('returns the correlated bad-request envelope for %s', async (url) => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({ method: 'GET', url });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'Invalid request',
      requestId: response.headers['x-request-id'],
    });
    expect(reader.listExercises).not.toHaveBeenCalled();
    expect(reader.getCurrentExercise).not.toHaveBeenCalled();
    expect(reader.getExerciseRevision).not.toHaveBeenCalled();
    expect(reader.listTaxonomy).not.toHaveBeenCalled();
  });

  it('records rejected route input without logging validation details', async () => {
    const reader = createReader();
    const { logger, warn } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercises?limit=private-invalid-value',
    });

    expect(response.statusCode).toBe(400);
    expect(warn).toHaveBeenCalledWith(
      {
        operation: 'list_exercises',
        outcome: 'invalid_request',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
        errorClass: 'RequestValidationError',
      },
      'Exercise catalog read completed',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      'private-invalid-value',
    );
  });

  it('returns not found for unknown current and historical records', async () => {
    const reader = createReader();
    const { logger, info } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}`,
    });
    const revisionResponse = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}/revisions/99`,
    });

    for (const response of [detailResponse, revisionResponse]) {
      const body = apiErrorResponseSchema.parse(response.json());
      expect(response.statusCode).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.requestId).toBe(response.headers['x-request-id']);
    }
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get_current_exercise',
        outcome: 'not_found',
        requestId: detailResponse.headers['x-request-id'],
        durationMs: expect.any(Number),
      }),
      'Exercise catalog read completed',
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get_exercise_revision',
        outcome: 'not_found',
        requestId: revisionResponse.headers['x-request-id'],
        durationMs: expect.any(Number),
      }),
      'Exercise catalog read completed',
    );
  });

  it('maps classified storage failures to a content-safe unavailable response', async () => {
    const storageError = new Error(
      'postgres SQL failed for https://private.example/reference',
    );
    const reader = createReader();
    vi.mocked(reader.listExercises).mockRejectedValue(storageError);
    const classifier = vi.fn((error: unknown) => error === storageError);
    const { logger, warn, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: classifier,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({ method: 'GET', url: '/exercises' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(503);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('postgres');
    expect(response.body).not.toContain('private.example');
    expect(classifier).toHaveBeenCalledWith(storageError);
    expect(warn).toHaveBeenCalledWith(
      {
        operation: 'list_exercises',
        outcome: 'storage_unavailable',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
        errorClass: 'Error',
      },
      'Exercise catalog read completed',
    );
    expect(JSON.stringify([warn.mock.calls, error.mock.calls])).not.toContain(
      'private.example',
    );
    expect(JSON.stringify([warn.mock.calls, error.mock.calls])).not.toContain(
      'postgres SQL',
    );
  });

  it('maps a reader-detected mismatched cursor to the safe bad-request response', async () => {
    const cursorError = new Error('cursor belongs to exercise-taxonomy');
    const reader = createReader();
    vi.mocked(reader.listExercises).mockRejectedValue(cursorError);
    const { logger, warn } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: (error: unknown) => error === cursorError,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercises?cursor=structurally_valid',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(body.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'Invalid request',
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toContain('exercise-taxonomy');
    expect(warn).toHaveBeenCalledWith(
      {
        operation: 'list_exercises',
        outcome: 'invalid_request',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
        errorClass: 'Error',
      },
      'Exercise catalog read completed',
    );
  });

  it('fails closed when the reader returns a corrupt success payload', async () => {
    const reader = createReader();
    vi.mocked(reader.listExercises).mockResolvedValue({
      items: [{ locator: 'https://private.example/reference' }],
      nextCursor: null,
    } as never);
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({ method: 'GET', url: '/exercises' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('private.example');
    expect(error).toHaveBeenCalledWith(
      {
        operation: 'list_exercises',
        outcome: 'corrupt_response',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
        errorClass: 'CatalogResponseValidationError',
      },
      'Exercise catalog read completed',
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('private.example');
  });

  it('fails closed when the exercise list contains an archived summary', async () => {
    const reader = createReader();
    vi.mocked(reader.listExercises).mockResolvedValue({
      items: [
        {
          id: archivedDetail.id,
          canonicalKey: archivedDetail.canonicalKey,
          currentRevision: archivedDetail.currentRevision.revision,
          currentName: archivedDetail.currentName,
          lifecycle: archivedDetail.lifecycle,
          taxonomy: archivedDetail.taxonomy,
        },
      ],
      nextCursor: null,
    });
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({ method: 'GET', url: '/exercises' });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
  });

  it('fails closed when the exercise page exceeds the requested limit', async () => {
    const reader = createReader();
    const activeSummary = {
      id: archivedDetail.id,
      canonicalKey: archivedDetail.canonicalKey,
      currentRevision: archivedDetail.currentRevision.revision,
      currentName: archivedDetail.currentName,
      lifecycle: 'active' as const,
      taxonomy: archivedDetail.taxonomy,
    };
    vi.mocked(reader.listExercises).mockResolvedValue(
      exerciseListPageSchema.parse({
        items: [activeSummary, activeSummary],
        nextCursor: null,
      }),
    );
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercises?limit=1',
    });

    expect(response.statusCode).toBe(500);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'list_exercises',
        outcome: 'corrupt_response',
      }),
      'Exercise catalog read completed',
    );
  });

  it('fails closed when a summary misses one or all requested taxonomy filters', async () => {
    const reader = createReader();
    vi.mocked(reader.listExercises).mockResolvedValue(
      exerciseListPageSchema.parse({
        items: [
          {
            id: archivedDetail.id,
            canonicalKey: archivedDetail.canonicalKey,
            currentRevision: archivedDetail.currentRevision.revision,
            currentName: archivedDetail.currentName,
            lifecycle: 'active',
            taxonomy: archivedDetail.taxonomy,
          },
        ],
        nextCursor: null,
      }),
    );
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });
    const presentTermId = archivedDetail.taxonomy.modality.id;
    const missingTermId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const anotherMissingTermId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    const missingOneResponse = await app.inject({
      method: 'GET',
      url: `/exercises?taxonomyTermIds=${presentTermId}&taxonomyTermIds=${missingTermId}`,
    });
    const missingAllResponse = await app.inject({
      method: 'GET',
      url: `/exercises?taxonomyTermIds=${missingTermId}&taxonomyTermIds=${anotherMissingTermId}`,
    });

    expect(missingOneResponse.statusCode).toBe(500);
    expect(missingAllResponse.statusCode).toBe(500);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'list_exercises',
        outcome: 'corrupt_response',
      }),
      'Exercise catalog read completed',
    );
  });

  it('fails closed when taxonomy results use a different dimension', async () => {
    const reader = createReader();
    vi.mocked(reader.listTaxonomy).mockResolvedValue({
      items: [archivedDetail.taxonomy.modality],
      nextCursor: null,
    });
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercise-taxonomy?dimension=equipment',
    });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
  });

  it('fails closed when the taxonomy page exceeds the requested limit', async () => {
    const reader = createReader();
    vi.mocked(reader.listTaxonomy).mockResolvedValue(
      taxonomyDiscoveryPageSchema.parse({
        items: [
          archivedDetail.taxonomy.modality,
          archivedDetail.taxonomy.modality,
        ],
        nextCursor: null,
      }),
    );
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercise-taxonomy?dimension=modality&limit=1',
    });

    expect(response.statusCode).toBe(500);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'list_taxonomy',
        outcome: 'corrupt_response',
      }),
      'Exercise catalog read completed',
    );
  });

  it('fails closed when taxonomy results violate the requested lifecycle', async () => {
    const reader = createReader();
    vi.mocked(reader.listTaxonomy).mockResolvedValue({
      items: [
        {
          id: archivedDetail.taxonomy.modality.id,
          dimensionId: archivedDetail.taxonomy.modality.dimensionId,
          dimension: archivedDetail.taxonomy.modality.dimension,
          key: archivedDetail.taxonomy.modality.key,
          label: archivedDetail.taxonomy.modality.label,
          meaning: archivedDetail.taxonomy.modality.meaning,
          lifecycle: 'archived',
          replacedByTermId: null,
        },
      ],
      nextCursor: null,
    });
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercise-taxonomy?dimension=modality&lifecycle=active',
    });

    expect(response.statusCode).toBe(500);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
  });

  it('contains unexpected reader exceptions behind the internal error envelope', async () => {
    const reader = createReader();
    vi.mocked(reader.listTaxonomy).mockRejectedValue(
      new Error('private SQL and locator detail'),
    );
    const { logger, error } = createLogger();
    const app = buildApp({ loggerInstance: logger });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/exercise-taxonomy?dimension=equipment',
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('private SQL');
    expect(error).toHaveBeenCalledWith(
      {
        operation: 'list_taxonomy',
        outcome: 'unexpected_error',
        requestId: response.headers['x-request-id'],
        durationMs: expect.any(Number),
        errorClass: 'Error',
      },
      'Exercise catalog read completed',
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('private SQL');
  });

  it('exposes no catalog mutation alias', async () => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
      isInvalidRequest: () => false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/exercises',
      payload: { displayName: 'Forbidden mutation' },
    });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(reader.listExercises).not.toHaveBeenCalled();
  });
});

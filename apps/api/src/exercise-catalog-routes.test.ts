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

  it('returns an archived exercise when directly addressed', async () => {
    const reader = createReader();
    vi.mocked(reader.getCurrentExercise).mockResolvedValue(archivedDetail);
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/exercises/${exerciseId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(exerciseDetailSchema.parse(response.json())).toEqual(archivedDetail);
    expect(reader.getCurrentExercise).toHaveBeenCalledWith(archivedDetail.id);
  });

  it('returns an immutable historical revision', async () => {
    const reader = createReader();
    vi.mocked(reader.getExerciseRevision).mockResolvedValue(
      archivedDetail.currentRevision,
    );
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
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
  });

  it('returns an empty known taxonomy dimension with frozen defaults', async () => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
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
  });

  it('passes bounded exercise filters and taxonomy discovery options to the reader', async () => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
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

  it('returns not found for unknown current and historical records', async () => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
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
  });

  it('maps classified storage failures to a content-safe unavailable response', async () => {
    const storageError = new Error(
      'postgres SQL failed for https://private.example/reference',
    );
    const reader = createReader();
    vi.mocked(reader.listExercises).mockRejectedValue(storageError);
    const classifier = vi.fn((error: unknown) => error === storageError);
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: classifier,
    });

    const response = await app.inject({ method: 'GET', url: '/exercises' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(503);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('postgres');
    expect(response.body).not.toContain('private.example');
    expect(classifier).toHaveBeenCalledWith(storageError);
  });

  it('maps a reader-detected mismatched cursor to the safe bad-request response', async () => {
    const cursorError = new Error('cursor belongs to exercise-taxonomy');
    const reader = createReader();
    vi.mocked(reader.listExercises).mockRejectedValue(cursorError);
    const app = buildApp({ logger: false });
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
  });

  it('fails closed when the reader returns a corrupt success payload', async () => {
    const reader = createReader();
    vi.mocked(reader.listExercises).mockResolvedValue({
      items: [{ locator: 'https://private.example/reference' }],
      nextCursor: null,
    } as never);
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
    });

    const response = await app.inject({ method: 'GET', url: '/exercises' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('private.example');
  });

  it('contains unexpected reader exceptions behind the internal error envelope', async () => {
    const reader = createReader();
    vi.mocked(reader.listTaxonomy).mockRejectedValue(
      new Error('private SQL and locator detail'),
    );
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
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
  });

  it('exposes no catalog mutation alias', async () => {
    const reader = createReader();
    const app = buildApp({ logger: false });
    apps.push(app);
    registerExerciseCatalogRoutes(app, {
      reader,
      isStorageUnavailable: () => false,
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

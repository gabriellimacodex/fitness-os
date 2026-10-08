import { describe, expect, it } from 'vitest';

import {
  createExerciseLifecycleOperationKey,
  createManifestIngestOperationKey,
  createPublishOperationKey,
  createTaxonomyCreateOperationKey,
  createTaxonomyLifecycleOperationKey,
  createTaxonomyReplaceOperationKey,
} from '../src/exercise-catalog/index.js';

const validOperationId = '30000000-0000-4000-8000-000000000001';

describe('catalog operation-key factories', () => {
  it.each([
    ['exercise.publish', createPublishOperationKey],
    ['exercise.lifecycle', createExerciseLifecycleOperationKey],
    ['taxonomy.create', createTaxonomyCreateOperationKey],
    ['taxonomy.lifecycle', createTaxonomyLifecycleOperationKey],
    ['taxonomy.replace', createTaxonomyReplaceOperationKey],
    ['manifest.ingest', createManifestIngestOperationKey],
  ] as const)(
    'derives a namespaced, lowercased key for %s',
    (namespace, factory) => {
      const key = factory(validOperationId);

      expect(String(key)).toBe(`${namespace}:${validOperationId}`);
    },
  );

  it('lowercases a mixed-case UUID operation ID', () => {
    const key = createPublishOperationKey(
      '30000000-0000-4000-8000-000000000001'.toUpperCase(),
    );

    expect(String(key)).toBe(
      'exercise.publish:30000000-0000-4000-8000-000000000001',
    );
  });

  it.each([
    ['exercise.publish', createPublishOperationKey],
    ['exercise.lifecycle', createExerciseLifecycleOperationKey],
    ['taxonomy.create', createTaxonomyCreateOperationKey],
    ['taxonomy.lifecycle', createTaxonomyLifecycleOperationKey],
    ['taxonomy.replace', createTaxonomyReplaceOperationKey],
    ['manifest.ingest', createManifestIngestOperationKey],
  ] as const)(
    'rejects a non-UUIDv4 operation ID for %s',
    (_namespace, factory) => {
      expect(() => factory('not-a-uuid')).toThrow(
        'Catalog operation ID must be a UUIDv4',
      );
    },
  );

  it('rejects an empty operation ID', () => {
    expect(() => createPublishOperationKey('')).toThrow(
      'Catalog operation ID must be a UUIDv4',
    );
  });
});

import { readFile } from 'node:fs/promises';

import { catalogManifestSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { hashManifestIngestionOperation } from '../src/exercise-catalog/index.js';

const manifestUrl = new URL(
  '../../../catalog/catalog-manifest.v1.json',
  import.meta.url,
);

describe('production catalog manifest', () => {
  it('is non-empty, schema-valid, neutral, and deterministically digestible', async () => {
    const source = await readFile(manifestUrl, 'utf8');
    const manifest = catalogManifestSchema.parse(JSON.parse(source));

    expect(manifest.taxonomy.modality.length).toBeGreaterThan(0);
    expect(manifest.taxonomy.equipment.length).toBeGreaterThan(0);
    expect(manifest.exercises.length).toBeGreaterThan(0);
    expect(source.toLowerCase()).not.toMatch(/synthetic|fixture/);
    expect(hashManifestIngestionOperation(manifest)).toMatch(/^[a-f0-9]{64}$/);
  });
});

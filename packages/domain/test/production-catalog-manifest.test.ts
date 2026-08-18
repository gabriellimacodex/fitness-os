import { readFile } from 'node:fs/promises';

import { catalogManifestSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  CATALOG_CANONICALIZATION_VERSION,
  hashManifestIngestionOperation,
} from '../src/exercise-catalog/index.js';

const manifestUrl = new URL(
  '../../../catalog/catalog-manifest.v1.json',
  import.meta.url,
);
const reviewUrl = new URL(
  '../../../catalog/catalog-manifest.v1.review.json',
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

  it('is bound to the exact independently approved source commit and digest', async () => {
    const manifest = catalogManifestSchema.parse(
      JSON.parse(await readFile(manifestUrl, 'utf8')),
    );
    const review = JSON.parse(await readFile(reviewUrl, 'utf8')) as unknown;

    expect(review).toEqual({
      recordVersion: 'catalog-manifest-review.v1',
      disposition: 'PASS',
      reviewerRole: 'independent-agent-90',
      manifestPath: 'catalog/catalog-manifest.v1.json',
      schemaVersion: manifest.schemaVersion,
      canonicalizationVersion: CATALOG_CANONICALIZATION_VERSION,
      sourceCommit: '789f4072a0e4eefc0d9ac6c9f2b8cbb4e212e9f7',
      canonicalDigest: hashManifestIngestionOperation(manifest),
      counts: {
        modalityTerms: 1,
        equipmentTerms: 1,
        exercises: 1,
        references: 0,
      },
      findings: { blocker: 0, high: 0, medium: 0, low: 0 },
    });
  });
});

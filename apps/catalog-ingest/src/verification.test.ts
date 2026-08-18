import { describe, expect, it, vi } from 'vitest';

import {
  CatalogArtifactVerificationError,
  verifyCatalogArtifact,
  type CatalogGitInspection,
} from './verification.js';

const sourceCommit = '199671a797b49325e2cf165bc1ce84d7ef3a212b';
const candidateCommit = 'e78f95194b88f13629a20ca34d59e138521ec6a2';
const digest =
  'eb2c64954a47b83bc46a2a191f218c12dcf5069486728bc225e760aed4f988da';

const manifest = JSON.stringify({
  schemaVersion: 'catalog-manifest.v1',
  manifestId: 'fitness-os-pilot-catalog',
  taxonomy: {
    modality: [
      {
        key: 'strength',
        label: 'Strength',
        meaning: 'A broad catalog category for strength exercises.',
      },
    ],
    equipment: [
      {
        key: 'bodyweight',
        label: 'Bodyweight',
        meaning:
          'A catalog category for exercises performed without external equipment.',
      },
    ],
  },
  exercises: [
    {
      canonicalKey: 'bodyweight-squat',
      displayName: 'Bodyweight Squat',
      aliases: ['Air Squat'],
      description: 'A catalog entry for the bodyweight squat exercise.',
      modalityKey: 'strength',
      equipmentKeys: ['bodyweight'],
      provenance: {
        originKind: 'internally_curated',
        changeReason: 'Initial Fitness OS pilot catalog publication.',
        primaryProvenanceReferenceKey: null,
      },
      references: [],
    },
  ],
});

const review = JSON.stringify({
  recordVersion: 'catalog-manifest-review.v1',
  disposition: 'PASS',
  reviewerRole: 'independent-agent-90',
  manifestPath: 'catalog/catalog-manifest.v1.json',
  schemaVersion: 'catalog-manifest.v1',
  canonicalizationVersion: 'exercise-catalog.v1',
  sourceCommit,
  canonicalDigest: digest,
  counts: {
    modalityTerms: 1,
    equipmentTerms: 1,
    exercises: 1,
    references: 0,
  },
  findings: { blocker: 0, high: 0, medium: 0, low: 0 },
});

function createGitInspection(
  overrides: Partial<CatalogGitInspection> = {},
): CatalogGitInspection {
  return {
    isClean: vi.fn(async () => true),
    isAncestor: vi.fn(async () => true),
    readTextAtCommit: vi.fn(async () => manifest),
    resolveHead: vi.fn(async () => candidateCommit),
    ...overrides,
  };
}

describe('verifyCatalogArtifact', () => {
  it('binds the packaged manifest to the exact clean reviewed ancestry', async () => {
    const git = createGitInspection();

    const result = await verifyCatalogArtifact(
      {
        candidateCommit,
        manifestPath: 'catalog/catalog-manifest.v1.json',
        manifestSource: manifest,
        reviewSource: review,
      },
      git,
    );

    expect(result.digest).toBe(digest);
    expect(result.review.sourceCommit).toBe(sourceCommit);
    expect(result.counts).toEqual({
      modalityTerms: 1,
      equipmentTerms: 1,
      exercises: 1,
      references: 0,
    });
    expect(git.readTextAtCommit).toHaveBeenCalledWith(
      sourceCommit,
      'catalog/catalog-manifest.v1.json',
    );
  });

  it.each([
    {
      name: 'a dirty or untracked checkout',
      git: createGitInspection({ isClean: vi.fn(async () => false) }),
    },
    {
      name: 'a candidate SHA different from HEAD',
      git: createGitInspection({
        resolveHead: vi.fn(async () => 'a'.repeat(40)),
      }),
    },
    {
      name: 'a reviewed source outside candidate ancestry',
      git: createGitInspection({ isAncestor: vi.fn(async () => false) }),
    },
    {
      name: 'content absent from the reviewed source commit',
      git: createGitInspection({
        readTextAtCommit: vi.fn(async () => '{"substituted":true}'),
      }),
    },
  ])('rejects $name', async ({ git }) => {
    await expect(
      verifyCatalogArtifact(
        {
          candidateCommit,
          manifestPath: 'catalog/catalog-manifest.v1.json',
          manifestSource: manifest,
          reviewSource: review,
        },
        git,
      ),
    ).rejects.toBeInstanceOf(CatalogArtifactVerificationError);
  });

  it('rejects substituted packaged content and unknown review fields', async () => {
    const parsedReview = JSON.parse(review) as Record<string, unknown>;
    parsedReview.unreviewed = true;

    await expect(
      verifyCatalogArtifact(
        {
          candidateCommit,
          manifestPath: 'catalog/catalog-manifest.v1.json',
          manifestSource: manifest.replace('Bodyweight Squat', 'Changed Squat'),
          reviewSource: JSON.stringify(parsedReview),
        },
        createGitInspection(),
      ),
    ).rejects.toBeInstanceOf(CatalogArtifactVerificationError);
  });
});

import { describe, expect, it } from 'vitest';

import {
  createCatalogPlatformFromEnv,
  createSyntheticCatalogLedgerRing,
  readCatalogLedgerRing,
} from './catalog-platform.js';

describe('catalog platform env composition', () => {
  it('returns null when catalog database composition is not configured', () => {
    expect(createCatalogPlatformFromEnv({})).toBeNull();
    expect(
      createCatalogPlatformFromEnv({ CATALOG_DATABASE_URL: 'postgresql://x' }),
    ).toBeNull();
    expect(readCatalogLedgerRing({})).toBeNull();
  });

  it('creates a synthetic ledger ring for disposable tests only', () => {
    const ring = createSyntheticCatalogLedgerRing();
    expect(ring.keys).toHaveLength(1);
    expect(ring.keys[0]?.status).toBe('active');
    expect(ring.keys[0]?.secret).toHaveLength(32);
  });
});

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { requiredPrivacyCoreMigrationHashes } from '../src/privacy/readiness.js';

const drizzleRoot = join(dirname(fileURLToPath(import.meta.url)), '../drizzle');

describe('privacy core migration readiness', () => {
  it('requires the additive PRD 21 privacy core migration files', () => {
    expect(existsSync(join(drizzleRoot, '0002_prd21_privacy_core.sql'))).toBe(
      true,
    );
    expect(
      existsSync(
        join(drizzleRoot, '0003_prd21_privacy_policy_purpose_processor.sql'),
      ),
    ).toBe(true);

    const hashes = requiredPrivacyCoreMigrationHashes();
    expect(hashes).toHaveLength(4);
    expect(new Set(hashes).size).toBe(4);
    for (const hash of hashes) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

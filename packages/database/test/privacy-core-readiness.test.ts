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
    expect(
      existsSync(join(drizzleRoot, '0004_prd21_privacy_subject_request.sql')),
    ).toBe(true);
    expect(
      existsSync(
        join(drizzleRoot, '0005_prd21_privacy_subject_request_transition.sql'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(drizzleRoot, '0006_prd21_privacy_append_only_guards.sql'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(drizzleRoot, '0011_prd21_privacy_ordinary_schema_usage.sql'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(drizzleRoot, '0012_prd21_privacy_subject_request_scope.sql'),
      ),
    ).toBe(true);

    const hashes = requiredPrivacyCoreMigrationHashes();
    expect(hashes).toHaveLength(9);
    expect(new Set(hashes).size).toBe(9);
    for (const hash of hashes) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { requiredOnboardingMigrationHashes } from '../src/onboarding/readiness.js';

const drizzleRoot = join(dirname(fileURLToPath(import.meta.url)), '../drizzle');

describe('onboarding schema readiness', () => {
  it('requires the additive PRD 07 onboarding migration files', () => {
    expect(existsSync(join(drizzleRoot, '0000_flippant_rick_jones.sql'))).toBe(
      true,
    );
    expect(
      existsSync(join(drizzleRoot, '0007_prd07_onboarding_invitation.sql')),
    ).toBe(true);
    expect(
      existsSync(join(drizzleRoot, '0008_prd07_onboarding_attempt.sql')),
    ).toBe(true);
    expect(
      existsSync(join(drizzleRoot, '0009_prd07_onboarding_operation.sql')),
    ).toBe(true);
    expect(
      existsSync(join(drizzleRoot, '0010_prd07_onboarding_role_mapping.sql')),
    ).toBe(true);

    const hashes = requiredOnboardingMigrationHashes();
    expect(hashes).toHaveLength(5);
    expect(new Set(hashes).size).toBe(5);
    for (const hash of hashes) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

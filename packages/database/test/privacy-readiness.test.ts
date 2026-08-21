import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { requiredPrivacyCoreMigrationHashes } from '../src/privacy/readiness.js';

describe('privacy readiness migration coverage', () => {
  it('requires the ordinary-role schema usage correction', () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../drizzle/0011_prd21_privacy_ordinary_schema_usage.sql',
      ),
    );
    const expectedHash = createHash('sha256').update(migration).digest('hex');

    expect(requiredPrivacyCoreMigrationHashes()).toContain(expectedHash);
  });
});

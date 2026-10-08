import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  requiredPrivacyCoreMigrationHashes,
  requiredPrivacyRecoveryTriggerNames,
} from '../src/privacy/readiness.js';

const drizzleRoot = join(dirname(fileURLToPath(import.meta.url)), '../drizzle');

describe('privacy readiness migration coverage', () => {
  it('requires the ordinary-role schema usage correction', () => {
    const migration = readFileSync(
      join(drizzleRoot, '0011_prd21_privacy_ordinary_schema_usage.sql'),
    );
    const expectedHash = createHash('sha256').update(migration).digest('hex');

    expect(requiredPrivacyCoreMigrationHashes()).toContain(expectedHash);
  });

  it('requires the subject-request scope binding migration', () => {
    const migration = readFileSync(
      join(drizzleRoot, '0012_prd21_privacy_subject_request_scope.sql'),
    );
    const expectedHash = createHash('sha256').update(migration).digest('hex');

    expect(requiredPrivacyCoreMigrationHashes()).toContain(expectedHash);
  });

  it('requires every append-only guard trigger any migration installs via privacy_reject_append_only_mutation', () => {
    const triggerNamePattern =
      /CREATE TRIGGER\s+(\S+)[\s\S]*?EXECUTE FUNCTION privacy_reject_append_only_mutation\(\)/g;
    const foundTriggerNames = new Set<string>();

    for (const file of readdirSync(drizzleRoot)) {
      if (!file.endsWith('.sql')) {
        continue;
      }
      const contents = readFileSync(join(drizzleRoot, file), 'utf8');
      for (const match of contents.matchAll(triggerNamePattern)) {
        foundTriggerNames.add(match[1]!.replace(/^"|"$/g, ''));
      }
    }

    // Guards against the exact gap this test was added to close: a new
    // migration can install an append-only guard trigger while
    // RECOVERY_REQUIRED_TRIGGERS silently keeps checking only the older
    // ones, leaving the new ledger's live trigger state unverified.
    expect(foundTriggerNames.size).toBeGreaterThan(0);
    for (const name of foundTriggerNames) {
      expect(requiredPrivacyRecoveryTriggerNames()).toContain(name);
    }
  });
});

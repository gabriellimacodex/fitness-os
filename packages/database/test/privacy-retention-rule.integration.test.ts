import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { privacyRetentionRuleReferenceSchema } from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresPrivacyRetentionRuleRepository } from '../src/privacy/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

function ruleReference(overrides: {
  ruleId: string;
  ruleVersionId: string;
  engineeringCategoryId?: string;
  purposeVersionId?: string;
}) {
  return privacyRetentionRuleReferenceSchema.parse({
    ruleId: overrides.ruleId,
    ruleVersionId: overrides.ruleVersionId,
    engineeringCategoryId:
      overrides.engineeringCategoryId ?? '44444444-4444-4444-8444-444444444444',
    purposeVersionId:
      overrides.purposeVersionId ?? '33333333-3333-4333-8333-333333333333',
    policyVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    action: 'delete',
    parametersDigest: 'e'.repeat(64),
    canonicalizationVersion: 'privacy-governance.canonical.v1',
    synthetic: true,
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 21 disposable retention-rule persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let rules: ReturnType<typeof createPostgresPrivacyRetentionRuleRepository>;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      rules = createPostgresPrivacyRetentionRuleRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE privacy_retention_rule`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('accepts a rule version once and rejects an exact repeat as conflict', async () => {
      const rule = ruleReference({
        ruleId: '55555555-5555-4555-8555-555555555555',
        ruleVersionId: '66666666-6666-4666-8666-666666666666',
      });

      await expect(rules.put(rule)).resolves.toBe('accepted');
      await expect(rules.put(rule)).resolves.toBe('conflict');
      await expect(rules.getActiveVersion(rule.ruleVersionId)).resolves.toEqual(
        rule,
      );
    });

    it('returns null for an unknown ruleVersionId', async () => {
      await expect(
        rules.getActiveVersion('00000000-0000-4000-8000-000000000000'),
      ).resolves.toBeNull();
    });

    it('lists every accepted version for a category/purpose pair and excludes other categories', async () => {
      const ruleOne = ruleReference({
        ruleId: '77777777-7777-4777-8777-777777777777',
        ruleVersionId: '88888888-8888-4888-8888-888888888888',
      });
      const ruleTwo = ruleReference({
        ruleId: '77777777-7777-4777-8777-777777777777',
        ruleVersionId: '99999999-9999-4999-8999-999999999999',
      });
      const otherCategoryRule = ruleReference({
        ruleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        ruleVersionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        engineeringCategoryId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      });

      await rules.put(ruleOne);
      await rules.put(ruleTwo);
      await rules.put(otherCategoryRule);

      const active = await rules.listActiveForCategoryAndPurpose(
        ruleOne.engineeringCategoryId,
        ruleOne.purposeVersionId,
      );

      expect(active).toHaveLength(2);
      expect(active.map((rule) => rule.ruleVersionId).sort()).toEqual(
        [ruleOne.ruleVersionId, ruleTwo.ruleVersionId].sort(),
      );
    });

    it('returns an empty list for an unmatched category/purpose pair', async () => {
      const rule = ruleReference({
        ruleId: '11111111-1111-4111-8111-111111111111',
        ruleVersionId: '22222222-2222-4222-8222-222222222222',
      });
      await rules.put(rule);

      await expect(
        rules.listActiveForCategoryAndPurpose(
          'ffffffff-ffff-4fff-8fff-ffffffffffff',
          rule.purposeVersionId,
        ),
      ).resolves.toEqual([]);
    });
  },
);

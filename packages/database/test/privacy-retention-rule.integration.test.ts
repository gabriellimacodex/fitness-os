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

    it('is append-only and permits only SELECT/INSERT through the ordinary role', async () => {
      const rule = ruleReference({
        ruleId: '12121212-1212-4212-8212-121212121212',
        ruleVersionId: '34343434-3434-4434-8434-343434343434',
      });
      await expect(rules.put(rule)).resolves.toBe('accepted');

      const assertRejected = async (statement: ReturnType<typeof sql>) => {
        try {
          await connection.db.execute(statement);
          throw new Error('expected append-only rejection');
        } catch (error) {
          const text = [
            error instanceof Error ? error.message : String(error),
            JSON.stringify(error),
          ].join('\n');
          expect(text).toMatch(
            /42501|permission denied|privacy_reject_append_only_mutation|fitness_os_privacy_append_only/,
          );
        }
      };

      await assertRejected(sql`
        UPDATE privacy_retention_rule
        SET parameters_digest = ${'f'.repeat(64)}
        WHERE rule_version_id = ${rule.ruleVersionId}::uuid
      `);
      await assertRejected(sql`
        DELETE FROM privacy_retention_rule
        WHERE rule_version_id = ${rule.ruleVersionId}::uuid
      `);

      await connection.db.execute(
        sql`GRANT fitness_os_privacy_ordinary TO CURRENT_USER`,
      );

      const ordinaryRule = ruleReference({
        ruleId: '56565656-5656-4656-8656-565656565656',
        ruleVersionId: '78787878-7878-4878-8878-787878787878',
      });
      await connection.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE fitness_os_privacy_ordinary`);
        await tx.execute(sql`
          INSERT INTO privacy_retention_rule (
            rule_version_id,
            rule_id,
            engineering_category_id,
            purpose_version_id,
            policy_version_id,
            action,
            parameters_digest,
            canonicalization_version,
            synthetic
          ) VALUES (
            ${ordinaryRule.ruleVersionId}::uuid,
            ${ordinaryRule.ruleId}::uuid,
            ${ordinaryRule.engineeringCategoryId}::uuid,
            ${ordinaryRule.purposeVersionId}::uuid,
            ${ordinaryRule.policyVersionId}::uuid,
            ${ordinaryRule.action},
            ${ordinaryRule.parametersDigest},
            ${ordinaryRule.canonicalizationVersion},
            ${ordinaryRule.synthetic}
          )
        `);
        const selected = await tx.execute<{ rule_version_id: string }>(sql`
          SELECT rule_version_id
          FROM privacy_retention_rule
          WHERE rule_version_id = ${ordinaryRule.ruleVersionId}::uuid
        `);
        expect(selected[0]?.rule_version_id).toBe(ordinaryRule.ruleVersionId);
      });

      const assertOrdinaryRejected = async (
        statement: ReturnType<typeof sql>,
      ) => {
        try {
          await connection.db.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL ROLE fitness_os_privacy_ordinary`);
            await tx.execute(statement);
          });
          throw new Error('expected ordinary-role rejection');
        } catch (error) {
          const text = [
            error instanceof Error ? error.message : String(error),
            JSON.stringify(error),
          ].join('\n');
          expect(text).toMatch(/42501|permission denied/);
        }
      };

      await assertOrdinaryRejected(sql`
        UPDATE privacy_retention_rule
        SET parameters_digest = ${'a'.repeat(64)}
        WHERE rule_version_id = ${ordinaryRule.ruleVersionId}::uuid
      `);
      await assertOrdinaryRejected(sql`
        DELETE FROM privacy_retention_rule
        WHERE rule_version_id = ${ordinaryRule.ruleVersionId}::uuid
      `);
    });
  },
);

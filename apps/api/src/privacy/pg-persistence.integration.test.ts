import { fileURLToPath } from 'node:url';

import { createPostgresConnection } from '@fitness-os/database';
import {
  privacyActorContextReferenceSchema,
  privacyEngineeringCategoryIdSchema,
  privacyEvidenceReferenceSchema,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  privacySubjectScopeIdSchema,
} from '@fitness-os/schemas';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createPrivacyPgPersistence } from './pg-persistence.js';

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/database/drizzle', import.meta.url),
);

function requireDisposableDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  }
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname.slice(1) !== 'fitness_os_prd02_test'
  ) {
    throw new Error(
      'PostgreSQL tests require the local fitness_os_prd02_test database.',
    );
  }
  return value;
}

const policy = privacyPolicyPackageReferenceSchema.parse({
  packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  canonicalizationVersion: 'privacy-governance.canonical.v1',
  contentDigest: 'a'.repeat(64),
  synthetic: true,
});

const purpose = privacyPurposeVersionReferenceSchema.parse({
  purposeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  purposeVersionId: '33333333-3333-4333-8333-333333333333',
  policyVersionId: policy.versionId,
  allowedOperationKinds: ['data_use_evaluation'],
  allowedCategoryIds: ['44444444-4444-4444-8444-444444444444'],
  evidenceRequired: true,
  activationState: 'active',
  contentDigest: 'b'.repeat(64),
});

const processor = privacyProcessorDescriptorReferenceSchema.parse({
  processorId: '99999999-9999-4999-8999-999999999999',
  inventoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  descriptorDigest: 'c'.repeat(64),
  inventoryVersionDigest: 'd'.repeat(64),
  allowedPurposeIds: [purpose.purposeId],
  allowedCategoryIds: purpose.allowedCategoryIds,
  capabilities: ['access', 'inventory'],
  supportsSubjectLookup: true,
  codeOwner: 'packages.domain.privacy',
  synthetic: true,
});

const evidence = privacyEvidenceReferenceSchema.parse({
  evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  purposeId: purpose.purposeId,
  policyVersionId: policy.versionId,
  contentDigest: 'f'.repeat(64),
  recordedAt: '2026-08-18T11:00:00.000Z',
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'privacy PG persistence synthetic HTTP composition',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(
        sql`TRUNCATE privacy_subject_request_transition, privacy_subject_request, privacy_audit_event, privacy_withdrawal, privacy_authorization_evidence, privacy_purpose_version, privacy_processor_registration, privacy_policy_package_version`,
      );
    });

    afterAll(async () => {
      await connection.close();
    });

    it('evaluates data-use against disposable Postgres evidence and audit', async () => {
      const persistence = createPrivacyPgPersistence(connection);
      await expect(persistence.evidence.appendEvidence(evidence)).resolves.toBe(
        'accepted',
      );

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticPrivacy: true,
          privacy: {
            audit: persistence.audit,
            evidence: persistence.evidence,
            fixedUtcMs: '2026-08-18T12:00:00.000Z',
            subjectRequests: persistence.subjectRequests,
          },
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/privacy/synthetic/data-use-evaluate',
        payload: {
          actor: privacyActorContextReferenceSchema.parse({
            issuer: 'synthetic.identity.v1',
            version: 1,
            principalReferenceDigest: 'e'.repeat(64),
            authorityClaims: ['data_use_evaluate'],
            synthetic: true,
          }),
          purpose,
          policy,
          processor,
          operationKind: 'data_use_evaluation',
          engineeringCategoryId: privacyEngineeringCategoryIdSchema.parse(
            '44444444-4444-4444-8444-444444444444',
          ),
          evidence,
          subjectScopeId: privacySubjectScopeIdSchema.parse(
            '22222222-2222-4222-8222-222222222222',
          ),
          productionMode: false,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'evaluated',
        decision: { outcome: 'allowed' },
      });
      await expect(
        persistence.evidence.getEvidence(evidence.evidenceId),
      ).resolves.toEqual(evidence);

      const auditRows = await connection.db.execute<{
        kind: string;
        outcome: string;
      }>(sql`
        SELECT kind, outcome
        FROM privacy_audit_event
        ORDER BY recorded_at
      `);
      expect(auditRows).toEqual([
        { kind: 'data_use_evaluated', outcome: 'succeeded' },
      ]);

      await app.close();
    });
  },
);

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  catalogOperationKey,
  checkCatalogDatabaseReadiness,
  commitCatalogOperation,
  createPostgresConnection,
  journalContainsRequiredHashes,
  requiredCatalogMigrationHashes,
  resolveCatalogOperation,
  type LedgerKeyRing,
  type PostgresConnection,
} from '../src/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

function activeRing(): LedgerKeyRing {
  return {
    keys: [
      {
        keyId: 'ledger.test.v1',
        secret: randomBytes(32),
        status: 'active',
      },
    ],
  };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 03 catalog data lane',
  () => {
    let connection: PostgresConnection;
    let ring: LedgerKeyRing;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      ring = activeRing();
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    afterAll(async () => {
      await connection.close();
    });

    it('applies catalog tables and seeds taxonomy dimensions', async () => {
      const tables = await connection.db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

      expect(tables.map((row) => row.table_name)).toEqual([
        'catalog_operation',
        'coaches',
        'exercise',
        'exercise_lifecycle_event',
        'exercise_reference_candidate',
        'exercise_revision',
        'exercise_revision_reference',
        'exercise_revision_taxonomy_term',
        'onboarding_attempt',
        'onboarding_invitation',
        'onboarding_operation',
        'onboarding_principal_binding',
        'onboarding_role_mapping',
        'privacy_audit_event',
        'privacy_authorization_evidence',
        'privacy_policy_package_version',
        'privacy_processor_registration',
        'privacy_processor_step',
        'privacy_purpose_version',
        'privacy_retention_preview',
        'privacy_subject_request',
        'privacy_subject_request_transition',
        'privacy_withdrawal',
        'student_coach_links',
        'students',
        'taxonomy_dimension',
        'taxonomy_lifecycle_event',
        'taxonomy_term',
      ]);

      const dimensions = await connection.db.execute<{
        id: string;
        key: string;
      }>(sql`
      SELECT id::text, key
      FROM taxonomy_dimension
      ORDER BY key
    `);

      expect(dimensions).toEqual([
        {
          id: 'a1000002-0000-4000-8000-000000000002',
          key: 'equipment',
        },
        {
          id: 'a1000001-0000-4000-8000-000000000001',
          key: 'modality',
        },
      ]);
    });

    it('uses subset journal readiness instead of exact row count', async () => {
      const required = requiredCatalogMigrationHashes();
      expect(required).toHaveLength(2);

      const journal = await connection.db.execute<{ hash: string }>(sql`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at
    `);
      expect(journal.length).toBeGreaterThanOrEqual(2);
      expect(
        journalContainsRequiredHashes(
          journal.map((row) => ({ hash: row.hash })),
          required,
        ),
      ).toEqual({ ready: true });
      expect(
        journalContainsRequiredHashes(
          [
            ...journal.map((row) => ({ hash: row.hash })),
            { hash: createHash('sha256').update('future').digest('hex') },
          ],
          required,
        ),
      ).toEqual({ ready: true });

      const readiness = await checkCatalogDatabaseReadiness(connection, ring);
      expect(readiness).toEqual({ ready: true });
    });

    it('commits and replays ledger results with a persisted key id', async () => {
      const operationId = randomUUID();
      const operationKey = catalogOperationKey('exercise.publish', operationId);
      const inputDigest = createHash('sha256')
        .update('publish-input')
        .digest('hex');
      const resultPayload = {
        revision: 1,
        nested: { b: 2, a: 1 },
        exerciseId: randomUUID(),
      };

      const first = await commitCatalogOperation(connection, ring, {
        operationKey,
        namespace: 'exercise.publish',
        canonicalizationVersion: 'exercise-catalog.v1',
        inputDigest,
        resultPayload,
      });

      expect(first.status).toBe('committed');
      if (first.status !== 'committed') {
        throw new Error('expected committed');
      }

      expect(first.operation.resultIntegrityKeyId).toBe('ledger.test.v1');
      expect(first.operation.resultIntegrityDigest).toMatch(/^[a-f0-9]{64}$/);

      const replay = await commitCatalogOperation(connection, ring, {
        operationKey,
        namespace: 'exercise.publish',
        canonicalizationVersion: 'exercise-catalog.v1',
        inputDigest,
        resultPayload,
      });

      expect(replay.status).toBe('replayed');
      if (replay.status !== 'replayed') {
        throw new Error('expected replayed');
      }

      expect(replay.operation.id).toBe(first.operation.id);
      expect(replay.operation.resultIntegrityKeyId).toBe(
        first.operation.resultIntegrityKeyId,
      );

      const mismatch = await resolveCatalogOperation(connection, ring, {
        operationKey,
        namespace: 'exercise.publish',
        canonicalizationVersion: 'exercise-catalog.v1',
        inputDigest: createHash('sha256').update('different').digest('hex'),
      });

      expect(mismatch).toEqual({
        status: 'operation_input_mismatch',
        operationKey,
      });

      const count = await connection.db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count
      FROM catalog_operation
      WHERE operation_key = ${operationKey}
    `);
      expect(count[0]?.count).toBe('1');
    });

    it('fails readiness when the active ledger key is missing', async () => {
      const readiness = await checkCatalogDatabaseReadiness(connection, {
        keys: [],
      });
      expect(readiness).toEqual({
        ready: false,
        reason: 'ledger_key_ring',
        detail: 'missing_active_key',
      });
    });

    it('fails readiness when a retained result cites a missing ledger key', async () => {
      const readiness = await checkCatalogDatabaseReadiness(connection, {
        keys: [
          {
            keyId: 'ledger.other',
            secret: randomBytes(32),
            status: 'active',
          },
        ],
      });
      expect(readiness.ready).toBe(false);
      if (readiness.ready) {
        throw new Error('expected missing ledger key');
      }
      expect(readiness.reason).toBe('missing_ledger_key');
      expect(readiness.detail).toBe('ledger.test.v1');
    });
  },
);

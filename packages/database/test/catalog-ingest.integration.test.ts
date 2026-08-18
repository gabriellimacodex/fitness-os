import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createManifestIngestionCommand } from '@fitness-os/domain';
import { catalogManifestSchema } from '@fitness-os/schemas';

import {
  checkCatalogDatabaseReadiness,
  createExerciseCatalogCuration,
  createExerciseCatalogReader,
  createPostgresConnection,
  type LedgerKeyRing,
  type PostgresConnection,
} from '../src/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const manifest = catalogManifestSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../../catalog/catalog-manifest.v1.json', import.meta.url),
      ),
      'utf8',
    ),
  ),
);

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 03 catalog ingest + reader',
  () => {
    let connection: PostgresConnection;
    let ring: LedgerKeyRing;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      ring = {
        keys: [
          {
            keyId: 'ledger.test.v1',
            secret: randomBytes(32),
            status: 'active',
          },
        ],
      };
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    afterAll(async () => {
      await connection.close();
    });

    it('ingests the reviewed manifest once and serves it through the reader', async () => {
      const curation = createExerciseCatalogCuration(connection, ring);
      const reader = createExerciseCatalogReader(connection);
      const command = createManifestIngestionCommand({
        operationId: randomUUID(),
        manifest,
      });
      expect(command.status).toBe('ready');
      if (command.status !== 'ready') {
        throw new Error('expected ready command');
      }

      const first = await curation.ingestManifest(command.command);
      expect(first).toMatchObject({
        status: 'manifest_ingested',
        replayed: false,
        exerciseCount: 1,
        taxonomyTermCount: 2,
      });

      const second = await curation.ingestManifest(command.command);
      expect(second).toMatchObject({
        status: 'manifest_ingested',
        replayed: true,
        exerciseCount: 1,
      });

      const page = await reader.listExercises({ limit: 25 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.canonicalKey).toBe('bodyweight-squat');
      expect(page.nextCursor).toBeNull();

      const detail = await reader.getCurrentExercise(page.items[0]!.id);
      expect(detail?.currentRevision.displayName).toBe('Bodyweight Squat');

      const readiness = await checkCatalogDatabaseReadiness(connection, ring);
      expect(readiness).toEqual({ ready: true });
    });
  },
);

import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createExerciseLifecycleCommand,
  createPublishExerciseCommand,
  createTaxonomyReplacementCommand,
  createTaxonomyTermCommand,
  createTaxonomyTermLifecycleCommand,
} from '@fitness-os/domain';

import {
  SEEDED_TAXONOMY_DIMENSIONS,
  createExerciseCatalogCuration,
  createExerciseCatalogReader,
  createPostgresConnection,
  type LedgerKeyRing,
  type PostgresConnection,
} from '../src/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

function expectReady<Command>(result: {
  status: string;
  command?: Command;
}): Command {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready' || result.command === undefined) {
    throw new Error('expected ready command');
  }
  return result.command;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 03 catalog curation mutations',
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

    beforeEach(async () => {
      await connection.db.execute(sql`
        TRUNCATE
          exercise_lifecycle_event,
          taxonomy_lifecycle_event,
          exercise_revision_reference,
          exercise_revision_taxonomy_term,
          exercise_revision,
          exercise_reference_candidate,
          exercise,
          taxonomy_term,
          catalog_operation
        RESTART IDENTITY CASCADE
      `);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('publishes, archives, and replays catalog mutations', async () => {
      const curation = createExerciseCatalogCuration(connection, ring);
      const reader = createExerciseCatalogReader(connection);

      const modality = expectReady(
        createTaxonomyTermCommand({
          operationId: randomUUID(),
          dimensionId: SEEDED_TAXONOMY_DIMENSIONS.modality.id,
          dimension: 'modality',
          key: 'strength',
          label: 'Strength',
          meaning: 'Strength modality for curation tests.',
        }),
      );
      const equipment = expectReady(
        createTaxonomyTermCommand({
          operationId: randomUUID(),
          dimensionId: SEEDED_TAXONOMY_DIMENSIONS.equipment.id,
          dimension: 'equipment',
          key: 'bodyweight',
          label: 'Bodyweight',
          meaning: 'Bodyweight equipment for curation tests.',
        }),
      );

      const modalityCreated = await curation.createTaxonomyTerm(modality);
      expect(modalityCreated).toMatchObject({
        status: 'taxonomy_term_created',
        replayed: false,
      });
      if (modalityCreated.status !== 'taxonomy_term_created') {
        throw new Error('expected taxonomy_term_created');
      }

      const modalityReplay = await curation.createTaxonomyTerm(modality);
      expect(modalityReplay).toMatchObject({
        status: 'taxonomy_term_created',
        replayed: true,
        term: { id: modalityCreated.term.id },
      });

      const equipmentCreated = await curation.createTaxonomyTerm(equipment);
      expect(equipmentCreated.status).toBe('taxonomy_term_created');
      if (equipmentCreated.status !== 'taxonomy_term_created') {
        throw new Error('expected taxonomy_term_created');
      }

      const publishOperationId = randomUUID();
      const publish = expectReady(
        createPublishExerciseCommand({
          operationId: publishOperationId,
          semanticInput: {
            target: {
              canonicalKey: 'bodyweight-squat',
              exerciseId: null,
            },
            expectedCurrentRevision: null,
            content: {
              displayName: 'Bodyweight Squat',
              aliases: ['Air Squat'],
              description: 'A neutral squat catalog entry.',
              taxonomy: {
                modalityTermId: modalityCreated.term.id,
                equipmentTermIds: [equipmentCreated.term.id],
              },
              provenance: {
                originKind: 'internally_curated',
                changeReason: 'Initial curation publish',
                primaryProvenanceReference: null,
              },
              references: [],
            },
          },
        }),
      );

      const firstPublish = await curation.publishExercise(publish);
      expect(firstPublish).toMatchObject({
        status: 'published',
        replayed: false,
        exercise: {
          canonicalKey: 'bodyweight-squat',
          currentRevision: { revision: 1 },
        },
      });
      if (firstPublish.status !== 'published') {
        throw new Error('expected published');
      }

      const publishReplay = await curation.publishExercise(publish);
      expect(publishReplay).toMatchObject({
        status: 'published',
        replayed: true,
        exercise: { id: firstPublish.exercise.id },
      });

      const detail = await reader.getCurrentExercise(firstPublish.exercise.id);
      expect(detail?.currentRevision.displayName).toBe('Bodyweight Squat');

      const lifecycle = expectReady(
        createExerciseLifecycleCommand({
          operationId: randomUUID(),
          exerciseId: firstPublish.exercise.id,
          targetLifecycle: 'archived',
          reason: 'Archive after publish',
        }),
      );
      const archived = await curation.setExerciseLifecycle(lifecycle);
      expect(archived).toMatchObject({
        status: 'exercise_archived',
        replayed: false,
        exercise: { lifecycle: 'archived' },
      });

      const lifecycleReplay = await curation.setExerciseLifecycle(lifecycle);
      expect(lifecycleReplay).toMatchObject({
        status: 'exercise_archived',
        replayed: true,
      });
    });

    it('archives, replaces, and replays taxonomy term mutations', async () => {
      const curation = createExerciseCatalogCuration(connection, ring);

      const sourceCommand = expectReady(
        createTaxonomyTermCommand({
          operationId: randomUUID(),
          dimensionId: SEEDED_TAXONOMY_DIMENSIONS.equipment.id,
          dimension: 'equipment',
          key: 'dumbbell',
          label: 'Dumbbell',
          meaning: 'Source equipment term.',
        }),
      );
      const targetCommand = expectReady(
        createTaxonomyTermCommand({
          operationId: randomUUID(),
          dimensionId: SEEDED_TAXONOMY_DIMENSIONS.equipment.id,
          dimension: 'equipment',
          key: 'free-weight',
          label: 'Free weight',
          meaning: 'Replacement equipment term.',
        }),
      );

      const source = await curation.createTaxonomyTerm(sourceCommand);
      const target = await curation.createTaxonomyTerm(targetCommand);
      expect(source.status).toBe('taxonomy_term_created');
      expect(target.status).toBe('taxonomy_term_created');
      if (
        source.status !== 'taxonomy_term_created' ||
        target.status !== 'taxonomy_term_created'
      ) {
        throw new Error('expected taxonomy creates');
      }

      const archiveOther = expectReady(
        createTaxonomyTermCommand({
          operationId: randomUUID(),
          dimensionId: SEEDED_TAXONOMY_DIMENSIONS.equipment.id,
          dimension: 'equipment',
          key: 'kettlebell',
          label: 'Kettlebell',
          meaning: 'Independently archived equipment term.',
        }),
      );
      const other = await curation.createTaxonomyTerm(archiveOther);
      if (other.status !== 'taxonomy_term_created') {
        throw new Error('expected taxonomy create');
      }

      const archiveCommand = expectReady(
        createTaxonomyTermLifecycleCommand({
          operationId: randomUUID(),
          termId: other.term.id,
          targetLifecycle: 'archived',
          reason: 'Archive unused term',
        }),
      );
      const archived = await curation.setTaxonomyTermLifecycle(archiveCommand);
      expect(archived).toMatchObject({
        status: 'taxonomy_term_archived',
        replayed: false,
      });
      const archiveReplay =
        await curation.setTaxonomyTermLifecycle(archiveCommand);
      expect(archiveReplay).toMatchObject({
        status: 'taxonomy_term_archived',
        replayed: true,
      });

      const replaceCommand = expectReady(
        createTaxonomyReplacementCommand({
          operationId: randomUUID(),
          sourceTermId: source.term.id,
          targetTermId: target.term.id,
          reason: 'Consolidate equipment vocabulary',
        }),
      );
      const replaced = await curation.replaceTaxonomyTerm(replaceCommand);
      expect(replaced).toMatchObject({
        status: 'taxonomy_term_replaced',
        replayed: false,
        source: {
          id: source.term.id,
          lifecycle: 'replaced',
          replacedByTermId: target.term.id,
        },
        target: { id: target.term.id, lifecycle: 'active' },
      });

      const replaceReplay = await curation.replaceTaxonomyTerm(replaceCommand);
      expect(replaceReplay).toMatchObject({
        status: 'taxonomy_term_replaced',
        replayed: true,
      });
    });
  },
);

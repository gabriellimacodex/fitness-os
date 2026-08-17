import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { CreateStudentCoachLink } from '@fitness-os/domain';
import {
  coachRecordSchema,
  studentCoachLinkIdSchema,
  studentRecordSchema,
} from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createStudentCoachDatabase,
  type StudentCoachDatabase,
} from '../src/student-coach.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

const student = studentRecordSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-08-16T12:34:56.789Z',
});

const coach = coachRecordSchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-08-16T12:34:56.789Z',
});

const linkInput: CreateStudentCoachLink = {
  id: studentCoachLinkIdSchema.parse('33333333-3333-4333-8333-333333333333'),
  studentId: student.id,
  coachId: coach.id,
  startedAt: '2026-08-16T13:00:00.000Z',
};

describe.skipIf(!process.env.TEST_DATABASE_URL)('PRD 02 repositories', () => {
  let database: StudentCoachDatabase;

  beforeAll(async () => {
    database = createStudentCoachDatabase(requireDisposableDatabaseUrl());
    await database.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await database.db.execute(sql`DROP SCHEMA public CASCADE`);
    await database.db.execute(sql`CREATE SCHEMA public`);
    await migrate(database.db, { migrationsFolder });
  });

  beforeEach(async () => {
    await database.db.execute(
      sql`TRUNCATE student_coach_links, students, coaches`,
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it('creates and reads a student while classifying a duplicate ID', async () => {
    await expect(database.students.create(student)).resolves.toEqual({
      status: 'created',
      value: student,
    });
    await expect(database.students.findById(student.id)).resolves.toEqual(
      student,
    );
    await expect(database.students.create(student)).resolves.toEqual({
      status: 'conflict',
    });
  });

  it('creates and reads a coach while classifying a duplicate ID', async () => {
    await expect(database.coaches.create(coach)).resolves.toEqual({
      status: 'created',
      value: coach,
    });
    await expect(database.coaches.findById(coach.id)).resolves.toEqual(coach);
    await expect(database.coaches.create(coach)).resolves.toEqual({
      status: 'conflict',
    });
  });

  it('reports missing parents in deterministic student-then-coach order without an orphan', async () => {
    await expect(database.links.create(linkInput)).resolves.toEqual({
      status: 'missing_references',
      missing: ['student', 'coach'],
    });
    await expect(database.links.findById(linkInput.id)).resolves.toBeNull();

    await database.students.create(student);

    await expect(database.links.create(linkInput)).resolves.toEqual({
      status: 'missing_references',
      missing: ['coach'],
    });
    await expect(database.links.findById(linkInput.id)).resolves.toBeNull();
  });

  it('creates and reads one active student-coach link', async () => {
    await database.students.create(student);
    await database.coaches.create(coach);

    const activeLink = { ...linkInput, endedAt: null };
    await expect(database.links.create(linkInput)).resolves.toEqual({
      status: 'created',
      value: activeLink,
    });
    await expect(database.links.findById(linkInput.id)).resolves.toEqual(
      activeLink,
    );
    await expect(
      database.links.findActive(student.id, coach.id),
    ).resolves.toEqual(activeLink);
  });

  it('ends a link once and preserves the historical interval', async () => {
    await database.students.create(student);
    await database.coaches.create(coach);
    await database.links.create(linkInput);

    const endedAt = '2026-08-16T14:00:00.000Z';
    const endedLink = { ...linkInput, endedAt };
    await expect(database.links.end(linkInput.id, endedAt)).resolves.toEqual({
      status: 'ended',
      value: endedLink,
    });
    await expect(
      database.links.findActive(student.id, coach.id),
    ).resolves.toBeNull();
    await expect(database.links.findById(linkInput.id)).resolves.toEqual(
      endedLink,
    );
    await expect(
      database.links.end(linkInput.id, '2026-08-16T15:00:00.000Z'),
    ).resolves.toEqual({ status: 'already_ended' });
    await expect(database.links.findById(linkInput.id)).resolves.toEqual(
      endedLink,
    );
  });

  it('serializes concurrent active-link creation for one exact pair', async () => {
    await database.students.create(student);
    await database.coaches.create(coach);

    const competingInput: CreateStudentCoachLink = {
      ...linkInput,
      id: studentCoachLinkIdSchema.parse(
        '44444444-4444-4444-8444-444444444444',
      ),
    };
    const results = await Promise.all([
      database.links.create(linkInput),
      database.links.create(competingInput),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'conflict',
      'created',
    ]);
  });

  it('rejects overlapping history and accepts only a strictly later interval', async () => {
    await database.students.create(student);
    await database.coaches.create(coach);
    await database.links.create(linkInput);
    await database.links.end(linkInput.id, '2026-08-16T14:00:00.000Z');

    for (const [id, startedAt] of [
      ['44444444-4444-4444-8444-444444444444', '2026-08-16T13:30:00.000Z'],
      ['55555555-5555-4555-8555-555555555555', '2026-08-16T14:00:00.000Z'],
    ] as const) {
      await expect(
        database.links.create({
          ...linkInput,
          id: studentCoachLinkIdSchema.parse(id),
          startedAt,
        }),
      ).resolves.toEqual({ status: 'conflict' });
    }

    const laterInput: CreateStudentCoachLink = {
      ...linkInput,
      id: studentCoachLinkIdSchema.parse(
        '66666666-6666-4666-8666-666666666666',
      ),
      startedAt: '2026-08-16T14:00:00.001Z',
    };
    await expect(database.links.create(laterInput)).resolves.toMatchObject({
      status: 'created',
      value: { ...laterInput, endedAt: null },
    });
  });

  it('classifies missing and invalid end attempts without mutation', async () => {
    await expect(
      database.links.end(linkInput.id, 'not-a-timestamp'),
    ).resolves.toEqual({ status: 'not_found' });

    await database.students.create(student);
    await database.coaches.create(coach);
    await database.links.create(linkInput);

    for (const endedAt of [
      linkInput.startedAt,
      '2026-08-16T12:59:59.999Z',
      'not-a-timestamp',
    ]) {
      await expect(database.links.end(linkInput.id, endedAt)).resolves.toEqual({
        status: 'invalid_interval',
      });
    }
    await expect(database.links.findById(linkInput.id)).resolves.toEqual({
      ...linkInput,
      endedAt: null,
    });
  });

  it('serializes concurrent end attempts into one end and one already-ended result', async () => {
    await database.students.create(student);
    await database.coaches.create(coach);
    await database.links.create(linkInput);

    const results = await Promise.all([
      database.links.end(linkInput.id, '2026-08-16T14:00:00.000Z'),
      database.links.end(linkInput.id, '2026-08-16T15:00:00.000Z'),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'already_ended',
      'ended',
    ]);
  });

  it('classifies a reused link ID as conflict without rewriting history', async () => {
    await database.students.create(student);
    await database.coaches.create(coach);
    await database.links.create(linkInput);
    await database.links.end(linkInput.id, '2026-08-16T14:00:00.000Z');

    await expect(
      database.links.create({
        ...linkInput,
        startedAt: '2026-08-16T14:00:00.001Z',
      }),
    ).resolves.toEqual({ status: 'conflict' });
    await expect(database.links.findById(linkInput.id)).resolves.toEqual({
      ...linkInput,
      endedAt: '2026-08-16T14:00:00.000Z',
    });
  });

  it('preserves database unavailability as an unexpected dependency failure', async () => {
    const unavailableUrl = new URL(requireDisposableDatabaseUrl());
    unavailableUrl.pathname = '/fitness_os_prd02_missing';
    unavailableUrl.searchParams.set('connect_timeout', '1');
    const unavailable = createStudentCoachDatabase(unavailableUrl.toString());

    try {
      await expect(unavailable.students.findById(student.id)).rejects.toThrow();
    } finally {
      await unavailable.close();
    }
  });
});

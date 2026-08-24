import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPostgresConnection,
  type PostgresConnection,
} from '../src/connection.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

function hasPostgresViolation(
  error: unknown,
  code: string,
  constraintName: string,
): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code &&
    'constraint_name' in error &&
    error.constraint_name === constraintName
  ) {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    hasPostgresViolation(error.cause, code, constraintName)
  );
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('PRD 02 migration', () => {
  let connection: PostgresConnection;

  beforeAll(async () => {
    connection = createPostgresConnection(requireDisposableDatabaseUrl());
    await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
    await connection.db.execute(sql`CREATE SCHEMA public`);
    await migrate(connection.db, { migrationsFolder });
  });

  afterAll(async () => {
    await connection.close();
  });

  it('applies the generated migration to create only the authorized product tables', async () => {
    const rows = await connection.db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    expect(rows.map((row) => row.table_name)).toEqual([
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
      'onboarding_role_mapping',
      'privacy_audit_event',
      'privacy_authorization_evidence',
      'privacy_policy_package_version',
      'privacy_processor_registration',
      'privacy_purpose_version',
      'privacy_subject_request',
      'privacy_subject_request_transition',
      'privacy_withdrawal',
      'student_coach_links',
      'students',
      'taxonomy_dimension',
      'taxonomy_lifecycle_event',
      'taxonomy_term',
    ]);
  });

  it('creates only the authorized columns with exact PostgreSQL types and nullability', async () => {
    const rows = await connection.db.execute<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: 'YES' | 'NO';
    }>(sql`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('students', 'coaches', 'student_coach_links')
      ORDER BY table_name, ordinal_position
    `);

    expect(rows).toEqual([
      {
        table_name: 'coaches',
        column_name: 'id',
        data_type: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'coaches',
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
      {
        table_name: 'student_coach_links',
        column_name: 'id',
        data_type: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'student_coach_links',
        column_name: 'student_id',
        data_type: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'student_coach_links',
        column_name: 'coach_id',
        data_type: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'student_coach_links',
        column_name: 'started_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
      {
        table_name: 'student_coach_links',
        column_name: 'ended_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      {
        table_name: 'students',
        column_name: 'id',
        data_type: 'uuid',
        is_nullable: 'NO',
      },
      {
        table_name: 'students',
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
    ]);
  });

  it('installs the exact temporal constraints and access indexes', async () => {
    const constraints = await connection.db.execute<{
      constraint_name: string;
      definition: string;
    }>(sql`
      SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'student_coach_links'::regclass
      ORDER BY conname
    `);
    const indexes = await connection.db.execute<{
      indexname: string;
      indexdef: string;
    }>(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'student_coach_links'
      ORDER BY indexname
    `);

    expect(constraints.map((constraint) => constraint.constraint_name)).toEqual(
      [
        'student_coach_links_coach_id_coaches_id_fk',
        'student_coach_links_ended_after_started_check',
        'student_coach_links_pkey',
        'student_coach_links_student_id_students_id_fk',
      ],
    );
    expect(constraints.map((constraint) => constraint.definition)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('FOREIGN KEY (coach_id)'),
        expect.stringContaining('FOREIGN KEY (student_id)'),
        expect.stringContaining('ON DELETE RESTRICT'),
        expect.stringContaining('ended_at > started_at'),
      ]),
    );
    expect(indexes.map((index) => index.indexname)).toEqual([
      'student_coach_links_active_pair_unique',
      'student_coach_links_coach_started_idx',
      'student_coach_links_pkey',
      'student_coach_links_student_started_idx',
    ]);
    expect(
      indexes.find(
        (index) => index.indexname === 'student_coach_links_active_pair_unique',
      )?.indexdef,
    ).toContain('WHERE (ended_at IS NULL)');
  });

  it('enforces missing-parent, invalid-interval, and active-pair failures in PostgreSQL', async () => {
    await connection.db.execute(
      sql`TRUNCATE student_coach_links, students, coaches`,
    );
    await connection.db.execute(sql`
      INSERT INTO students (id, created_at)
      VALUES ('11111111-1111-4111-8111-111111111111', '2026-08-16T12:00:00.000Z')
    `);
    await connection.db.execute(sql`
      INSERT INTO coaches (id, created_at)
      VALUES ('22222222-2222-4222-8222-222222222222', '2026-08-16T12:00:00.000Z')
    `);
    await connection.db.execute(sql`
      INSERT INTO student_coach_links (id, student_id, coach_id, started_at, ended_at)
      VALUES (
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '2026-08-16T13:00:00.000Z',
        NULL
      )
    `);

    const cases = [
      {
        operation: () =>
          connection.db.execute(sql`
          INSERT INTO student_coach_links (id, student_id, coach_id, started_at, ended_at)
          VALUES (
            '44444444-4444-4444-8444-444444444444',
            '99999999-9999-4999-8999-999999999999',
            '22222222-2222-4222-8222-222222222222',
            '2026-08-16T13:00:00.000Z',
            NULL
          )
        `),
        code: '23503',
        constraint: 'student_coach_links_student_id_students_id_fk',
      },
      {
        operation: () =>
          connection.db.execute(sql`
          INSERT INTO student_coach_links (id, student_id, coach_id, started_at, ended_at)
          VALUES (
            '55555555-5555-4555-8555-555555555555',
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '2026-08-16T14:00:00.000Z',
            '2026-08-16T13:59:59.999Z'
          )
        `),
        code: '23514',
        constraint: 'student_coach_links_ended_after_started_check',
      },
      {
        operation: () =>
          connection.db.execute(sql`
          INSERT INTO student_coach_links (id, student_id, coach_id, started_at, ended_at)
          VALUES (
            '66666666-6666-4666-8666-666666666666',
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '2026-08-16T15:00:00.000Z',
            NULL
          )
        `),
        code: '23505',
        constraint: 'student_coach_links_active_pair_unique',
      },
    ];

    for (const testCase of cases) {
      try {
        await testCase.operation();
        throw new Error(`Expected ${testCase.constraint} to reject the write.`);
      } catch (error) {
        expect(
          hasPostgresViolation(error, testCase.code, testCase.constraint),
        ).toBe(true);
      }
    }
  });

  it('does not replay an already-applied migration', async () => {
    const before = await connection.db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
    `);

    await migrate(connection.db, { migrationsFolder });

    const after = await connection.db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
    `);
    expect(before[0]?.count).toBe(13);
    expect(after).toEqual(before);
  });

  it('rolls back a deliberate failed change while preserving unrelated sentinel data', async () => {
    await connection.db.execute(
      sql`CREATE SCHEMA IF NOT EXISTS prd02_recovery`,
    );
    await connection.db.execute(sql`
      CREATE TABLE IF NOT EXISTS prd02_recovery.sentinel (
        id integer PRIMARY KEY,
        value text NOT NULL
      )
    `);
    await connection.db.execute(sql`TRUNCATE prd02_recovery.sentinel`);
    await connection.db.execute(sql`
      INSERT INTO prd02_recovery.sentinel (id, value)
      VALUES (1, 'unrelated-data-must-survive')
    `);
    const before = await connection.db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM student_coach_links
    `);

    await expect(
      connection.db.transaction(async (transaction) => {
        await transaction.execute(sql`
          CREATE TABLE public.prd02_partial_failure (id integer PRIMARY KEY)
        `);
        await transaction.execute(sql`
          INSERT INTO student_coach_links (id, student_id, coach_id, started_at, ended_at)
          VALUES (
            '77777777-7777-4777-8777-777777777777',
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '2026-08-16T16:00:00.000Z',
            NULL
          )
        `);
      }),
    ).rejects.toThrow();

    const sentinel = await connection.db.execute<{ value: string }>(sql`
      SELECT value FROM prd02_recovery.sentinel WHERE id = 1
    `);
    const partialTable = await connection.db.execute<{
      relation: string | null;
    }>(
      sql`SELECT to_regclass('public.prd02_partial_failure')::text AS relation`,
    );
    const after = await connection.db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM student_coach_links
    `);

    expect(sentinel[0]?.value).toBe('unrelated-data-must-survive');
    expect(partialTable[0]?.relation).toBeNull();
    expect(after).toEqual(before);
  });
});

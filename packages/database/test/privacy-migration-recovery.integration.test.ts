import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createPostgresConnection,
  type PostgresConnection,
} from '../src/connection.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  ) {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    hasPostgresErrorCode(error.cause, code)
  );
}

async function expectRejectsWithCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) {
    throw new Error('expected the query to be rejected, but it resolved');
  }
  expect(hasPostgresErrorCode(caught, code)).toBe(true);
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 21 migration recovery',
  () => {
    let connection: PostgresConnection;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE privacy_audit_event`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('rejects a deliberate destructive UPDATE and DELETE on the append-only audit ledger, leaving the row unchanged', async () => {
      const eventId = '55555555-5555-4555-8555-555555555555';
      await connection.db.execute(sql`
        INSERT INTO privacy_audit_event
          (audit_event_id, kind, outcome, operation_id, correlation_id, recorded_at)
        VALUES (
          ${eventId},
          'data_use_evaluated',
          'succeeded',
          '66666666-6666-4666-8666-666666666666',
          '77777777-7777-4777-8777-777777777777',
          '2026-08-18T00:00:00.000Z'
        )
      `);

      await expectRejectsWithCode(
        connection.db.execute(sql`
          UPDATE privacy_audit_event
          SET outcome = 'failed'
          WHERE audit_event_id = ${eventId}
        `),
        '42501',
      );

      await expectRejectsWithCode(
        connection.db.execute(
          sql`DELETE FROM privacy_audit_event WHERE audit_event_id = ${eventId}`,
        ),
        '42501',
      );

      const rows = await connection.db.execute<{
        outcome: string;
        recorded_at: string;
      }>(sql`
        SELECT outcome, recorded_at FROM privacy_audit_event
        WHERE audit_event_id = ${eventId}
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.outcome).toBe('succeeded');
    });

    it('rolls back a deliberate failed forward-correction transaction while preserving unrelated sentinel data and existing audit evidence', async () => {
      await connection.db.execute(
        sql`CREATE SCHEMA IF NOT EXISTS prd21_recovery`,
      );
      await connection.db.execute(sql`
        CREATE TABLE IF NOT EXISTS prd21_recovery.sentinel (
          id integer PRIMARY KEY,
          value text NOT NULL
        )
      `);
      await connection.db.execute(sql`TRUNCATE prd21_recovery.sentinel`);
      await connection.db.execute(sql`
        INSERT INTO prd21_recovery.sentinel (id, value)
        VALUES (1, 'unrelated-data-must-survive')
      `);

      await connection.db.execute(sql`
        INSERT INTO privacy_audit_event
          (audit_event_id, kind, outcome, operation_id, correlation_id, recorded_at)
        VALUES (
          '88888888-8888-4888-8888-888888888888',
          'data_use_evaluated',
          'succeeded',
          '99999999-9999-4999-8999-999999999999',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '2026-08-18T00:00:00.000Z'
        )
      `);
      const before = await connection.db.execute<{ count: number }>(sql`
        SELECT count(*)::int AS count FROM privacy_audit_event
      `);

      await expect(
        connection.db.transaction(async (transaction) => {
          await transaction.execute(sql`
            CREATE TABLE public.prd21_partial_failure (id integer PRIMARY KEY)
          `);
          // 'denied' requires a non-null reason_code; omitting it violates
          // privacy_audit_event_reason_code_denied_check and must abort the
          // whole transaction, including the table just created above.
          await transaction.execute(sql`
            INSERT INTO privacy_audit_event
              (audit_event_id, kind, outcome, operation_id, correlation_id, recorded_at)
            VALUES (
              'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              'data_use_evaluated',
              'denied',
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              '2026-08-18T00:05:00.000Z'
            )
          `);
        }),
      ).rejects.toThrow();

      const sentinel = await connection.db.execute<{ value: string }>(sql`
        SELECT value FROM prd21_recovery.sentinel WHERE id = 1
      `);
      const partialTable = await connection.db.execute<{
        relation: string | null;
      }>(
        sql`SELECT to_regclass('public.prd21_partial_failure')::text AS relation`,
      );
      const after = await connection.db.execute<{ count: number }>(sql`
        SELECT count(*)::int AS count FROM privacy_audit_event
      `);

      expect(sentinel[0]?.value).toBe('unrelated-data-must-survive');
      expect(partialTable[0]?.relation).toBeNull();
      expect(after).toEqual(before);
    });
  },
);

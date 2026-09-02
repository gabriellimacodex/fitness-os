import { fileURLToPath } from 'node:url';

import { createPostgresConnection } from '@fitness-os/database';
import {
  onboardingOperationResponseSchema,
  retryTokenSchema,
} from '@fitness-os/schemas';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createOnboardingPgPersistence } from './pg-persistence.js';

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

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'onboarding transition sink PG write-through',
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
      await connection.db.execute(sql`TRUNCATE onboarding_transition`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('appends a real transition row through disposable Postgres when composed as the route transitionSink', async () => {
      const persistence = createOnboardingPgPersistence(connection);

      const app = buildApp(
        { logger: false },
        {
          allowSyntheticOnboarding: true,
          onboarding: {
            resolveContext: () => ({
              mappedRoles: ['coach'],
              principalKey: 'coach-transition-sink-1',
              synthetic: true,
            }),
            transitionSink: persistence.transitions,
          },
        },
      );

      const issued = await app.inject({
        method: 'POST',
        url: '/v1/onboarding/student-invitations',
        payload: {
          retryToken: retryTokenSchema.parse('transition-sink-pg-issue-1'),
        },
      });
      const issuedBody = onboardingOperationResponseSchema.parse(issued.json());
      expect(issuedBody.result).toMatchObject({
        command: 'issue_student_invitation',
        outcome: 'command_succeeded',
      });

      const rows = await connection.db.execute<{
        aggregate: string;
        next_state: string;
        previous_state: string;
        reason: string;
      }>(sql`
        SELECT aggregate, next_state, previous_state, reason
        FROM onboarding_transition
        WHERE aggregate = 'invitation' AND reason = 'issue_student_invitation'
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        aggregate: 'invitation',
        next_state: 'issued',
        previous_state: 'unissued',
        reason: 'issue_student_invitation',
      });

      await app.close();
    });

    it('reports a conflict without a duplicate row on an exact-tuple repeat, matching the in-memory sink', async () => {
      const persistence = createOnboardingPgPersistence(connection);

      await expect(
        persistence.transitions.append({
          aggregate: 'invitation',
          aggregateId: 'dedup-invitation-1',
          nextState: 'issued',
          operationId: 'dedup-operation-1',
          previousState: 'unissued',
          reason: 'issue_student_invitation',
          recordedAt: '2026-08-31T00:00:00.000Z',
        }),
      ).resolves.toBe('accepted');

      await expect(
        persistence.transitions.append({
          aggregate: 'invitation',
          aggregateId: 'dedup-invitation-1',
          nextState: 'issued',
          operationId: 'dedup-operation-1',
          previousState: 'unissued',
          reason: 'issue_student_invitation',
          recordedAt: '2026-08-31T00:00:01.000Z',
        }),
      ).resolves.toBe('conflict');

      const rows = await connection.db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM onboarding_transition
        WHERE aggregate_id = 'dedup-invitation-1'
      `);
      expect(rows[0]?.count).toBe('1');
    });
  },
);

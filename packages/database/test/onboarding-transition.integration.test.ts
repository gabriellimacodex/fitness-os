import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { OnboardingTransitionSink } from '@fitness-os/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresOnboardingTransitionSink } from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding transition persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let transitions: OnboardingTransitionSink;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      transitions = createPostgresOnboardingTransitionSink(connection);
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

    it('accepts append-only transition evidence and rejects an exact repeat', async () => {
      const record = {
        aggregate: 'invitation' as const,
        aggregateId: '11111111-1111-4111-8111-111111111111',
        nextState: 'issued',
        operationId: '22222222-2222-4222-8222-222222222222',
        previousState: 'unissued',
        reason: 'issue_student_invitation',
        recordedAt: '2026-08-27T00:00:00.000Z',
      };

      await expect(transitions.append(record)).resolves.toBe('accepted');
      await expect(transitions.append(record)).resolves.toBe('conflict');

      const rows = await connection.db.execute(
        sql`SELECT aggregate, aggregate_id, previous_state, next_state, operation_id, reason FROM onboarding_transition`,
      );
      expect(rows).toHaveLength(1);
    });

    it('accepts a distinct transition for the same aggregate under a different operation', async () => {
      const first = {
        aggregate: 'attempt' as const,
        aggregateId: '33333333-3333-4333-8333-333333333333',
        nextState: 'policy_pending',
        operationId: '44444444-4444-4444-8444-444444444444',
        previousState: 'unstarted',
        reason: 'create_attempt',
        recordedAt: '2026-08-27T00:00:00.000Z',
      };
      const second = {
        ...first,
        nextState: 'ready_to_claim',
        operationId: '55555555-5555-4555-8555-555555555555',
        previousState: 'policy_pending',
        reason: 'refresh_policy',
        recordedAt: '2026-08-27T00:01:00.000Z',
      };

      await expect(transitions.append(first)).resolves.toBe('accepted');
      await expect(transitions.append(second)).resolves.toBe('accepted');

      const rows = await connection.db.execute(
        sql`SELECT COUNT(*)::int AS count FROM onboarding_transition WHERE aggregate_id = ${first.aggregateId}`,
      );
      expect(rows[0]?.count).toBe(2);
    });

    it('rejects an unknown aggregate kind', async () => {
      await expect(
        transitions.append({
          // @ts-expect-error deliberately invalid aggregate for the fail-closed check
          aggregate: 'unknown_aggregate',
          aggregateId: '66666666-6666-4666-8666-666666666666',
          nextState: 'issued',
          operationId: '77777777-7777-4777-8777-777777777777',
          previousState: 'unissued',
          reason: 'issue_student_invitation',
          recordedAt: '2026-08-27T00:00:00.000Z',
        }),
      ).rejects.toThrow('unexpected onboarding transition aggregate');
    });
  },
);

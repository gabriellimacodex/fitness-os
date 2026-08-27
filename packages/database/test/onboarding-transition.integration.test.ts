import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresOnboardingTransitionSink } from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding transition persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let transitions: ReturnType<typeof createPostgresOnboardingTransitionSink>;

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

    it('appends transition evidence and lists it in recorded order', async () => {
      const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

      await expect(
        transitions.append({
          aggregate: 'attempt',
          aggregateId: attemptId,
          nextState: 'policy_pending',
          operationId: '11111111-1111-4111-8111-111111111111',
          previousState: 'none',
          reason: 'created',
          recordedAt: '2026-08-27T10:00:00.000Z',
        }),
      ).resolves.toBe('accepted');

      await expect(
        transitions.append({
          aggregate: 'attempt',
          aggregateId: attemptId,
          nextState: 'ready_to_claim',
          operationId: '22222222-2222-4222-8222-222222222222',
          previousState: 'policy_pending',
          reason: 'policy_ready',
          recordedAt: '2026-08-27T10:05:00.000Z',
        }),
      ).resolves.toBe('accepted');

      const history = await transitions.listForAggregate('attempt', attemptId);
      expect(history.map((row) => row.nextState)).toEqual([
        'policy_pending',
        'ready_to_claim',
      ]);
      expect(history[0]?.reason).toBe('created');
    });

    it('treats an exact-tuple repeat as a conflict without a duplicate row', async () => {
      const attemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const record = {
        aggregate: 'attempt' as const,
        aggregateId: attemptId,
        nextState: 'policy_pending',
        operationId: '33333333-3333-4333-8333-333333333333',
        previousState: 'none',
        reason: 'created',
        recordedAt: '2026-08-27T10:00:00.000Z',
      };

      await expect(transitions.append(record)).resolves.toBe('accepted');
      await expect(transitions.append(record)).resolves.toBe('conflict');

      const history = await transitions.listForAggregate('attempt', attemptId);
      expect(history).toHaveLength(1);
    });

    it('rejects an unrecognized aggregate before writing', async () => {
      await expect(
        transitions.append({
          // @ts-expect-error verifying runtime guard for an invalid aggregate
          aggregate: 'not_a_real_aggregate',
          aggregateId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          nextState: 'issued',
          operationId: '44444444-4444-4444-8444-444444444444',
          previousState: 'none',
          reason: 'created',
          recordedAt: '2026-08-27T10:00:00.000Z',
        }),
      ).rejects.toThrow(/unexpected onboarding transition aggregate/);
    });
  },
);

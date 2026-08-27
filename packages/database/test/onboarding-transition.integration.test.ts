import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import {
  asOnboardingTransitionSink,
  createPostgresOnboardingTransitionRepository,
} from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding transition persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let transitions: ReturnType<
      typeof createPostgresOnboardingTransitionRepository
    >;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      transitions = createPostgresOnboardingTransitionRepository(connection);
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

    it('accepts a new transition and treats an identical replay as a conflict-free no-op', async () => {
      const record = {
        aggregate: 'attempt' as const,
        aggregateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        nextState: 'ready_to_claim',
        operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        previousState: 'policy_pending',
        reason: 'policy_ready',
        recordedAt: '2026-08-19T12:00:00.000Z',
      };

      await expect(transitions.append(record)).resolves.toBe('accepted');
      await expect(transitions.append(record)).resolves.toBe('conflict');

      await expect(
        transitions.listByAggregate(record.aggregate, record.aggregateId),
      ).resolves.toEqual([record]);
    });

    it('keeps distinct transitions for the same aggregate as separate rows', async () => {
      const created = {
        aggregate: 'attempt' as const,
        aggregateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        nextState: 'policy_pending',
        operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        previousState: 'created',
        reason: 'attempt_created',
        recordedAt: '2026-08-19T12:00:00.000Z',
      };
      const advanced = {
        ...created,
        nextState: 'ready_to_claim',
        operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        previousState: 'policy_pending',
        reason: 'policy_ready',
        recordedAt: '2026-08-19T12:05:00.000Z',
      };

      await expect(transitions.append(created)).resolves.toBe('accepted');
      await expect(transitions.append(advanced)).resolves.toBe('accepted');

      await expect(
        transitions.listByAggregate(created.aggregate, created.aggregateId),
      ).resolves.toEqual([created, advanced]);
    });

    it('exposes the domain OnboardingTransitionSink port through the structural adapter', async () => {
      const sink = asOnboardingTransitionSink(transitions);
      const record = {
        aggregate: 'invitation' as const,
        aggregateId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        nextState: 'claimed',
        operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        previousState: 'issued',
        reason: 'claim_committed',
        recordedAt: '2026-08-19T12:10:00.000Z',
      };

      await expect(sink.append(record)).resolves.toBe('accepted');
      await expect(sink.append(record)).resolves.toBe('conflict');
    });
  },
);

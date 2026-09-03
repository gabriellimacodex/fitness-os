import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresClaimFailureTracker } from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding claim-failure persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let tracker: ReturnType<typeof createPostgresClaimFailureTracker>;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      tracker = createPostgresClaimFailureTracker(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE onboarding_claim_failure`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('records a failure and returns it as a strictly-after timestamp', async () => {
      await tracker.recordFailure('principal-a', 100);

      await expect(tracker.recentFailures('principal-a', 0)).resolves.toEqual([
        100,
      ]);
      await expect(tracker.recentFailures('principal-a', 100)).resolves.toEqual(
        [],
      );
    });

    it('keeps each key isolated', async () => {
      await tracker.recordFailure('principal-a', 0);
      await tracker.recordFailure('principal-b', 0);

      await expect(tracker.recentFailures('principal-a', -1)).resolves.toEqual([
        0,
      ]);
      await expect(tracker.recentFailures('principal-c', -1)).resolves.toEqual(
        [],
      );
    });

    it('returns every matching failure across repeated calls', async () => {
      await tracker.recordFailure('principal-a', 10);
      await tracker.recordFailure('principal-a', 20);
      await tracker.recordFailure('principal-a', 30);

      const failures = await tracker.recentFailures('principal-a', 5);
      expect([...failures].sort((left, right) => left - right)).toEqual([
        10, 20, 30,
      ]);
    });

    it('survives independent tracker instances against the same table', async () => {
      await tracker.recordFailure('principal-a', 42);

      const otherTracker = createPostgresClaimFailureTracker(connection);
      await expect(
        otherTracker.recentFailures('principal-a', 0),
      ).resolves.toEqual([42]);
    });

    it('returns an empty list for a key with no recorded failures', async () => {
      await expect(
        tracker.recentFailures('principal-unknown', 0),
      ).resolves.toEqual([]);
    });
  },
);

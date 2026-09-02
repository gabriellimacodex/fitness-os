import { fileURLToPath } from 'node:url';

import { createPostgresConnection } from '@fitness-os/database';
import {
  CryptoOnboardingIdFactory,
  CryptoOnboardingSecretFactory,
  FixedTrustedClock,
  SyntheticOnboardingTransitionSink,
} from '@fitness-os/domain';
import { retryTokenSchema } from '@fitness-os/schemas';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createCoachBootstrapLedger,
  issueCoachBootstrapInvitation,
  type IssueCoachBootstrapInvitationOptions,
} from './bootstrap.js';
import { createOnboardingPgPersistence } from './pg-persistence.js';
import { createOnboardingStore } from './store.js';

const RETRY_TOKEN = retryTokenSchema.parse('pg-bootstrap-retry-01');

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
  'issueCoachBootstrapInvitation PostgreSQL write-through',
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
      await connection.db.execute(sql`TRUNCATE onboarding_invitation CASCADE`);
    });

    afterAll(async () => {
      await connection.close();
    });

    function buildOptions(
      overrides?: Partial<IssueCoachBootstrapInvitationOptions>,
    ): IssueCoachBootstrapInvitationOptions {
      return {
        clock: new FixedTrustedClock('2026-08-28T00:00:00.000Z'),
        environment: 'synthetic',
        idFactory: new CryptoOnboardingIdFactory(),
        ledger: createCoachBootstrapLedger(),
        persistence: createOnboardingPgPersistence(connection),
        secretFactory: new CryptoOnboardingSecretFactory(),
        store: createOnboardingStore(),
        transitionSink: new SyntheticOnboardingTransitionSink(),
        ...overrides,
      };
    }

    it('writes the issued coach_bootstrap invitation through to Postgres', async () => {
      const options = buildOptions();

      const result = await issueCoachBootstrapInvitation(options, {
        operatorId: 'operator-pg-1',
        retryToken: RETRY_TOKEN,
      });

      expect(result.state).toBe('operation_committed');
      if (result.state !== 'operation_committed') {
        throw new Error('expected operation_committed');
      }

      const rows = await connection.db.execute<{
        invitation_id: string;
        purpose: string;
        state: string;
        target_coach_principal_key: string | null;
      }>(sql`
        SELECT invitation_id, purpose, state, target_coach_principal_key
        FROM onboarding_invitation
        WHERE invitation_id = ${result.result.issued.invitationId}
      `);

      expect(rows.length).toBe(1);
      expect(rows[0]?.purpose).toBe('coach_bootstrap');
      expect(rows[0]?.state).toBe('issued');
      expect(rows[0]?.target_coach_principal_key).toBeNull();
    });

    it('does not write a second row when a repeat operator/retry token replays', async () => {
      const options = buildOptions();

      const first = await issueCoachBootstrapInvitation(options, {
        operatorId: 'operator-pg-2',
        retryToken: RETRY_TOKEN,
      });
      const second = await issueCoachBootstrapInvitation(options, {
        operatorId: 'operator-pg-2',
        retryToken: RETRY_TOKEN,
      });

      expect(first.state).toBe('operation_committed');
      expect(second.state).toBe('operation_replayed');

      const rows = await connection.db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM onboarding_invitation
        WHERE purpose = 'coach_bootstrap'
      `);
      expect(rows[0]?.count).toBe('1');
    });
  },
);

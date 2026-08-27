import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresPrincipalBindingRepository } from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding principal binding persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let bindings: ReturnType<typeof createPostgresPrincipalBindingRepository>;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      bindings = createPostgresPrincipalBindingRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE onboarding_principal_binding`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('establishes a binding once and resolves it on a later call', async () => {
      const established = await bindings.resolveOrEstablish({
        principalKey: 'issuer:subject-1',
        productionMode: false,
        nowUtcMs: '2026-08-27T00:00:00.000Z',
      });
      expect(established.status).toBe('established');
      if (established.status !== 'established') {
        throw new Error('expected established');
      }

      const resolved = await bindings.resolveOrEstablish({
        principalKey: 'issuer:subject-1',
        productionMode: false,
        nowUtcMs: '2026-08-27T00:05:00.000Z',
      });
      expect(resolved).toEqual({
        binding: established.binding,
        status: 'resolved',
      });

      await expect(
        bindings.getByPrincipalKey('issuer:subject-1'),
      ).resolves.toEqual(established.binding);
    });

    it('denies before any write in production mode', async () => {
      await expect(
        bindings.resolveOrEstablish({
          principalKey: 'issuer:subject-2',
          productionMode: true,
          nowUtcMs: '2026-08-27T00:00:00.000Z',
        }),
      ).resolves.toEqual({
        reason: 'synthetic_in_production',
        status: 'denied',
      });
      await expect(
        bindings.getByPrincipalKey('issuer:subject-2'),
      ).resolves.toBeNull();
    });

    it('denies an empty principalKey without writing', async () => {
      await expect(
        bindings.resolveOrEstablish({
          principalKey: '   ',
          productionMode: false,
          nowUtcMs: '2026-08-27T00:00:00.000Z',
        }),
      ).resolves.toEqual({ reason: 'missing', status: 'denied' });
    });

    it('returns null for an unknown principalKey', async () => {
      await expect(
        bindings.getByPrincipalKey('issuer:no-such-subject'),
      ).resolves.toBeNull();
    });
  },
);

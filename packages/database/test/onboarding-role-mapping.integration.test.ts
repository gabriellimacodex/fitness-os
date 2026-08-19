import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { principalRoleMappingIdSchema } from '@fitness-os/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresConnection } from '../src/connection.js';
import { createPostgresOnboardingRoleMappingRepository } from '../src/onboarding/index.js';
import { requireDisposableDatabaseUrl } from './postgres.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PRD 07 disposable onboarding role mapping persistence',
  () => {
    let connection: ReturnType<typeof createPostgresConnection>;
    let mappings: ReturnType<
      typeof createPostgresOnboardingRoleMappingRepository
    >;

    beforeAll(async () => {
      connection = createPostgresConnection(requireDisposableDatabaseUrl());
      mappings = createPostgresOnboardingRoleMappingRepository(connection);
      await connection.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await connection.db.execute(sql`DROP SCHEMA public CASCADE`);
      await connection.db.execute(sql`CREATE SCHEMA public`);
      await migrate(connection.db, { migrationsFolder });
    });

    beforeEach(async () => {
      await connection.db.execute(sql`TRUNCATE onboarding_role_mapping`);
    });

    afterAll(async () => {
      await connection.close();
    });

    it('puts, replays identical rows, and conflicts on mapping_id mismatch', async () => {
      const mappingId = principalRoleMappingIdSchema.parse(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      const record = {
        createdAt: '2026-08-19T12:00:00.000Z',
        mappingId,
        principalKey: 'principal-1',
        role: 'student' as const,
      };

      await expect(mappings.put(record)).resolves.toEqual({
        mapping: record,
        status: 'accepted',
      });

      const replay = await mappings.put({
        ...record,
        createdAt: '2026-08-19T12:05:00.000Z',
      });
      expect(replay.status).toBe('replay');
      expect(replay.mapping.mappingId).toBe(mappingId);
      expect(replay.mapping.createdAt).toBe(record.createdAt);

      const conflict = await mappings.put({
        createdAt: '2026-08-19T12:06:00.000Z',
        mappingId: principalRoleMappingIdSchema.parse(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
        principalKey: 'principal-1',
        role: 'student',
      });
      expect(conflict.status).toBe('conflict');
      expect(conflict.mapping.mappingId).toBe(mappingId);

      await expect(mappings.get(mappingId)).resolves.toEqual(record);
      await expect(mappings.listByPrincipal('principal-1')).resolves.toEqual([
        record,
      ]);

      const coachId = principalRoleMappingIdSchema.parse(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      );
      const coach = {
        createdAt: '2026-08-19T12:07:00.000Z',
        mappingId: coachId,
        principalKey: 'principal-1',
        role: 'coach' as const,
      };
      await expect(mappings.put(coach)).resolves.toEqual({
        mapping: coach,
        status: 'accepted',
      });
      await expect(mappings.listByPrincipal('principal-1')).resolves.toEqual([
        record,
        coach,
      ]);
    });
  },
);

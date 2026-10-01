import { principalRoleMappingIdSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { SyntheticPrincipalRoleMappingRepository } from '../src/onboarding/synthetic-mappings.js';

describe('SyntheticPrincipalRoleMappingRepository', () => {
  it('accepts, replays identical puts, and conflicts on mapping_id mismatch', async () => {
    const repo = new SyntheticPrincipalRoleMappingRepository();
    const mappingId = principalRoleMappingIdSchema.parse(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const record = {
      createdAt: '2026-08-19T12:00:00.000Z',
      mappingId,
      principalKey: 'principal-1',
      role: 'student' as const,
    };

    await expect(repo.put(record)).resolves.toEqual({
      mapping: record,
      status: 'accepted',
    });
    await expect(
      repo.put({ ...record, createdAt: '2026-08-19T12:05:00.000Z' }),
    ).resolves.toEqual({ mapping: record, status: 'replay' });
    await expect(
      repo.put({
        createdAt: '2026-08-19T12:06:00.000Z',
        mappingId: principalRoleMappingIdSchema.parse(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
        principalKey: 'principal-1',
        role: 'student',
      }),
    ).resolves.toMatchObject({
      mapping: { mappingId },
      status: 'conflict',
    });
    await expect(repo.get(mappingId)).resolves.toEqual(record);
    await expect(repo.listByPrincipal('principal-1')).resolves.toEqual([
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
    await expect(repo.put(coach)).resolves.toEqual({
      mapping: coach,
      status: 'accepted',
    });
    await expect(repo.listByPrincipal('principal-1')).resolves.toEqual([
      record,
      coach,
    ]);
  });

  it('conflicts when a different principal/role reuses an existing mappingId', async () => {
    const repo = new SyntheticPrincipalRoleMappingRepository();
    const mappingId = principalRoleMappingIdSchema.parse(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const record = {
      createdAt: '2026-08-19T12:00:00.000Z',
      mappingId,
      principalKey: 'principal-1',
      role: 'student' as const,
    };
    await expect(repo.put(record)).resolves.toEqual({
      mapping: record,
      status: 'accepted',
    });

    // No mapping is indexed yet for principal-2/coach, so this reaches the
    // mappingId-keyed lookup and finds the unrelated principal-1/student
    // record instead.
    await expect(
      repo.put({
        createdAt: '2026-08-19T12:08:00.000Z',
        mappingId,
        principalKey: 'principal-2',
        role: 'coach' as const,
      }),
    ).resolves.toEqual({ mapping: record, status: 'conflict' });
    await expect(repo.listByPrincipal('principal-2')).resolves.toEqual([]);
  });
});

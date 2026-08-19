import { principalRoleMappingIdSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { SyntheticPrincipalRoleMappingRepository } from './synthetic-mappings.js';

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
  });
});

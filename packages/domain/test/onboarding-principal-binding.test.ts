import { describe, expect, it } from 'vitest';

import { SyntheticPrincipalBindingRepository } from '../src/onboarding/principal-binding.js';

describe('SyntheticPrincipalBindingRepository', () => {
  it('establishes then resolves a binding and denies productionMode', async () => {
    const repo = new SyntheticPrincipalBindingRepository();
    await expect(
      repo.resolveOrEstablish({
        nowUtcMs: '2026-08-19T12:00:00.000Z',
        principalKey: 'principal-a',
        productionMode: true,
      }),
    ).resolves.toEqual({
      reason: 'synthetic_in_production',
      status: 'denied',
    });

    const established = await repo.resolveOrEstablish({
      nowUtcMs: '2026-08-19T12:00:00.000Z',
      principalKey: 'principal-a',
      productionMode: false,
    });
    expect(established.status).toBe('established');

    const resolved = await repo.resolveOrEstablish({
      nowUtcMs: '2026-08-19T12:01:00.000Z',
      principalKey: 'principal-a',
      productionMode: false,
    });
    expect(resolved.status).toBe('resolved');
    if (
      established.status === 'established' &&
      resolved.status === 'resolved'
    ) {
      expect(resolved.binding).toEqual(established.binding);
    }
  });

  it('denies an empty or whitespace-only principal key as missing', async () => {
    const repo = new SyntheticPrincipalBindingRepository();

    await expect(
      repo.resolveOrEstablish({
        nowUtcMs: '2026-08-19T12:00:00.000Z',
        principalKey: '',
        productionMode: false,
      }),
    ).resolves.toEqual({ reason: 'missing', status: 'denied' });

    await expect(
      repo.resolveOrEstablish({
        nowUtcMs: '2026-08-19T12:00:00.000Z',
        principalKey: '   ',
        productionMode: false,
      }),
    ).resolves.toEqual({ reason: 'missing', status: 'denied' });

    expect(await repo.getByPrincipalKey('')).toBeNull();
  });

  it('reads an established binding by principal key and null for the unknown', async () => {
    const repo = new SyntheticPrincipalBindingRepository();

    expect(await repo.getByPrincipalKey('principal-b')).toBeNull();

    const established = await repo.resolveOrEstablish({
      nowUtcMs: '2026-08-19T12:00:00.000Z',
      principalKey: 'principal-b',
      productionMode: false,
    });
    expect(established.status).toBe('established');
    if (established.status !== 'established') {
      throw new Error('unreachable');
    }

    await expect(repo.getByPrincipalKey('principal-b')).resolves.toEqual(
      established.binding,
    );
    await expect(repo.getByPrincipalKey('principal-c')).resolves.toBeNull();
  });
});

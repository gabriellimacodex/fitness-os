import { describe, expect, it } from 'vitest';

import { SyntheticIdentitySessionStore } from '../src/onboarding/identity-session-store.js';

describe('SyntheticIdentitySessionStore', () => {
  it('puts, gets, and revokes opaque session records', async () => {
    const store = new SyntheticIdentitySessionStore();
    const record = {
      createdAt: '2026-08-19T12:00:00.000Z',
      expiresAt: '2026-08-19T13:00:00.000Z',
      principalKey: 'principal-a',
      sessionId: 'session-1',
    };
    await expect(store.put(record)).resolves.toBe('accepted');
    await expect(store.put(record)).resolves.toBe('conflict');
    await expect(store.get('session-1')).resolves.toEqual(record);
    await expect(store.revoke('session-1')).resolves.toBe('accepted');
    await expect(store.get('session-1')).resolves.toBeNull();
    await expect(store.revoke('session-1')).resolves.toBe('missing');
  });
});

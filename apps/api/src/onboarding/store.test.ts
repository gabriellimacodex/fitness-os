import { createHmac } from 'node:crypto';

import {
  invitationClaimSecretSchema,
  onboardingAttemptIdSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  compareAttemptOrder,
  createOnboardingStore,
  createStoredAttempt,
  decodeAttemptCursor,
  digestClaimSecret,
  encodeAttemptCursor,
  findInvitationBySecret,
  isAfterCursor,
  mappingIdFor,
} from './store.js';
import { seedInvitation, seedIssuedInvitation } from './test-store.js';

describe('onboarding store', () => {
  it('stores only a versioned HMAC of a claim secret', () => {
    const store = createOnboardingStore();
    const secret = invitationClaimSecretSchema.parse(
      'synthetic-claim-secret-01',
    );
    const invitation = seedIssuedInvitation(store, { claimSecret: secret });

    expect(invitation.claimDigest).toBe(
      digestClaimSecret(secret, store.pepper),
    );
    expect(invitation.claimDigest.startsWith('hmac-sha256.v1:')).toBe(true);
    expect(invitation.claimDigest).not.toContain(secret);
    expect(JSON.stringify([...store.invitations.values()])).not.toContain(
      secret,
    );
    expect(findInvitationBySecret(store, secret)?.invitationId).toBe(
      invitation.invitationId,
    );
  });

  it('derives a stable mapping identifier from principal and role', () => {
    expect(mappingIdFor('principal-a', 'student')).toBe(
      mappingIdFor('principal-a', 'student'),
    );
    expect(mappingIdFor('principal-a', 'student')).not.toBe(
      mappingIdFor('principal-a', 'coach'),
    );
    expect(mappingIdFor('principal-a', 'student')).not.toBe(
      mappingIdFor('principal-b', 'student'),
    );
  });

  it('round-trips an attempt cursor through encode/decode', () => {
    const store = createOnboardingStore();
    const cursor = encodeAttemptCursor(
      store,
      '2026-08-28T00:00:00.000Z',
      'attempt-01',
    );

    expect(decodeAttemptCursor(store, cursor)).toEqual({
      createdAt: '2026-08-28T00:00:00.000Z',
      attemptId: 'attempt-01',
    });
  });

  it('rejects a cursor whose MAC has been tampered with at the same length', () => {
    const store = createOnboardingStore();
    const cursor = encodeAttemptCursor(
      store,
      '2026-08-28T00:00:00.000Z',
      'attempt-01',
    );
    const macStart = cursor.length - 22;
    const originalMacChar = cursor[macStart];
    const flippedMacChar = originalMacChar === 'a' ? 'b' : 'a';
    const tampered =
      cursor.slice(0, macStart) + flippedMacChar + cursor.slice(macStart + 1);

    expect(tampered.length).toBe(cursor.length);
    expect(decodeAttemptCursor(store, tampered)).toBeNull();
  });

  it('rejects a correctly-signed cursor whose payload has no separator', () => {
    const store = createOnboardingStore();
    const payload = Buffer.from('no-separator-here', 'utf8').toString(
      'base64url',
    );
    const mac = createHmac('sha256', store.pepper)
      .update(payload, 'utf8')
      .digest('base64url')
      .slice(0, 22);

    expect(decodeAttemptCursor(store, `${payload}${mac}`)).toBeNull();
  });

  it('orders and cursors attempts by attemptId when createdAt ties', () => {
    const store = createOnboardingStore();
    const invitation = seedInvitation(store, {
      claimSecret: invitationClaimSecretSchema.parse(
        'synthetic-claim-secret-02',
      ),
    });
    const createdAt = '2026-08-28T00:00:00.000Z';
    const earlier = createStoredAttempt(
      invitation,
      1,
      'principal-a',
      createdAt,
      onboardingAttemptIdSchema.parse('00000000-0000-4000-8000-000000000001'),
    );
    const later = createStoredAttempt(
      invitation,
      2,
      'principal-a',
      createdAt,
      onboardingAttemptIdSchema.parse('00000000-0000-4000-8000-000000000002'),
    );

    expect(compareAttemptOrder(earlier, later)).toBeLessThan(0);
    expect(compareAttemptOrder(later, earlier)).toBeGreaterThan(0);

    const cursor = {
      createdAt,
      attemptId: earlier.detail.attemptId,
    };

    expect(isAfterCursor(later, cursor)).toBe(true);
    expect(isAfterCursor(earlier, cursor)).toBe(false);
  });
});

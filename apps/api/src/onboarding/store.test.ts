import { invitationClaimSecretSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import {
  createOnboardingStore,
  digestClaimSecret,
  findInvitationBySecret,
  mappingIdFor,
  seedIssuedInvitation,
} from './store.js';

describe('onboarding store', () => {
  it('stores only the digest of a claim secret', () => {
    const store = createOnboardingStore();
    const secret = invitationClaimSecretSchema.parse(
      'synthetic-claim-secret-01',
    );
    const invitation = seedIssuedInvitation(store, { claimSecret: secret });

    expect(invitation.claimDigest).toBe(digestClaimSecret(secret));
    expect(invitation.claimDigest).not.toBe(secret);
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
});

import { describe, expect, it } from 'vitest';

import {
  claimInvitation,
  revokeInvitation,
  type InvitationState,
} from '../src/onboarding/invitation.js';

const TERMINAL_STATES: readonly InvitationState[] = [
  'claimed',
  'revoked',
  'expired',
];

describe('claimInvitation', () => {
  it('advances an issued invitation to claimed', () => {
    expect(claimInvitation('issued')).toEqual({
      state: 'claimed',
      status: 'advanced',
    });
  });

  it.each(TERMINAL_STATES)(
    'reports already_terminal for a %s invitation without mutating state',
    (state) => {
      expect(claimInvitation(state)).toEqual({
        state,
        status: 'already_terminal',
      });
    },
  );
});

describe('revokeInvitation', () => {
  it('advances an issued invitation to revoked', () => {
    expect(revokeInvitation('issued')).toEqual({
      state: 'revoked',
      status: 'advanced',
    });
  });

  it.each(TERMINAL_STATES)(
    'reports already_terminal for a %s invitation without mutating state',
    (state) => {
      expect(revokeInvitation(state)).toEqual({
        state,
        status: 'already_terminal',
      });
    },
  );
});

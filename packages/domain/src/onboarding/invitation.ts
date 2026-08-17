export type InvitationState = 'issued' | 'claimed' | 'revoked' | 'expired';

export type InvitationMutationResult =
  | { status: 'advanced'; state: InvitationState }
  | { status: 'already_terminal'; state: InvitationState }
  | { status: 'invalid' };

const TERMINAL: ReadonlySet<InvitationState> = new Set([
  'claimed',
  'revoked',
  'expired',
]);

export function inspectInvitationState(
  state: InvitationState,
): 'issued' | 'invalid_or_unavailable' {
  return state === 'issued' ? 'issued' : 'invalid_or_unavailable';
}

export function claimInvitation(
  state: InvitationState,
): InvitationMutationResult {
  if (TERMINAL.has(state)) {
    return { state, status: 'already_terminal' };
  }

  if (state !== 'issued') {
    return { status: 'invalid' };
  }

  return { state: 'claimed', status: 'advanced' };
}

export function revokeInvitation(
  state: InvitationState,
): InvitationMutationResult {
  if (TERMINAL.has(state)) {
    return { state, status: 'already_terminal' };
  }

  return { state: 'revoked', status: 'advanced' };
}

export type CoachInvitationStatus =
  'issued' | 'claimed' | 'revoked' | 'expired';

export type CoachInvitationSummary = {
  invitationId: string;
  status: CoachInvitationStatus;
  createdAt: string;
  expiresAt: string;
};

export type CoachInvitationsState =
  | { status: 'empty' }
  | { status: 'ready'; items: readonly CoachInvitationSummary[] }
  | { status: 'unavailable' };

export function CoachInvitationsView({
  state,
}: {
  state: CoachInvitationsState;
}) {
  if (state.status === 'unavailable') {
    return (
      <main className="catalog">
        <h1>Student invitations</h1>
        <p>Student invitations are temporarily unavailable. Try again.</p>
      </main>
    );
  }

  if (state.status === 'empty') {
    return (
      <main className="catalog">
        <h1>Student invitations</h1>
        <p>You have not issued any student invitations yet.</p>
      </main>
    );
  }

  return (
    <main className="catalog">
      <h1>Student invitations</h1>
      <ul>
        {state.items.map((item) => (
          <li key={item.invitationId}>
            <p>Status: {item.status}</p>
            <p>Issued {item.createdAt}</p>
            <p>Expires {item.expiresAt}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function CoachInvitationIssuedView({
  claimSecret,
}: {
  claimSecret: string;
}) {
  return (
    <main className="catalog">
      <h1>Invitation issued</h1>
      <p>Copy this claim code now. It will not be shown again.</p>
      <p>{claimSecret}</p>
    </main>
  );
}

/**
 * Safe outcomes for a coach-initiated invitation revoke, mapped from the
 * frozen PRD 07 operation protocol (`operationStateSchema`) and the
 * revoke command's closed result taxonomy
 * (`onboardingCommandResultSchema`'s `revoke_student_invitation` /
 * `invalid_or_unavailable` variants). `resolved` covers both a fresh
 * revoke and an idempotent replay against an invitation that was already
 * claimed, revoked, or expired: revoke is the coach's own action on their
 * own invitation, so reporting its current status is not a new disclosure
 * beyond what the invitations list already shows.
 */
export type CoachRevocationOutcome =
  | { status: 'pending' }
  | { status: 'resolved'; invitationStatus: CoachInvitationStatus }
  | { status: 'input_mismatch' }
  | { status: 'unavailable' };

export function CoachRevocationOutcomeView({
  outcome,
}: {
  outcome: CoachRevocationOutcome;
}) {
  if (outcome.status === 'pending') {
    return (
      <main className="catalog">
        <h1>Revoking invitation</h1>
        <p>Your request is still being processed. Check again shortly.</p>
      </main>
    );
  }

  if (outcome.status === 'input_mismatch') {
    return (
      <main className="catalog">
        <h1>Revoking invitation</h1>
        <p>This request could not be matched to your last action. Try again.</p>
      </main>
    );
  }

  if (outcome.status === 'unavailable') {
    return (
      <main className="catalog">
        <h1>Revoking invitation</h1>
        <p>This invitation could not be revoked right now. Try again.</p>
      </main>
    );
  }

  return (
    <main className="catalog">
      <h1>Revoking invitation</h1>
      <p>This invitation is now {outcome.invitationStatus}.</p>
    </main>
  );
}

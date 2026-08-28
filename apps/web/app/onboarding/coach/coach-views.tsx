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
  | { status: 'ready'; items: readonly CoachInvitationSummary[] };

export function CoachInvitationsView({
  state,
}: {
  state: CoachInvitationsState;
}) {
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

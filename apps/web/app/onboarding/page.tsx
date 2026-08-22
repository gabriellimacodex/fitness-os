export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface OnboardingPageProps {
  searchParams: Promise<{ claim?: string }>;
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const { claim } = await searchParams;
  const secret = claim?.trim() ?? '';
  const result =
    secret === '' ? 'idle' : secret.length < 22 ? 'too_short' : 'needs_session';

  return (
    <main className="onboard">
      <p className="kicker">Join</p>
      <h1>Invitation</h1>
      <p className="note">
        Paste the one-time code from a coach. Sign-in is not live, so a valid
        code cannot be claimed yet.
      </p>
      <form className="field" action="/onboarding" method="get">
        <label htmlFor="claim-secret">Invitation code</label>
        <input
          autoComplete="off"
          defaultValue={secret}
          id="claim-secret"
          name="claim"
          placeholder="Paste the one-time code"
          spellCheck={false}
        />
        <button type="submit">Inspect invitation</button>
      </form>
      {result === 'too_short' ? (
        <p className="banner">That code is too short to inspect.</p>
      ) : null}
      {result === 'needs_session' ? (
        <p className="banner">
          Code received. A signed-in session is required before inspect can run.
          Dual-role and self-coach claims stay blocked.
        </p>
      ) : null}
      <ol className="rules">
        <li>A student joins with one invitation.</li>
        <li>At most four open attempts.</li>
        <li>A second role cannot be claimed.</li>
      </ol>
    </main>
  );
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function OnboardingPage() {
  return (
    <main className="onboard">
      <a className="back" href="/">
        Home
      </a>
      <p className="kicker">Join</p>
      <h1>Invitation</h1>
      <p className="note">
        Real sign-in is not on yet. This screen is the student join path. A
        coach invitation secret will land here later.
      </p>
      <form className="field" action="/onboarding" method="get">
        <label htmlFor="claim-secret">Invitation code</label>
        <input
          autoComplete="off"
          id="claim-secret"
          name="claim"
          placeholder="Paste the one-time code"
          spellCheck={false}
        />
        <button type="submit">Inspect invitation</button>
      </form>
      <p className="note">
        Dual-role and self-coach claims stay blocked. Production onboarding
        waits on privacy decisions.
      </p>
    </main>
  );
}

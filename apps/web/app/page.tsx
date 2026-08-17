export default function HomePage() {
  return (
    <main className="shell">
      <p className="kicker">Student first</p>
      <h1 className="display">Fitness OS</h1>
      <div className="bar" />
      <p className="lede">
        Guidance you can read on a phone. The same words, later, on a coach
        desk.
      </p>
      <nav className="doors" aria-label="Start">
        <a className="door" href="/movements">
          <strong>Movements</strong>
          <span>Read how a squat and hinge are set up.</span>
        </a>
        <a className="door" href="/onboarding">
          <strong>Join</strong>
          <span>Invitation flow. Synthetic only for now.</span>
        </a>
      </nav>
    </main>
  );
}

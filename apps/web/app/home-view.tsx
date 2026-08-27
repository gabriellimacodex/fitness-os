import type { MovementSummary } from '@fitness-os/schemas';

export function HomeView({ today }: { today?: MovementSummary }) {
  return (
    <main className="shell">
      <p className="kicker">On the floor</p>
      <h1 className="display">Open the plate</h1>
      <div className="bar" />
      {today === undefined ? (
        <p className="lede">
          No movement is ready. The library stays empty until guidance is
          loaded.
        </p>
      ) : (
        <a className="today" href={`/movements/${today.movementId}`}>
          <p className="kicker">Today</p>
          <strong>{today.name}</strong>
          <span>{today.summary}</span>
        </a>
      )}
      <nav className="doors" aria-label="Start">
        <a className="door" href="/movements">
          <strong>Library</strong>
          <span>Read every preview movement.</span>
        </a>
        <a className="door" href="/onboarding">
          <strong>Join</strong>
          <span>Use an invitation code. Sign-in is not live.</span>
        </a>
      </nav>
    </main>
  );
}

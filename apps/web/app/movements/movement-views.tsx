import type { MovementDetail, MovementSummary } from '@fitness-os/schemas';

export type CatalogLoadState =
  | { status: 'empty' }
  | { status: 'ready'; items: readonly MovementSummary[] }
  | { status: 'unavailable' };

export type MovementLoadState =
  | { status: 'ready'; movement: MovementDetail }
  | { status: 'not_found' }
  | { status: 'unavailable' };

export function CatalogUnavailable() {
  return (
    <main className="catalog">
      <h1>Movements</h1>
      <p>Movement guidance is temporarily unavailable. Try again.</p>
    </main>
  );
}

export function MovementsListView({ state }: { state: CatalogLoadState }) {
  if (state.status === 'unavailable') {
    return <CatalogUnavailable />;
  }

  if (state.status === 'empty') {
    return (
      <main className="catalog">
        <h1>Movements</h1>
        <p>No published movements are available yet.</p>
      </main>
    );
  }

  return (
    <main className="catalog">
      <h1>Movements</h1>
      <ul>
        {state.items.map((item) => (
          <li key={item.movementId}>
            <a href={`/movements/${item.movementId}`}>{item.name}</a>
            <p>{item.summary}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function MovementDetailView({ state }: { state: MovementLoadState }) {
  if (state.status === 'unavailable') {
    return (
      <main className="catalog">
        <h1>Movement</h1>
        <p>Movement guidance is temporarily unavailable. Try again.</p>
        <a href="/movements">Back to movements</a>
      </main>
    );
  }

  if (state.status === 'not_found') {
    return (
      <main className="catalog">
        <h1>Movement not found</h1>
        <p>That movement is not available.</p>
        <a href="/movements">Back to movements</a>
      </main>
    );
  }

  const { movement } = state;

  return (
    <main className="catalog">
      <p>
        <a href="/movements">Back to movements</a>
      </p>
      <h1>{movement.name}</h1>
      <p>{movement.summary}</p>
      <p>Content version {movement.contentVersion}</p>
      <section>
        <h2>Setup</h2>
        <ul>
          {movement.setup.map((item, index) => (
            <li key={`setup-${String(index)}`}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Steps</h2>
        <ol>
          {movement.steps.map((item, index) => (
            <li key={`step-${String(index)}`}>{item}</li>
          ))}
        </ol>
      </section>
      <section>
        <h2>Cues</h2>
        <ul>
          {movement.cues.map((item, index) => (
            <li key={`cue-${String(index)}`}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Common mistakes</h2>
        <ul>
          {movement.commonMistakes.map((item, index) => (
            <li key={`mistake-${String(index)}`}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Safety</h2>
        <ul>
          {movement.safetyNotes.map((item, index) => (
            <li key={`safety-${String(index)}`}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

'use client';

import { useState } from 'react';

export function MovementSession({ steps }: { steps: readonly string[] }) {
  const [index, setIndex] = useState(0);
  const current = steps[index] ?? steps[0] ?? '';
  const last = index >= steps.length - 1;

  return (
    <section className="session">
      <h2>
        Step {index + 1} of {steps.length}
      </h2>
      <p className="session-line">{current}</p>
      <div className="session-actions">
        <button
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          type="button"
        >
          Previous
        </button>
        <button
          disabled={last}
          onClick={() =>
            setIndex((value) => Math.min(steps.length - 1, value + 1))
          }
          type="button"
        >
          Next step
        </button>
      </div>
    </section>
  );
}

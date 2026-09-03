import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { movementDetailSchema } from '@fitness-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ApiClientError, ApiProtocolError } from '../../../lib/api-client';
import { MovementDetailView } from '../movement-views';
import { loadMovement } from './page';

const squat = movementDetailSchema.parse({
  movementId: 'bodyweight-squat',
  contentVersion: 1,
  name: 'Bodyweight Squat',
  summary: 'A controlled squat using body weight and a stable stance.',
  setup: ['Stand with feet about hip-width apart.'],
  steps: ['Lower with control.', 'Return to standing.'],
  cues: ['Keep the movement slow and even.'],
  commonMistakes: ['Dropping quickly without control.'],
  safetyNotes: [
    'Stop if you feel pain, dizziness, or loss of control and seek qualified help as appropriate.',
  ],
});

describe('MovementDetailView', () => {
  it('renders ordered steps and a return link', () => {
    const markup = renderToStaticMarkup(
      <MovementDetailView state={{ movement: squat, status: 'ready' }} />,
    );

    expect(markup).toContain('<ol');
    expect(markup).toContain('Lower with control.');
    expect(markup).toContain('href="/movements"');
    expect(markup).toContain('Content version 1');
    expect(markup).toContain('<h2>Safety</h2>');
  });

  it('renders a safe unavailable state without raw internals', () => {
    const markup = renderToStaticMarkup(
      <MovementDetailView state={{ status: 'unavailable' }} />,
    );

    expect(markup).toContain('temporarily unavailable');
    expect(markup).not.toContain('stack');
    expect(markup).not.toContain('127.0.0.1');
  });
});

describe('loadMovement', () => {
  it('returns a validated detail', async () => {
    await expect(
      loadMovement('bodyweight-squat', {
        movement: async () => squat,
      } as never),
    ).resolves.toEqual({ movement: squat, status: 'ready' });
  });

  it('maps a schema-valid not-found error', async () => {
    await expect(
      loadMovement('bodyweight-squat', {
        movement: async () => {
          throw new ApiClientError(
            'NOT_FOUND',
            404,
            'req-1',
            'Resource not found',
          );
        },
      } as never),
    ).resolves.toEqual({ status: 'not_found' });
  });

  it('maps an invalid API origin to the unavailable state', async () => {
    const previous = process.env.API_BASE_URL;
    process.env.API_BASE_URL = 'ftp://example.com';

    await expect(loadMovement('bodyweight-squat')).resolves.toEqual({
      status: 'unavailable',
    });

    if (previous === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = previous;
    }
  });

  it('maps protocol failure to unavailable without exposing the error', async () => {
    const state = await loadMovement('bodyweight-squat', {
      movement: async () => {
        throw new ApiProtocolError();
      },
    } as never);

    expect(state).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(state)).not.toContain('protocol');
  });
});

describe('web movement boundary', () => {
  it('does not import domain or database packages', () => {
    const pageSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'page.tsx'),
      'utf8',
    );

    expect(pageSource).not.toContain('@fitness-os/domain');
    expect(pageSource).not.toContain('@fitness-os/database');
  });
});

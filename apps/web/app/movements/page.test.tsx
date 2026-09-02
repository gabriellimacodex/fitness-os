import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { movementSummarySchema } from '@fitness-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ApiProtocolError } from '../../lib/api-client';
import { loadMovements } from './page';
import { MovementsListView } from './movement-views';

const squat = movementSummarySchema.parse({
  movementId: 'bodyweight-squat',
  contentVersion: 1,
  name: 'Bodyweight Squat',
  summary: 'A controlled squat using body weight and a stable stance.',
});

describe('MovementsListView', () => {
  it('renders the empty catalog state', () => {
    const markup = renderToStaticMarkup(
      <MovementsListView state={{ status: 'empty' }} />,
    );

    expect(markup).toContain('<main');
    expect(markup).toContain('No published movements are available yet.');
    expect(markup).not.toContain('<ul');
  });

  it('renders linked summaries', () => {
    const markup = renderToStaticMarkup(
      <MovementsListView state={{ items: [squat], status: 'ready' }} />,
    );

    expect(markup).toContain('href="/movements/bodyweight-squat"');
    expect(markup).toContain('Bodyweight Squat');
    expect(markup).toContain('<ul');
  });

  it('renders a safe unavailable state', () => {
    const markup = renderToStaticMarkup(
      <MovementsListView state={{ status: 'unavailable' }} />,
    );

    expect(markup).toContain('temporarily unavailable');
    expect(markup).not.toContain('127.0.0.1');
  });
});

describe('loadMovements', () => {
  it('maps an empty API list to the empty state', async () => {
    await expect(
      loadMovements({
        movements: async () => ({ items: [] }),
      } as never),
    ).resolves.toEqual({ status: 'empty' });
  });

  it('maps an invalid API origin to the unavailable state', async () => {
    const previous = process.env.API_BASE_URL;
    process.env.API_BASE_URL = 'ftp://example.com';

    await expect(loadMovements()).resolves.toEqual({ status: 'unavailable' });

    if (previous === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = previous;
    }
  });

  it('maps protocol failure to unavailable without exposing the error', async () => {
    const state = await loadMovements({
      movements: async () => {
        throw new ApiProtocolError();
      },
    } as never);

    expect(state).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(state)).not.toContain('protocol');
  });
});

describe('web movement boundary', () => {
  it('does not import domain or database packages', async () => {
    const source = await vi.importActual<typeof import('./page')>('./page');

    expect(source.default).toEqual(expect.any(Function));

    const pageSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'page.tsx'),
      'utf8',
    );

    expect(pageSource).not.toContain('@fitness-os/domain');
    expect(pageSource).not.toContain('@fitness-os/database');
  });
});

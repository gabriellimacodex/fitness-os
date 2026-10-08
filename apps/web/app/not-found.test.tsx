import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import NotFoundPage from './not-found';

describe('NotFoundPage', () => {
  it('renders a generic not-found message', () => {
    const markup = renderToStaticMarkup(<NotFoundPage />);

    expect(markup).toContain('<main');
    expect(markup).toContain('Not found');
    expect(markup).toContain('That page is not available.');
  });

  it('does not reveal why the page is unavailable', () => {
    const markup = renderToStaticMarkup(<NotFoundPage />);

    expect(markup).not.toMatch(
      /movement|onboarding|invitation|attempt|coach|privacy/i,
    );
  });
});

describe('web not-found boundary', () => {
  it('does not import domain or database packages', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./not-found.tsx', import.meta.url)),
      'utf8',
    );

    expect(source).not.toContain('@fitness-os/domain');
    expect(source).not.toContain('@fitness-os/database');
  });
});

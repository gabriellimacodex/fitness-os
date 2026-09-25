import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('foundation page', () => {
  it('renders only the foundation message', () => {
    const markup = renderToStaticMarkup(<HomePage />);
    const visibleText = markup
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    expect(visibleText).toContain('Fitness OS Engineering foundation ready.');
    expect(markup).toContain('href="/movements"');
  });
});

describe('web home boundary', () => {
  it('does not import domain or database packages', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./page.tsx', import.meta.url)),
      'utf8',
    );

    expect(source).not.toContain('@fitness-os/domain');
    expect(source).not.toContain('@fitness-os/database');
  });
});

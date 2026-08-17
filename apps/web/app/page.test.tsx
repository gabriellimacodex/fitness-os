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

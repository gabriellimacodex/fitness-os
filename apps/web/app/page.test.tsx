import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('home page', () => {
  it('opens the student and join doors', () => {
    const markup = renderToStaticMarkup(<HomePage />);

    expect(markup).toContain('Fitness OS');
    expect(markup).toContain('href="/movements"');
    expect(markup).toContain('href="/onboarding"');
  });
});

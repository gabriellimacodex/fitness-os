import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import OnboardingPage from './page';

describe('onboarding page', () => {
  it('renders the invitation shell without claiming production identity', () => {
    const markup = renderToStaticMarkup(<OnboardingPage />);

    expect(markup).toContain('Invitation');
    expect(markup).toContain('Invitation code');
    expect(markup).toContain('Real sign-in is not on yet');
  });
});

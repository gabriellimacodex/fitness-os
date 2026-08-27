import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import OnboardingPage from './page';

describe('onboarding page', () => {
  it('renders the invitation shell without claiming production identity', async () => {
    const markup = renderToStaticMarkup(
      await OnboardingPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain('Invitation');
    expect(markup).toContain('Invitation code');
    expect(markup).toContain('Sign-in is not live');
  });

  it('does not inspect a short code', async () => {
    const markup = renderToStaticMarkup(
      await OnboardingPage({
        searchParams: Promise.resolve({ claim: 'short' }),
      }),
    );

    expect(markup).toContain('too short');
    expect(markup).not.toContain('Code received');
  });
});

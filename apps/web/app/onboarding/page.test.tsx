import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InvitationLandingView } from './onboarding-views';
import OnboardingPage from './page';

describe('InvitationLandingView', () => {
  it('explains only that authentication is required', () => {
    const markup = renderToStaticMarkup(<InvitationLandingView />);

    expect(markup).toContain('<main');
    expect(markup).toContain('Sign in to continue.');
  });

  it('does not reveal a coach identity or invitation validity', () => {
    const markup = renderToStaticMarkup(<InvitationLandingView />);

    expect(markup).not.toMatch(/coach/i);
    expect(markup).not.toMatch(/invalid|expired|revoked|claimed/i);
  });
});

describe('OnboardingPage', () => {
  it('renders the invitation landing view', () => {
    const markup = renderToStaticMarkup(<OnboardingPage />);

    expect(markup).toContain('Sign in to continue.');
  });
});

describe('web onboarding boundary', () => {
  it('does not import domain or database packages', () => {
    for (const file of ['./page.tsx', './onboarding-views.tsx']) {
      const source = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        'utf8',
      );

      expect(source).not.toContain('@fitness-os/domain');
      expect(source).not.toContain('@fitness-os/database');
    }
  });
});

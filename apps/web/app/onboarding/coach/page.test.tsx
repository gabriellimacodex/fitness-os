import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CoachInvitationIssuedView, CoachInvitationsView } from './coach-views';
import CoachOnboardingPage from './page';

const sampleInvitation = {
  createdAt: '2026-08-28T00:00:00.000Z',
  expiresAt: '2026-08-29T00:00:00.000Z',
  invitationId: 'inv-1',
  status: 'issued',
} as const;

const sampleClaimSecret = 'ONE-TIME-CLAIM-SECRET';

describe('CoachInvitationsView', () => {
  it('renders the empty state without a list', () => {
    const markup = renderToStaticMarkup(
      <CoachInvitationsView state={{ status: 'empty' }} />,
    );

    expect(markup).toContain('<main');
    expect(markup).toContain(
      'You have not issued any student invitations yet.',
    );
    expect(markup).not.toContain('<ul');
  });

  it('renders only safe status, creation time, and expiry for each invitation', () => {
    const markup = renderToStaticMarkup(
      <CoachInvitationsView
        state={{ items: [sampleInvitation], status: 'ready' }}
      />,
    );

    expect(markup).toContain('<ul');
    expect(markup).toContain('Status: issued');
    expect(markup).toContain(sampleInvitation.createdAt);
    expect(markup).toContain(sampleInvitation.expiresAt);
  });

  it('never renders claim material, a student profile, or contact detail', () => {
    const markup = renderToStaticMarkup(
      <CoachInvitationsView
        state={{ items: [sampleInvitation], status: 'ready' }}
      />,
    );

    expect(markup).not.toContain(sampleClaimSecret);
    expect(markup).not.toMatch(/email|phone|profile|roster/i);
  });
});

describe('CoachInvitationIssuedView', () => {
  it('shows the one-time claim secret exactly once with a warning', () => {
    const markup = renderToStaticMarkup(
      <CoachInvitationIssuedView claimSecret={sampleClaimSecret} />,
    );

    expect(markup).toContain(sampleClaimSecret);
    expect(markup).toContain('will not be shown again');
    expect(markup.split(sampleClaimSecret)).toHaveLength(2);
  });
});

describe('CoachOnboardingPage', () => {
  it('defaults to the empty invitations state', () => {
    const markup = renderToStaticMarkup(<CoachOnboardingPage />);

    expect(markup).toContain(
      'You have not issued any student invitations yet.',
    );
  });
});

describe('web coach onboarding boundary', () => {
  it('does not import domain or database packages', () => {
    for (const file of ['./page.tsx', './coach-views.tsx']) {
      const source = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        'utf8',
      );

      expect(source).not.toContain('@fitness-os/domain');
      expect(source).not.toContain('@fitness-os/database');
    }
  });
});

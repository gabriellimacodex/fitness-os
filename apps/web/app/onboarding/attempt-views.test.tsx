import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  attemptDetailSchema,
  onboardingAttemptIdSchema,
  policyHandoffSchema,
  type AttemptDetail,
} from '@fitness-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  StudentOnboardingStateView,
  type StudentOnboardingState,
} from './attempt-views';

const attemptId = onboardingAttemptIdSchema.parse(
  '00000000-0000-4000-8000-000000000001',
);
const predecessorAttemptId = onboardingAttemptIdSchema.parse(
  '00000000-0000-4000-8000-000000000002',
);
const invitationId = '00000000-0000-4000-8000-0000000000a1';
const interactionId = '00000000-0000-4000-8000-0000000000b1';
const packageId = '00000000-0000-4000-8000-0000000000c1';

const samplePolicy = policyHandoffSchema.parse({
  evidenceId: null,
  integrityDigest: 'a'.repeat(64),
  interactionId,
  packageId,
  packageVersion: 1,
  status: 'interaction_pending',
});

const baseAttempt = attemptDetailSchema.parse({
  attemptId,
  invitationId,
  lifecycle: 'policy_pending',
  ordinal: 1,
  policy: null,
  predecessorAttemptId: null,
  proposedRole: 'student',
  purpose: 'student_onboarding',
  terminalReason: null,
}) satisfies AttemptDetail;

function render(state: StudentOnboardingState): string {
  return renderToStaticMarkup(<StudentOnboardingStateView state={state} />);
}

describe('StudentOnboardingStateView selection and cardinality states', () => {
  it('reports that nothing is in progress for no_active_attempt', () => {
    const markup = render({ status: 'no_active_attempt' });

    expect(markup).toContain('<main');
    expect(markup).toContain('You have no onboarding in progress.');
    expect(markup).not.toContain('<ul');
  });

  it('lists only ordinal and lifecycle label when selection is required', () => {
    const markup = render({
      options: [
        { attemptId, lifecycle: 'policy_pending', ordinal: 1 },
        {
          attemptId: predecessorAttemptId,
          lifecycle: 'ready_to_claim',
          ordinal: 2,
        },
      ],
      status: 'selection_required',
    });

    expect(markup).toContain('More than one onboarding is in progress.');
    expect(markup).toContain('Onboarding 1');
    expect(markup).toContain('In progress');
    expect(markup).toContain('Onboarding 2');
    expect(markup).toContain('Ready to finish');
    expect(markup).not.toContain(attemptId);
    expect(markup).not.toContain(predecessorAttemptId);
  });

  it('renders the remaining lifecycle labels in a selection list', () => {
    const markup = render({
      options: [
        { attemptId, lifecycle: 'completed', ordinal: 3 },
        { attemptId: predecessorAttemptId, lifecycle: 'terminal', ordinal: 4 },
      ],
      status: 'selection_required',
    });

    expect(markup).toContain('Complete');
    expect(markup).toContain('Ended');
  });

  it('explains the fixed attempt cap without naming an invitation', () => {
    const markup = render({ status: 'active_attempt_limit_reached' });

    expect(markup).toContain('You have reached the limit of onboarding');
    expect(markup).not.toMatch(/invitation|coach/i);
  });
});

describe('StudentOnboardingStateView operation and boundary states', () => {
  it('renders pending and reconciling operations identically', () => {
    const pending = render({ status: 'operation_pending' });
    const reconciling = render({ status: 'operation_reconciling' });

    expect(pending).toContain('still being processed');
    expect(pending).toBe(reconciling);
  });

  it('renders a retryable message when the dependency is unavailable', () => {
    const markup = render({ status: 'unavailable' });

    expect(markup).toContain('Onboarding is temporarily unavailable.');
  });
});

describe('StudentOnboardingStateView selected attempt states', () => {
  it('asks the student to finish a pending policy interaction', () => {
    const markup = render({
      attempt: { ...baseAttempt, policy: samplePolicy },
      status: 'attempt_selected',
    });

    expect(markup).toContain('Finish the required step, then return here.');
  });

  it('reports a ready gateway return without exposing evidence identifiers', () => {
    const markup = render({
      attempt: {
        ...baseAttempt,
        policy: { ...samplePolicy, status: 'ready' },
      },
      status: 'attempt_selected',
    });

    expect(markup).toContain('The required step is complete.');
    expect(markup).not.toContain(samplePolicy.integrityDigest);
    expect(markup).not.toContain(samplePolicy.interactionId);
    expect(markup).not.toContain(samplePolicy.packageId);
  });

  it('reports a blocked gateway return generically', () => {
    const markup = render({
      attempt: {
        ...baseAttempt,
        policy: { ...samplePolicy, status: 'blocked' },
      },
      status: 'attempt_selected',
    });

    expect(markup).toContain('This onboarding cannot continue right now.');
  });

  it('reports a policy-pending attempt with no handoff yet', () => {
    const markup = render({
      attempt: baseAttempt,
      status: 'attempt_selected',
    });

    expect(markup).toContain('Preparing the next step.');
  });

  it('reports a claimable attempt', () => {
    const markup = render({
      attempt: { ...baseAttempt, lifecycle: 'ready_to_claim' },
      status: 'attempt_selected',
    });

    expect(markup).toContain('You can finish onboarding now.');
  });

  it('reports a completed attempt', () => {
    const markup = render({
      attempt: { ...baseAttempt, lifecycle: 'completed' },
      status: 'attempt_selected',
    });

    expect(markup).toContain('Onboarding is complete.');
  });

  it('names only the terminal reasons that describe the student own attempt', () => {
    const cases = [
      ['abandoned', 'You ended this onboarding.'],
      ['expired', 'This onboarding expired.'],
      ['superseded', 'A newer onboarding replaced this one.'],
    ] as const;

    for (const [terminalReason, message] of cases) {
      const markup = render({
        attempt: { ...baseAttempt, lifecycle: 'terminal', terminalReason },
        status: 'attempt_selected',
      });

      expect(markup).toContain(message);
    }
  });

  it('collapses every disclosure-sensitive terminal reason into one message', () => {
    const sensitive = [
      'invitation_unavailable',
      'mapping_conflict',
      'hard_disabled',
      null,
    ] as const;

    const rendered = sensitive.map((terminalReason) =>
      render({
        attempt: { ...baseAttempt, lifecycle: 'terminal', terminalReason },
        status: 'attempt_selected',
      }),
    );

    expect(rendered[0]).toContain('This onboarding is no longer available.');
    for (const markup of rendered) {
      expect(markup).toBe(rendered[0]);
    }
  });

  it('never discloses role, purpose, invitation, or predecessor scope', () => {
    const markup = render({
      attempt: attemptDetailSchema.parse({
        ...baseAttempt,
        lifecycle: 'terminal',
        policy: samplePolicy,
        predecessorAttemptId,
        terminalReason: 'mapping_conflict',
      }),
      status: 'attempt_selected',
    });

    expect(markup).not.toMatch(/student|coach|mapping_conflict/i);
    expect(markup).not.toContain(invitationId);
    expect(markup).not.toContain(attemptId);
    expect(markup).not.toContain(predecessorAttemptId);
  });
});

describe('web onboarding attempt-view boundary', () => {
  it('does not import domain or database packages', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./attempt-views.tsx', import.meta.url)),
      'utf8',
    );

    expect(source).not.toContain('@fitness-os/domain');
    expect(source).not.toContain('@fitness-os/database');
  });
});

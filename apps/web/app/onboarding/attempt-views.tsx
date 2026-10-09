import type { ReactNode } from 'react';

import type { AttemptDetail } from '@fitness-os/schemas';

/**
 * Student-facing onboarding states, mapped from the frozen PRD 07 closed
 * result taxonomy (`selectionResultSchema`, `operationStateSchema`,
 * `boundaryOutcomeSchema`, `attemptLifecycleSchema`).
 *
 * The option shape deliberately omits `proposedRole` and `purpose` from
 * `attemptSummarySchema`: the student view never discloses role or invitation
 * scope, so a competing-principal, dual-role, or self-coach situation stays
 * indistinguishable from any other unavailable outcome.
 */
export type OnboardingAttemptOption = {
  attemptId: AttemptDetail['attemptId'];
  ordinal: AttemptDetail['ordinal'];
  lifecycle: AttemptDetail['lifecycle'];
};

export type StudentOnboardingState =
  | { status: 'no_active_attempt' }
  | {
      status: 'selection_required';
      options: readonly OnboardingAttemptOption[];
    }
  | { status: 'active_attempt_limit_reached' }
  | { status: 'attempt_selected'; attempt: AttemptDetail }
  | { status: 'operation_pending' }
  | { status: 'operation_reconciling' }
  | { status: 'unavailable' };

const HEADING = 'Your onboarding';

const LIFECYCLE_LABEL: Record<AttemptDetail['lifecycle'], string> = {
  completed: 'Complete',
  policy_pending: 'In progress',
  ready_to_claim: 'Ready to finish',
  terminal: 'Ended',
};

/**
 * Terminal reasons that describe the student's own attempt and are safe to
 * name. Every other reason — including `invitation_unavailable`,
 * `mapping_conflict`, and `hard_disabled` — falls through to one generic
 * message so denial causes are not distinguishable from one another.
 */
const SAFE_TERMINAL_MESSAGE: Partial<
  Record<NonNullable<AttemptDetail['terminalReason']>, string>
> = {
  abandoned: 'You ended this onboarding.',
  expired: 'This onboarding expired.',
  superseded: 'A newer onboarding replaced this one.',
};

const GENERIC_TERMINAL_MESSAGE = 'This onboarding is no longer available.';

function terminalMessage(reason: AttemptDetail['terminalReason']): string {
  if (reason === null) {
    return GENERIC_TERMINAL_MESSAGE;
  }

  return SAFE_TERMINAL_MESSAGE[reason] ?? GENERIC_TERMINAL_MESSAGE;
}

function selectedAttemptMessage(attempt: AttemptDetail): string {
  if (attempt.lifecycle === 'terminal') {
    return terminalMessage(attempt.terminalReason);
  }

  if (attempt.lifecycle === 'completed') {
    return 'Onboarding is complete.';
  }

  if (attempt.lifecycle === 'ready_to_claim') {
    return 'You can finish onboarding now.';
  }

  if (attempt.policy === null) {
    return 'Preparing the next step.';
  }

  if (attempt.policy.status === 'interaction_pending') {
    return 'Finish the required step, then return here.';
  }

  if (attempt.policy.status === 'ready') {
    return 'The required step is complete. You can finish onboarding.';
  }

  return 'This onboarding cannot continue right now.';
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="catalog">
      <h1>{HEADING}</h1>
      {children}
    </main>
  );
}

export function StudentOnboardingStateView({
  state,
}: {
  state: StudentOnboardingState;
}) {
  if (state.status === 'unavailable') {
    return (
      <Shell>
        <p>Onboarding is temporarily unavailable. Try again.</p>
      </Shell>
    );
  }

  // `operation_pending` and `operation_reconciling` share one message so a
  // caller cannot learn whether the server is still reconciling a prior write.
  if (
    state.status === 'operation_pending' ||
    state.status === 'operation_reconciling'
  ) {
    return (
      <Shell>
        <p>Your last request is still being processed. Check again shortly.</p>
      </Shell>
    );
  }

  if (state.status === 'no_active_attempt') {
    return (
      <Shell>
        <p>You have no onboarding in progress.</p>
      </Shell>
    );
  }

  if (state.status === 'active_attempt_limit_reached') {
    return (
      <Shell>
        <p>
          You have reached the limit of onboarding attempts. Finish or end one
          before starting another.
        </p>
      </Shell>
    );
  }

  if (state.status === 'selection_required') {
    return (
      <Shell>
        <p>More than one onboarding is in progress. Choose one to continue.</p>
        <ul>
          {state.options.map((option) => (
            <li key={option.attemptId}>
              <p>Onboarding {option.ordinal}</p>
              <p>{LIFECYCLE_LABEL[option.lifecycle]}</p>
            </li>
          ))}
        </ul>
      </Shell>
    );
  }

  return (
    <Shell>
      <p>{selectedAttemptMessage(state.attempt)}</p>
    </Shell>
  );
}

import {
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestStateSchema,
  type PrivacySubjectRequestReference,
  type PrivacySubjectRequestState,
  type PrivacyVerificationReference,
} from '@fitness-os/schemas';

export type SubjectRequestTransitionResult =
  | {
      status: 'advanced';
      request: PrivacySubjectRequestReference;
    }
  | {
      status: 'already_terminal';
      request: PrivacySubjectRequestReference;
    }
  | {
      status: 'invalid';
      reason:
        | 'illegal_transition'
        | 'verification_required'
        | 'synthetic_verification_in_production'
        | 'terminal_state';
    };

const TERMINAL: ReadonlySet<PrivacySubjectRequestState> = new Set([
  'completed',
  'cancelled',
  'denied',
]);

const FORWARD: Record<
  PrivacySubjectRequestState,
  ReadonlySet<PrivacySubjectRequestState>
> = {
  received: new Set(['verification_required', 'policy_blocked', 'cancelled']),
  verification_required: new Set([
    'ready',
    'policy_blocked',
    'cancelled',
    'denied',
  ]),
  policy_blocked: new Set(['verification_required', 'cancelled', 'denied']),
  ready: new Set(['in_progress', 'cancelled', 'denied']),
  in_progress: new Set([
    'partially_failed',
    'completed',
    'cancelled',
    'denied',
  ]),
  partially_failed: new Set([
    'in_progress',
    'completed',
    'cancelled',
    'denied',
  ]),
  completed: new Set(),
  cancelled: new Set(),
  denied: new Set(),
};

export function isTerminalSubjectRequestState(
  state: PrivacySubjectRequestState,
): boolean {
  return TERMINAL.has(state);
}

/**
 * Provider-neutral request state machine. Not a legal entitlement decision.
 * Moving to `ready` requires a verification reference; production mode rejects
 * synthetic verification.
 */
export function transitionSubjectRequest(input: {
  request: PrivacySubjectRequestReference;
  next: PrivacySubjectRequestState;
  updatedAt: string;
  verification?: PrivacyVerificationReference | null;
  productionMode?: boolean;
}): SubjectRequestTransitionResult {
  privacySubjectRequestStateSchema.parse(input.next);

  if (isTerminalSubjectRequestState(input.request.state)) {
    return { request: input.request, status: 'already_terminal' };
  }

  if (!FORWARD[input.request.state].has(input.next)) {
    return { reason: 'illegal_transition', status: 'invalid' };
  }

  let verification = input.request.verification;
  if (input.verification !== undefined) {
    verification = input.verification;
  }

  if (input.next === 'ready') {
    if (verification === null || verification === undefined) {
      return { reason: 'verification_required', status: 'invalid' };
    }

    if (input.productionMode === true && verification.synthetic) {
      return {
        reason: 'synthetic_verification_in_production',
        status: 'invalid',
      };
    }
  }

  const request = privacySubjectRequestReferenceSchema.parse({
    ...input.request,
    state: input.next,
    updatedAt: input.updatedAt,
    verification: verification ?? null,
  });

  return { request, status: 'advanced' };
}

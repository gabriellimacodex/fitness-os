import {
  type PrivacyCorrelationId,
  type PrivacyOperationId,
  type PrivacyProcessorCapability,
  type PrivacyProcessorStepReference,
  type PrivacySubjectRequestReference,
  type PrivacySubjectRequestTransitionId,
  type PrivacySubjectRequestTransitionReference,
} from '@fitness-os/schemas';

import { isTerminalSubjectRequestState } from './request.js';
import type {
  PrivacyProcessorStepRepository,
  PrivacySubjectRequestRepository,
} from './ports.js';

/**
 * Whether the request has finished all expected processor work. `incomplete`
 * covers both "no attempt yet" and "latest attempt is retryable_failure" —
 * both keep the request `in_progress`, never `completed`/`partially_failed`.
 */
export type RequestCompletionStatus =
  'incomplete' | 'completed' | 'partially_failed';

export interface ExpectedProcessorStep {
  processorId: string;
  capability: PrivacyProcessorCapability;
}

const pairKey = (processorId: string, capability: string): string =>
  `${processorId}:${capability}`;

/**
 * Derives request completion from the full append-only step history plus the
 * expected (processorId, capability) set. `steps` must be supplied in
 * recorded order; only the last step per pair is authoritative. A pair with
 * no step yet, or whose latest outcome is `retryable_failure`, keeps the
 * request `incomplete`. Once every pair has a terminal outcome, the request
 * is `completed` only when every pair `completed`; any `permanent_failure`
 * makes it `partially_failed`. Mirrors the coordinator, not a legal
 * entitlement decision.
 */
export function deriveRequestCompletionFromSteps(input: {
  expected: readonly ExpectedProcessorStep[];
  steps: readonly PrivacyProcessorStepReference[];
}): RequestCompletionStatus {
  if (input.expected.length === 0) {
    // An unpopulated expected set is not fulfilled work; it must never
    // vacuously read as `completed`.
    return 'incomplete';
  }

  const latestByPair = new Map<string, PrivacyProcessorStepReference>();
  for (const step of input.steps) {
    latestByPair.set(pairKey(step.processorId, step.capability), step);
  }

  let anyPermanentFailure = false;
  for (const expected of input.expected) {
    const latest = latestByPair.get(
      pairKey(expected.processorId, expected.capability),
    );
    if (latest === undefined || latest.outcome === 'retryable_failure') {
      return 'incomplete';
    }
    if (latest.outcome === 'permanent_failure') {
      anyPermanentFailure = true;
    }
  }

  return anyPermanentFailure ? 'partially_failed' : 'completed';
}

/**
 * Outcome of recording one processor step and, when the full expected set is
 * now terminal, guarding the request's forward transition on the derived
 * completion status rather than a caller-supplied `next` state.
 */
export type ProcessorStepAdvanceResult =
  | {
      /** Step recorded; expected work is not yet terminal, or the request
       * is not currently `in_progress`/`partially_failed` so no automatic
       * transition is attempted. */
      status: 'recorded';
      completion: RequestCompletionStatus;
      request: PrivacySubjectRequestReference;
    }
  | {
      /** The exact `stepId` was already recorded; treated as an idempotent
       * replay. No duplicate step is written. If the transition that should
       * have followed the original append never committed (e.g. a crash
       * between append and transition), this replay still evaluates and
       * attempts it — see `advanced`/`already_terminal`/`invalid_transition`
       * for that outcome. `step_conflict` itself is reported only when no
       * transition applies (work is still incomplete, or the request is not
       * currently `in_progress`/`partially_failed`). */
      status: 'step_conflict';
      completion: RequestCompletionStatus;
      request: PrivacySubjectRequestReference;
    }
  | {
      status: 'advanced';
      completion: 'completed' | 'partially_failed';
      request: PrivacySubjectRequestReference;
      transition: PrivacySubjectRequestTransitionReference;
    }
  | {
      status: 'already_terminal';
      completion: RequestCompletionStatus;
      request: PrivacySubjectRequestReference;
    }
  | {
      status: 'invalid_transition';
      // `not_found` is part of the repository's own invalid-reason contract;
      // it cannot occur here because `request` was already resolved above,
      // but the type is not narrowed across the repository call.
      reason:
        | 'illegal_transition'
        | 'verification_required'
        | 'synthetic_verification_in_production'
        | 'terminal_state'
        | 'not_found';
    }
  | { status: 'transition_conflict' }
  | { status: 'request_not_found' };

/**
 * Appends one append-only processor-step attempt and, only when the full
 * expected (processorId, capability) set is now terminal, advances the
 * subject request to the derived `completed`/`partially_failed` state
 * through the repository's own state-machine-enforcing `applyTransition`.
 *
 * The derived completion status is the sole source of the `next` state — no
 * caller may request an arbitrary terminal state directly through this path.
 * A request that is not currently `in_progress` or `partially_failed` (not
 * yet executing, or already terminal) records the step as evidence without
 * attempting a transition; an already-terminal request is reported as such.
 *
 * A replay of the exact same `stepId` (append `conflict`) still evaluates
 * and, if needed, attempts the transition — it does not assume the earlier
 * call's transition ever committed. This lets a caller recover a request
 * left stranded `in_progress`/`partially_failed` by a crash (or thrown
 * `applyTransition`) between the original append and its transition attempt,
 * simply by resubmitting the same step.
 */
export async function recordProcessorStepAndAdvanceRequest(input: {
  requests: PrivacySubjectRequestRepository;
  steps: PrivacyProcessorStepRepository;
  step: PrivacyProcessorStepReference;
  expected: readonly ExpectedProcessorStep[];
  updatedAt: string;
  transitionId: PrivacySubjectRequestTransitionId;
  operationId: PrivacyOperationId;
  correlationId: PrivacyCorrelationId;
  productionMode?: boolean;
}): Promise<ProcessorStepAdvanceResult> {
  const request = await input.requests.get(input.step.requestId);
  if (request === null) {
    return { status: 'request_not_found' };
  }

  const appendResult = await input.steps.append(input.step);
  const history = await input.steps.listForRequest(input.step.requestId);
  const completion = deriveRequestCompletionFromSteps({
    expected: input.expected,
    steps: history,
  });

  // A `conflict` means this exact stepId was already recorded — but it does
  // NOT mean the transition that should have followed it ever ran. A crash
  // (or thrown `applyTransition`) between a successful append and its
  // transition attempt leaves the step durably recorded with the request
  // still `in_progress`/`partially_failed`. Falling through to the same
  // terminal/completion/transition evaluation below (instead of returning
  // early) lets a replay of that exact step recover the dropped transition,
  // rather than reporting `step_conflict` forever with no way to advance.
  const recordedStatus: 'recorded' | 'step_conflict' =
    appendResult === 'conflict' ? 'step_conflict' : 'recorded';

  if (isTerminalSubjectRequestState(request.state)) {
    return { completion, request, status: 'already_terminal' };
  }

  if (completion === 'incomplete') {
    return { completion, request, status: recordedStatus };
  }

  if (request.state !== 'in_progress' && request.state !== 'partially_failed') {
    return { completion, request, status: recordedStatus };
  }

  const applied = await input.requests.applyTransition({
    correlationId: input.correlationId,
    next: completion,
    operationId: input.operationId,
    productionMode: input.productionMode,
    reasonCode: 'forward',
    requestId: request.requestId,
    transitionId: input.transitionId,
    updatedAt: input.updatedAt,
  });

  if (applied.status === 'advanced') {
    return {
      completion,
      request: applied.request,
      status: 'advanced',
      transition: applied.transition,
    };
  }
  if (applied.status === 'already_terminal') {
    return { completion, request: applied.request, status: 'already_terminal' };
  }
  if (applied.status === 'invalid') {
    return { reason: applied.reason, status: 'invalid_transition' };
  }
  return { status: 'transition_conflict' };
}

import type {
  OnboardingIdFactory,
  OnboardingSecretFactory,
  OnboardingTransitionSink,
  TrustedClock,
} from '@fitness-os/domain';
import {
  invitationClaimSecretSchema,
  retryTokenSchema,
} from '@fitness-os/schemas';

import { digestUtf8JsonSha256V1 } from './canonical.js';
import {
  persistInvitation,
  type OnboardingPgPersistence,
} from './pg-persistence.js';
import {
  digestClaimSecret,
  digestRetryToken,
  type OnboardingStore,
  type StoredInvitation,
} from './store.js';

export type CoachBootstrapEnvironment = 'synthetic' | 'production';

export type CoachBootstrapCommandResult = {
  command: 'issue_coach_bootstrap_invitation';
  issued: {
    claimSecret: string;
    invitationId: string;
    purpose: 'coach_bootstrap';
    state: 'issued';
  };
  outcome: 'command_succeeded';
};

interface CoachBootstrapStoredOperation {
  digest: string;
  operationId: string;
  result: CoachBootstrapCommandResult;
  retryDigest: string;
}

/**
 * A binding key is reserved synchronously (before any `await`) the moment a
 * new operation starts, so a concurrent identical call observes the
 * in-flight reservation instead of racing past the same `undefined` check.
 * The reserving call resolves the pending promise to the committed record on
 * success, or removes the entry and rejects it on failure so a genuinely
 * failed attempt does not permanently wedge the binding key.
 */
interface PendingCoachBootstrapOperation {
  kind: 'pending';
  digest: string;
  promise: Promise<CoachBootstrapStoredOperation>;
}

interface SettledCoachBootstrapOperation {
  kind: 'settled';
  operation: CoachBootstrapStoredOperation;
}

type CoachBootstrapLedgerEntry =
  PendingCoachBootstrapOperation | SettledCoachBootstrapOperation;

/**
 * Dedicated idempotency ledger for the non-public coach-bootstrap command.
 * Deliberately not the shared onboarding `store.operations` ledger/table:
 * `issue_coach_bootstrap_invitation` is not yet an allowed
 * `onboarding_operation` namespace at the database boundary (widening the
 * `onboarding_operation_namespace_check` constraint is a separate, reviewed
 * migration), so this ledger stays in-memory only for this slice and is
 * never written through `persistOperation`. Callers create one instance and
 * reuse it across calls the same way an `OnboardingStore` is created once.
 */
export function createCoachBootstrapLedger(): Map<
  string,
  CoachBootstrapLedgerEntry
> {
  return new Map();
}

export interface IssueCoachBootstrapInvitationOptions {
  store: OnboardingStore;
  ledger: Map<string, CoachBootstrapLedgerEntry>;
  /**
   * Optional PG write-through for the issued invitation only (the invitation
   * table's `purpose` check already allows `coach_bootstrap`). The operation
   * ledger above is never persisted through this connection in this slice.
   */
  persistence?: OnboardingPgPersistence;
  idFactory: OnboardingIdFactory;
  secretFactory: OnboardingSecretFactory;
  transitionSink: OnboardingTransitionSink;
  clock: TrustedClock;
  environment: CoachBootstrapEnvironment;
  /**
   * Strict environment binding (PRD 07 HTTP surface: "strict environment
   * binding"). Coach-bootstrap issuance is denied in `production` unless
   * this is explicitly `true` — never defaulted `true` and never inferred
   * from any other configuration value.
   */
  allowProductionBootstrap?: boolean;
}

export interface IssueCoachBootstrapInvitationInput {
  /**
   * Attributable operator identity for the restricted operational entry
   * point. Never a browser-supplied value and never derived from an
   * onboarding principal, session, or invitation.
   */
  operatorId: string;
  retryToken: string;
}

export type IssueCoachBootstrapInvitationResult =
  | {
      state: 'operation_committed' | 'operation_replayed';
      digest: string;
      operationId: string;
      result: CoachBootstrapCommandResult;
    }
  | { state: 'operation_input_mismatch'; digest: string; operationId: string }
  | {
      state: 'denied';
      reason:
        | 'production_bootstrap_disabled'
        | 'invalid_operator_id'
        | 'invalid_retry_token';
    };

/**
 * Non-public coach-bootstrap invitation issuance (PRD 07 Scope: "Add a
 * non-public coach-bootstrap issuance command. It is not registered as a
 * public Fastify route and is not available to the browser bundle."). Callers
 * are restricted, least-privileged operator/deployment entry points, never
 * `registerOnboardingRoutes` or any code path reachable from an HTTP request.
 *
 * Reuses the same bounded retry-token/idempotency shape as
 * `issue_student_invitation`, keyed by an attributable operator identity
 * instead of an authenticated onboarding principal.
 */
export async function issueCoachBootstrapInvitation(
  options: IssueCoachBootstrapInvitationOptions,
  input: IssueCoachBootstrapInvitationInput,
): Promise<IssueCoachBootstrapInvitationResult> {
  const operatorId = input.operatorId.trim();
  if (operatorId.length === 0 || operatorId.length > 200) {
    return { reason: 'invalid_operator_id', state: 'denied' };
  }

  const retryToken = retryTokenSchema.safeParse(input.retryToken);
  if (!retryToken.success) {
    return { reason: 'invalid_retry_token', state: 'denied' };
  }

  if (
    options.environment === 'production' &&
    options.allowProductionBootstrap !== true
  ) {
    return { reason: 'production_bootstrap_disabled', state: 'denied' };
  }

  const authorityScope = `operator:${options.environment}:${operatorId}`;
  const digest = digestUtf8JsonSha256V1({
    authority: authorityScope,
    namespace: 'issue_coach_bootstrap_invitation',
  });
  const retryDigest = digestRetryToken(retryToken.data, options.store.pepper);
  const bindingKey = `${authorityScope}:issue_coach_bootstrap_invitation:${retryDigest}`;

  const existingEntry = options.ledger.get(bindingKey);

  if (existingEntry !== undefined) {
    const operation =
      existingEntry.kind === 'pending'
        ? await existingEntry.promise
        : existingEntry.operation;

    if (operation.digest !== digest) {
      return {
        digest: operation.digest,
        operationId: operation.operationId,
        state: 'operation_input_mismatch',
      };
    }

    return {
      digest: operation.digest,
      operationId: operation.operationId,
      result: operation.result,
      state: 'operation_replayed',
    };
  }

  // Reserve the binding key synchronously, before any `await`, so a
  // concurrent identical call always observes this pending reservation
  // instead of racing past the `undefined` check above and independently
  // committing a second operation for the same retry token.
  let settlePending!: (operation: CoachBootstrapStoredOperation) => void;
  let failPending!: (error: unknown) => void;
  const pendingPromise = new Promise<CoachBootstrapStoredOperation>(
    (resolve, reject) => {
      settlePending = resolve;
      failPending = reject;
    },
  );
  // Prevent Node's unhandled-rejection warning/termination when this
  // operation fails and no concurrent caller ever awaits `pendingPromise` —
  // a real awaiter (via `existingEntry.promise` above) still observes the
  // rejection normally; this extra handler only silences the case where
  // nobody is listening.
  pendingPromise.catch(() => {});
  options.ledger.set(bindingKey, {
    digest,
    kind: 'pending',
    promise: pendingPromise,
  });

  try {
    const claimSecret = invitationClaimSecretSchema.parse(
      options.secretFactory.claimSecret(),
    );
    const invitationId = options.idFactory.invitationId();
    const invitation: StoredInvitation = {
      claimDigest: digestClaimSecret(claimSecret, options.store.pepper),
      invitationId,
      proposedRole: 'coach',
      purpose: 'coach_bootstrap',
      state: 'issued',
      targetCoachPrincipalKey: null,
    };

    options.store.invitations.set(invitation.invitationId, invitation);
    if (options.persistence !== undefined) {
      await persistInvitation(options.persistence, invitation);
    }

    const result: CoachBootstrapCommandResult = {
      command: 'issue_coach_bootstrap_invitation',
      issued: {
        claimSecret,
        invitationId,
        purpose: 'coach_bootstrap',
        state: 'issued',
      },
      outcome: 'command_succeeded',
    };

    const operationId = options.idFactory.operationId();
    await options.transitionSink.append({
      aggregate: 'invitation',
      aggregateId: invitationId,
      nextState: 'issued',
      operationId,
      previousState: 'unissued',
      reason: 'issue_coach_bootstrap_invitation',
      recordedAt: options.clock.nowUtcMs(),
    });

    const operation: CoachBootstrapStoredOperation = {
      digest,
      operationId,
      result,
      retryDigest,
    };
    options.ledger.set(bindingKey, { kind: 'settled', operation });
    settlePending(operation);

    return {
      digest,
      operationId,
      result,
      state: 'operation_committed',
    };
  } catch (error) {
    options.ledger.delete(bindingKey);
    failPending(error);
    throw error;
  }
}

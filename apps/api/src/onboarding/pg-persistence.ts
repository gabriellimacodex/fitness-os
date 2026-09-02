import type { PostgresConnection } from '@fitness-os/database';
import {
  asOnboardingAttemptRepository,
  createPostgresOnboardingAttemptRepository,
  createPostgresOnboardingInvitationRepository,
  asOnboardingOperationRepository,
  createPostgresOnboardingOperationRepository,
  asOnboardingInvitationRepository,
  asOnboardingTransitionSink,
  createPostgresOnboardingTransitionSink,
  asPrincipalBindingRepository,
  createPostgresPrincipalBindingRepository,
  asPrincipalRoleMappingRepository,
  createPostgresOnboardingRoleMappingRepository,
  type StoredOnboardingAttempt,
  type StoredOnboardingInvitation,
  type StoredOnboardingOperation,
  type StoredOnboardingRoleMapping,
} from '@fitness-os/database';
import type {
  OnboardingAttemptRepository,
  OnboardingInvitationRepository,
  OnboardingOperationRepository,
  OnboardingTransitionSink,
  PrincipalBindingRepository,
  PrincipalRoleMappingRepository,
  ProposedRole,
  TrustedClock,
} from '@fitness-os/domain';
import { SystemTrustedClock } from '@fitness-os/domain';
import type { PrincipalRoleMappingId } from '@fitness-os/schemas';

import type {
  OnboardingStore,
  StoredAttempt,
  StoredInvitation,
  StoredOperation,
} from './store.js';
import { mappingIdFor, recordRoleMapping } from './store.js';

export type OnboardingPgPersistence = {
  attempts: OnboardingAttemptRepository;
  invitations: OnboardingInvitationRepository;
  mappings: PrincipalRoleMappingRepository;
  nowUtcMs: () => string;
  operations: OnboardingOperationRepository;
  principalBinding: PrincipalBindingRepository;
  transitions: OnboardingTransitionSink;
};

export function createOnboardingPgPersistence(
  connection: PostgresConnection,
  options: { clock?: TrustedClock; nowUtcMs?: () => string } = {},
): OnboardingPgPersistence {
  const clock = options.clock ?? new SystemTrustedClock();
  return {
    attempts: asOnboardingAttemptRepository(
      createPostgresOnboardingAttemptRepository(connection),
    ),
    invitations: asOnboardingInvitationRepository(
      createPostgresOnboardingInvitationRepository(connection),
    ),
    mappings: asPrincipalRoleMappingRepository(
      createPostgresOnboardingRoleMappingRepository(connection),
    ),
    nowUtcMs: options.nowUtcMs ?? (() => clock.nowUtcMs()),
    operations: asOnboardingOperationRepository(
      createPostgresOnboardingOperationRepository(connection),
    ),
    principalBinding: asPrincipalBindingRepository(
      createPostgresPrincipalBindingRepository(connection),
    ),
    transitions: asOnboardingTransitionSink(
      createPostgresOnboardingTransitionSink(connection),
    ),
  };
}

export function toApiInvitation(
  row: StoredOnboardingInvitation,
): StoredInvitation {
  return {
    claimDigest: row.claimDigest,
    invitationId: row.invitationId,
    proposedRole: row.proposedRole,
    purpose: row.purpose,
    state: row.state,
    targetCoachPrincipalKey: row.targetCoachPrincipalKey,
  };
}

export function toApiAttempt(row: StoredOnboardingAttempt): StoredAttempt {
  return {
    createdAt: row.createdAt,
    detail: row.detail,
    principalKey: row.principalKey,
  };
}

export function toApiOperation(
  row: StoredOnboardingOperation,
): StoredOperation {
  return {
    digest: row.digest,
    namespace: row.namespace,
    operationId: row.operationId,
    result: row.result,
    retryDigest: row.retryDigest,
  };
}

export async function persistInvitation(
  persistence: OnboardingPgPersistence,
  invitation: StoredInvitation,
): Promise<void> {
  const updatedAt = persistence.nowUtcMs();
  const existing = await persistence.invitations.get(invitation.invitationId);

  if (existing === null) {
    const put = await persistence.invitations.put({
      ...invitation,
      updatedAt,
    });
    if (put === 'accepted') {
      return;
    }
    if (put === 'invalid') {
      throw new Error('onboarding invitation put rejected non-issued state');
    }
  }

  if (invitation.state === 'claimed') {
    const result = await persistence.invitations.applyClaim({
      invitationId: invitation.invitationId,
      updatedAt,
    });
    if (result.status === 'invalid' && result.reason === 'not_found') {
      throw new Error('onboarding invitation missing for claim persistence');
    }
    return;
  }

  if (invitation.state === 'revoked') {
    const result = await persistence.invitations.applyRevoke({
      invitationId: invitation.invitationId,
      updatedAt,
    });
    if (result.status === 'invalid' && result.reason === 'not_found') {
      throw new Error('onboarding invitation missing for revoke persistence');
    }
  }
}

export async function persistAttempt(
  persistence: OnboardingPgPersistence,
  attempt: StoredAttempt,
): Promise<void> {
  const updatedAt = persistence.nowUtcMs();
  const existing = await persistence.attempts.get(attempt.detail.attemptId);

  if (existing === null) {
    const put = await persistence.attempts.put({
      createdAt: attempt.createdAt,
      detail: attempt.detail,
      principalKey: attempt.principalKey,
      updatedAt,
    });
    if (put === 'accepted') {
      return;
    }
    if (put === 'invalid') {
      // Terminal rows must arrive via transition; ignore if already advanced.
      return;
    }
    if (put === 'conflict') {
      // Fall through to transition path.
    }
  }

  const current =
    existing ?? (await persistence.attempts.get(attempt.detail.attemptId));
  if (current === null) {
    return;
  }

  if (current.detail.lifecycle === attempt.detail.lifecycle) {
    return;
  }

  await persistence.attempts.applyTransition({
    attemptId: attempt.detail.attemptId,
    next: attempt.detail.lifecycle,
    terminalReason: attempt.detail.terminalReason,
    updatedAt,
  });
}

export async function persistOperation(
  persistence: OnboardingPgPersistence,
  bindingKey: string,
  principalKey: string,
  operation: StoredOperation,
): Promise<void> {
  await persistence.operations.put({
    bindingKey,
    createdAt: persistence.nowUtcMs(),
    digest: operation.digest,
    namespace: operation.namespace,
    operationId: operation.operationId,
    principalKey,
    result: operation.result,
    retryDigest: operation.retryDigest,
  });
}

export async function persistRoleMapping(
  persistence: OnboardingPgPersistence,
  input: {
    mappingId?: PrincipalRoleMappingId;
    principalKey: string;
    role: ProposedRole;
  },
): Promise<void> {
  const mappingId =
    input.mappingId ?? mappingIdFor(input.principalKey, input.role);
  const result = await persistence.mappings.put({
    createdAt: persistence.nowUtcMs(),
    mappingId,
    principalKey: input.principalKey,
    role: input.role,
  });
  if (result.status === 'conflict') {
    throw new Error('onboarding role mapping persistence conflict');
  }
}

export async function hydrateCoachInvitations(
  store: OnboardingStore,
  persistence: OnboardingPgPersistence,
  coachPrincipalKey: string,
): Promise<void> {
  const rows =
    await persistence.invitations.listByTargetCoach(coachPrincipalKey);
  for (const row of rows) {
    store.invitations.set(row.invitationId, toApiInvitation(row));
  }
}

export async function hydratePrincipalAttempts(
  store: OnboardingStore,
  persistence: OnboardingPgPersistence,
  principalKey: string,
): Promise<void> {
  const rows = await persistence.attempts.listByPrincipal(principalKey);
  for (const row of rows) {
    store.attempts.set(row.detail.attemptId, toApiAttempt(row));
  }
}

export async function hydratePrincipalMappings(
  store: OnboardingStore,
  persistence: OnboardingPgPersistence,
  principalKey: string,
): Promise<void> {
  const rows = await persistence.mappings.listByPrincipal(principalKey);
  for (const row of rows) {
    recordRoleMapping(store, principalKey, row.role);
  }
}

export function toApiRoleMapping(row: StoredOnboardingRoleMapping): {
  mappingId: PrincipalRoleMappingId;
  principalKey: string;
  role: ProposedRole;
} {
  return {
    mappingId: row.mappingId,
    principalKey: row.principalKey,
    role: row.role,
  };
}

export async function loadOperation(
  store: OnboardingStore,
  persistence: OnboardingPgPersistence | undefined,
  bindingKey: string,
): Promise<StoredOperation | undefined> {
  const cached = store.operations.get(bindingKey);
  if (cached !== undefined) {
    return cached;
  }

  if (persistence === undefined) {
    return undefined;
  }

  const row = await persistence.operations.getByBindingKey(bindingKey);
  if (row === null) {
    return undefined;
  }

  const operation = toApiOperation(row);
  store.operations.set(bindingKey, operation);
  return operation;
}

export async function loadInvitation(
  store: OnboardingStore,
  persistence: OnboardingPgPersistence | undefined,
  invitationId: string,
): Promise<StoredInvitation | undefined> {
  const cached = store.invitations.get(invitationId);
  if (cached !== undefined) {
    return cached;
  }

  if (persistence === undefined) {
    return undefined;
  }

  const row = await persistence.invitations.get(invitationId);
  if (row === null) {
    return undefined;
  }

  const invitation = toApiInvitation(row);
  store.invitations.set(invitation.invitationId, invitation);
  return invitation;
}

export async function loadInvitationByClaimDigest(
  store: OnboardingStore,
  persistence: OnboardingPgPersistence | undefined,
  claimDigest: string,
): Promise<StoredInvitation | undefined> {
  for (const invitation of store.invitations.values()) {
    if (invitation.claimDigest === claimDigest) {
      return invitation;
    }
  }

  if (persistence === undefined) {
    return undefined;
  }

  const row = await persistence.invitations.getByClaimDigest(claimDigest);
  if (row === null) {
    return undefined;
  }

  const invitation = toApiInvitation(row);
  store.invitations.set(invitation.invitationId, invitation);
  return invitation;
}

export async function loadAttempt(
  store: OnboardingStore,
  persistence: OnboardingPgPersistence | undefined,
  attemptId: string,
): Promise<StoredAttempt | undefined> {
  const cached = store.attempts.get(attemptId);
  if (cached !== undefined) {
    return cached;
  }

  if (persistence === undefined) {
    return undefined;
  }

  const row = await persistence.attempts.get(attemptId);
  if (row === null) {
    return undefined;
  }

  const attempt = toApiAttempt(row);
  store.attempts.set(attempt.detail.attemptId, attempt);
  return attempt;
}

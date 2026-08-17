import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type { ProposedRole } from '@fitness-os/domain';
import {
  attemptDetailSchema,
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
  onboardingOperationIdSchema,
  principalRoleMappingIdSchema,
  type AttemptDetail,
  type OnboardingAttemptId,
  type OnboardingInvitationId,
  type OnboardingOperationId,
  type PrincipalRoleMappingId,
} from '@fitness-os/schemas';

export interface StoredInvitation {
  claimDigest: string;
  invitationId: OnboardingInvitationId;
  proposedRole: ProposedRole;
  purpose: 'coach_bootstrap' | 'student_onboarding';
  state: 'issued' | 'claimed' | 'revoked' | 'expired';
  targetCoachPrincipalKey: string | null;
}

export interface StoredAttempt {
  createdAt: string;
  detail: AttemptDetail;
  principalKey: string;
}

export interface StoredOperation {
  digest: string;
  namespace: 'create_attempt';
  operationId: OnboardingOperationId;
  result: unknown;
  retryDigest: string;
}

export interface OnboardingStore {
  attempts: Map<string, StoredAttempt>;
  invitations: Map<string, StoredInvitation>;
  operations: Map<string, StoredOperation>;
  pepper: Buffer;
}

export function createOnboardingStore(): OnboardingStore {
  return {
    attempts: new Map(),
    invitations: new Map(),
    operations: new Map(),
    pepper: randomBytes(32),
  };
}

export function digestClaimSecret(secret: string, pepper: Buffer): string {
  const mac = createHmac('sha256', pepper).update(secret, 'utf8').digest('hex');
  return `hmac-sha256.v1:${mac}`;
}

export function digestRetryToken(token: string, pepper: Buffer): string {
  const mac = createHmac('sha256', pepper).update(token, 'utf8').digest('hex');
  return `hmac-sha256.v1:${mac}`;
}

export function fixedLengthEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    timingSafeEqual(leftBytes, leftBytes);
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}

export function mappingIdFor(
  principalKey: string,
  role: ProposedRole,
): PrincipalRoleMappingId {
  const hex = createHash('sha256')
    .update(`prd07.mapping:${principalKey}:${role}`, 'utf8')
    .digest('hex');
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');

  return principalRoleMappingIdSchema.parse(uuid);
}

export function operationBindingKey(
  principalKey: string,
  namespace: StoredOperation['namespace'],
  retryDigest: string,
): string {
  return `${principalKey}:${namespace}:${retryDigest}`;
}

export function findInvitationBySecret(
  store: OnboardingStore,
  secret: string,
): StoredInvitation | undefined {
  const digest = digestClaimSecret(secret, store.pepper);
  let found: StoredInvitation | undefined;

  for (const invitation of store.invitations.values()) {
    if (fixedLengthEqual(invitation.claimDigest, digest)) {
      found = invitation;
    }
  }

  return found;
}

export function createStoredAttempt(
  invitation: StoredInvitation,
  ordinal: number,
  principalKey: string,
  createdAt: string = new Date().toISOString(),
): StoredAttempt {
  return {
    createdAt,
    detail: attemptDetailSchema.parse({
      attemptId: onboardingAttemptIdSchema.parse(randomUUID()),
      invitationId: invitation.invitationId,
      lifecycle: 'policy_pending',
      ordinal,
      policy: null,
      predecessorAttemptId: null,
      proposedRole: invitation.proposedRole,
      purpose: invitation.purpose,
      terminalReason: null,
    }),
    principalKey,
  };
}

export function nextOrdinalForRole(
  store: OnboardingStore,
  principalKey: string,
  proposedRole: ProposedRole,
): number {
  let highest = 0;

  for (const record of store.attempts.values()) {
    if (
      record.principalKey === principalKey &&
      record.detail.proposedRole === proposedRole &&
      record.detail.ordinal > highest
    ) {
      highest = record.detail.ordinal;
    }
  }

  return highest + 1;
}

export function getAttemptForPrincipal(
  store: OnboardingStore,
  attemptId: OnboardingAttemptId,
  principalKey: string,
): AttemptDetail | undefined {
  const record = store.attempts.get(attemptId);

  if (record === undefined || record.principalKey !== principalKey) {
    return undefined;
  }

  return record.detail;
}

export function encodeAttemptCursor(
  store: OnboardingStore,
  createdAt: string,
  attemptId: string,
): string {
  const payload = Buffer.from(`${createdAt}|${attemptId}`, 'utf8').toString(
    'base64url',
  );
  const mac = createHmac('sha256', store.pepper)
    .update(payload, 'utf8')
    .digest('base64url')
    .slice(0, 22);

  return `${payload}${mac}`;
}

export function decodeAttemptCursor(
  store: OnboardingStore,
  cursor: string,
): { attemptId: string; createdAt: string } | null {
  if (cursor.length < 23) {
    return null;
  }

  const payload = cursor.slice(0, cursor.length - 22);
  const mac = cursor.slice(cursor.length - 22);
  const expected = createHmac('sha256', store.pepper)
    .update(payload, 'utf8')
    .digest('base64url')
    .slice(0, 22);

  if (!fixedLengthEqual(mac, expected)) {
    return null;
  }

  let decoded: string;

  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const separator = decoded.indexOf('|');

  if (separator <= 0 || separator === decoded.length - 1) {
    return null;
  }

  return {
    createdAt: decoded.slice(0, separator),
    attemptId: decoded.slice(separator + 1),
  };
}

export function compareAttemptOrder(
  left: StoredAttempt,
  right: StoredAttempt,
): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }

  return left.detail.attemptId < right.detail.attemptId ? -1 : 1;
}

export function isAfterCursor(
  record: StoredAttempt,
  cursor: { attemptId: string; createdAt: string },
): boolean {
  if (record.createdAt !== cursor.createdAt) {
    return record.createdAt > cursor.createdAt;
  }

  return record.detail.attemptId > cursor.attemptId;
}

export function newInvitationId(): OnboardingInvitationId {
  return onboardingInvitationIdSchema.parse(randomUUID());
}

export function newOperationId(): OnboardingOperationId {
  return onboardingOperationIdSchema.parse(randomUUID());
}

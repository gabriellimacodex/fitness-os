import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Disposable synthetic onboarding invitation current pointer.
 * Claim secrets are never stored — only HMAC digests.
 */
export const onboardingInvitation = pgTable(
  'onboarding_invitation',
  {
    invitationId: uuid('invitation_id').primaryKey(),
    claimDigest: text('claim_digest').notNull(),
    proposedRole: text('proposed_role').notNull(),
    purpose: text('purpose').notNull(),
    state: text('state').notNull(),
    targetCoachPrincipalKey: text('target_coach_principal_key'),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      'onboarding_invitation_proposed_role_check',
      sql`${table.proposedRole} IN ('student', 'coach')`,
    ),
    check(
      'onboarding_invitation_purpose_check',
      sql`${table.purpose} IN ('coach_bootstrap', 'student_onboarding')`,
    ),
    check(
      'onboarding_invitation_state_check',
      sql`${table.state} IN ('issued', 'claimed', 'revoked', 'expired')`,
    ),
    check(
      'onboarding_invitation_claim_digest_check',
      sql`${table.claimDigest} ~ '^hmac-sha256\\.v1:[a-f0-9]{64}$'`,
    ),
    uniqueIndex('onboarding_invitation_claim_digest_unique').on(
      table.claimDigest,
    ),
    index('onboarding_invitation_state_idx').on(table.state),
    index('onboarding_invitation_target_coach_idx').on(
      table.targetCoachPrincipalKey,
    ),
  ],
);

/**
 * Disposable synthetic onboarding attempt current pointer.
 * Policy handoff payloads stay reference-only JSON (no legal text).
 */
export const onboardingAttempt = pgTable(
  'onboarding_attempt',
  {
    attemptId: uuid('attempt_id').primaryKey(),
    invitationId: uuid('invitation_id').notNull(),
    principalKey: text('principal_key').notNull(),
    proposedRole: text('proposed_role').notNull(),
    purpose: text('purpose').notNull(),
    lifecycle: text('lifecycle').notNull(),
    ordinal: integer('ordinal').notNull(),
    predecessorAttemptId: uuid('predecessor_attempt_id'),
    terminalReason: text('terminal_reason'),
    policy: jsonb('policy'),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invitationId],
      foreignColumns: [onboardingInvitation.invitationId],
      name: 'onboarding_attempt_invitation_id_fk',
    }).onDelete('restrict'),
    check(
      'onboarding_attempt_proposed_role_check',
      sql`${table.proposedRole} IN ('student', 'coach')`,
    ),
    check(
      'onboarding_attempt_purpose_check',
      sql`${table.purpose} IN ('coach_bootstrap', 'student_onboarding')`,
    ),
    check(
      'onboarding_attempt_lifecycle_check',
      sql`${table.lifecycle} IN (
        'policy_pending',
        'ready_to_claim',
        'completed',
        'terminal'
      )`,
    ),
    check(
      'onboarding_attempt_ordinal_check',
      sql`${table.ordinal} BETWEEN 1 AND 4`,
    ),
    check(
      'onboarding_attempt_terminal_reason_check',
      sql`${table.terminalReason} IS NULL OR ${table.terminalReason} IN (
        'abandoned',
        'expired',
        'superseded',
        'invitation_unavailable',
        'mapping_conflict',
        'hard_disabled'
      )`,
    ),
    check(
      'onboarding_attempt_terminal_pair_check',
      sql`(
        (${table.lifecycle} = 'terminal' AND ${table.terminalReason} IS NOT NULL) OR
        (${table.lifecycle} <> 'terminal' AND ${table.terminalReason} IS NULL)
      )`,
    ),
    index('onboarding_attempt_principal_key_idx').on(table.principalKey),
    index('onboarding_attempt_lifecycle_idx').on(table.lifecycle),
    index('onboarding_attempt_invitation_id_idx').on(table.invitationId),
  ],
);

/**
 * Disposable synthetic principal→role mapping after successful claim.
 * mapping_id is the deterministic PrincipalRoleMappingId (API mappingIdFor).
 */
export const onboardingRoleMapping = pgTable(
  'onboarding_role_mapping',
  {
    mappingId: uuid('mapping_id').primaryKey(),
    principalKey: text('principal_key').notNull(),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      'onboarding_role_mapping_role_check',
      sql`${table.role} IN ('student', 'coach')`,
    ),
    uniqueIndex('onboarding_role_mapping_principal_role_unique').on(
      table.principalKey,
      table.role,
    ),
    index('onboarding_role_mapping_principal_key_idx').on(table.principalKey),
  ],
);

/**
 * Disposable synthetic onboarding operation ledger for idempotent replay.
 * Retry tokens are never stored — only HMAC digests and opaque results.
 */
export const onboardingOperation = pgTable(
  'onboarding_operation',
  {
    operationId: uuid('operation_id').primaryKey(),
    bindingKey: text('binding_key').notNull(),
    principalKey: text('principal_key').notNull(),
    namespace: text('namespace').notNull(),
    retryDigest: text('retry_digest').notNull(),
    digest: text('digest').notNull(),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      'onboarding_operation_namespace_check',
      sql`${table.namespace} IN (
        'create_attempt',
        'resume_attempt',
        'abandon_attempt',
        'refresh_policy',
        'claim_attempt',
        'issue_student_invitation',
        'revoke_student_invitation'
      )`,
    ),
    check(
      'onboarding_operation_retry_digest_check',
      sql`${table.retryDigest} ~ '^hmac-sha256\\.v1:[a-f0-9]{64}$'`,
    ),
    check(
      'onboarding_operation_digest_check',
      sql`${table.digest} ~ '^[a-f0-9]{64}$'`,
    ),
    uniqueIndex('onboarding_operation_binding_key_unique').on(table.bindingKey),
    index('onboarding_operation_principal_key_idx').on(table.principalKey),
    index('onboarding_operation_namespace_idx').on(table.namespace),
  ],
);

/**
 * Disposable synthetic append-only onboarding transition evidence.
 * Aggregate rows (invitation/attempt/role_mapping/operation) are polymorphic,
 * so aggregateId intentionally carries no single foreign key. Ordinary
 * application repositories only insert; there is no update/delete method.
 */
export const onboardingTransition = pgTable(
  'onboarding_transition',
  {
    transitionId: uuid('transition_id').primaryKey(),
    aggregate: text('aggregate').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    previousState: text('previous_state').notNull(),
    nextState: text('next_state').notNull(),
    operationId: uuid('operation_id').notNull(),
    reason: text('reason').notNull(),
    recordedAt: timestamp('recorded_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      'onboarding_transition_aggregate_check',
      sql`${table.aggregate} IN (
        'invitation',
        'attempt',
        'role_mapping',
        'operation'
      )`,
    ),
    uniqueIndex('onboarding_transition_dedupe_unique').on(
      table.aggregate,
      table.aggregateId,
      table.operationId,
      table.previousState,
      table.nextState,
    ),
    index('onboarding_transition_aggregate_id_idx').on(
      table.aggregate,
      table.aggregateId,
    ),
    index('onboarding_transition_recorded_at_idx').on(table.recordedAt),
  ],
);

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

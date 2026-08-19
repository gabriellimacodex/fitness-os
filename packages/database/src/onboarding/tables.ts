import { sql } from 'drizzle-orm';
import {
  check,
  index,
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

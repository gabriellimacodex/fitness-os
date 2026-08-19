import { and, eq } from 'drizzle-orm';
import {
  claimInvitation,
  revokeInvitation,
  type ProposedRole,
} from '@fitness-os/domain';
import {
  invitationPurposeSchema,
  invitationStateSchema,
  onboardingInvitationIdSchema,
  proposedRoleSchema,
  type OnboardingInvitationId,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { onboardingInvitation } from './tables.js';

type InvitationPurpose = 'coach_bootstrap' | 'student_onboarding';
type InvitationState = 'issued' | 'claimed' | 'revoked' | 'expired';

export type StoredOnboardingInvitation = {
  invitationId: OnboardingInvitationId;
  claimDigest: string;
  proposedRole: ProposedRole;
  purpose: InvitationPurpose;
  state: InvitationState;
  targetCoachPrincipalKey: string | null;
  updatedAt: string;
};

export type OnboardingInvitationPutResult = 'accepted' | 'conflict' | 'invalid';

export type OnboardingInvitationTransitionResult =
  | { status: 'advanced'; invitation: StoredOnboardingInvitation }
  | { status: 'already_terminal'; invitation: StoredOnboardingInvitation }
  | { status: 'invalid'; reason: 'not_found' | 'illegal_transition' }
  | { status: 'conflict' };

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint_name' in error &&
    error.constraint_name === constraint
  ) {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    isUniqueViolation(error.cause, constraint)
  );
}

function toRecord(
  row: typeof onboardingInvitation.$inferSelect,
): StoredOnboardingInvitation {
  return {
    claimDigest: row.claimDigest,
    invitationId: onboardingInvitationIdSchema.parse(row.invitationId),
    proposedRole: proposedRoleSchema.parse(row.proposedRole),
    purpose: invitationPurposeSchema.parse(row.purpose),
    state: invitationStateSchema.parse(row.state),
    targetCoachPrincipalKey: row.targetCoachPrincipalKey,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function createPostgresOnboardingInvitationRepository(
  connection: PostgresConnection,
) {
  return {
    get: async (
      invitationId: string,
    ): Promise<StoredOnboardingInvitation | null> => {
      const [row] = await connection.db
        .select()
        .from(onboardingInvitation)
        .where(eq(onboardingInvitation.invitationId, invitationId))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    put: async (
      record: StoredOnboardingInvitation,
    ): Promise<OnboardingInvitationPutResult> => {
      // Initial writes must be issued; claim/revoke are the only mutators.
      if (record.state !== 'issued') {
        return 'invalid';
      }

      try {
        await connection.db.insert(onboardingInvitation).values({
          claimDigest: record.claimDigest,
          invitationId: record.invitationId,
          proposedRole: record.proposedRole,
          purpose: record.purpose,
          state: record.state,
          targetCoachPrincipalKey: record.targetCoachPrincipalKey,
          updatedAt: record.updatedAt,
        });
        return 'accepted';
      } catch (error) {
        if (
          isUniqueViolation(error, 'onboarding_invitation_pkey') ||
          isUniqueViolation(error, 'onboarding_invitation_claim_digest_unique')
        ) {
          return 'conflict';
        }
        throw error;
      }
    },

    listByTargetCoach: async (
      targetCoachPrincipalKey: string,
    ): Promise<readonly StoredOnboardingInvitation[]> => {
      const rows = await connection.db
        .select()
        .from(onboardingInvitation)
        .where(
          eq(
            onboardingInvitation.targetCoachPrincipalKey,
            targetCoachPrincipalKey,
          ),
        );
      return rows.map(toRecord);
    },

    applyClaim: async (input: {
      invitationId: string;
      updatedAt: string;
    }): Promise<OnboardingInvitationTransitionResult> => {
      return applyTransition(
        connection,
        input.invitationId,
        input.updatedAt,
        (state) => claimInvitation(state),
      );
    },

    applyRevoke: async (input: {
      invitationId: string;
      updatedAt: string;
    }): Promise<OnboardingInvitationTransitionResult> => {
      return applyTransition(
        connection,
        input.invitationId,
        input.updatedAt,
        (state) => revokeInvitation(state),
      );
    },
  };
}

async function applyTransition(
  connection: PostgresConnection,
  invitationId: string,
  updatedAt: string,
  transition: (state: InvitationState) => ReturnType<typeof claimInvitation>,
): Promise<OnboardingInvitationTransitionResult> {
  try {
    return await connection.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(onboardingInvitation)
        .where(eq(onboardingInvitation.invitationId, invitationId))
        .for('update');

      if (!row) {
        return { reason: 'not_found' as const, status: 'invalid' as const };
      }

      const current = toRecord(row);
      const result = transition(current.state);
      if (result.status === 'already_terminal') {
        return { invitation: current, status: 'already_terminal' as const };
      }
      if (result.status !== 'advanced') {
        return {
          reason: 'illegal_transition' as const,
          status: 'invalid' as const,
        };
      }

      const updated = await tx
        .update(onboardingInvitation)
        .set({ state: result.state, updatedAt })
        .where(
          and(
            eq(onboardingInvitation.invitationId, invitationId),
            eq(onboardingInvitation.state, current.state),
          ),
        )
        .returning();

      if (updated.length === 0) {
        return { status: 'conflict' as const };
      }

      return {
        invitation: toRecord(updated[0]!),
        status: 'advanced' as const,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'onboarding_invitation_claim_digest_unique')) {
      return { status: 'conflict' };
    }
    throw error;
  }
}

export type PostgresOnboardingInvitationRepository = ReturnType<
  typeof createPostgresOnboardingInvitationRepository
>;

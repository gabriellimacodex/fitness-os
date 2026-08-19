import { and, eq } from 'drizzle-orm';
import {
  isNonterminal,
  transitionAttempt,
  type OnboardingAttemptRepository,
} from '@fitness-os/domain';
import {
  attemptDetailSchema,
  attemptLifecycleSchema,
  attemptTerminalReasonSchema,
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
  type AttemptDetail,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { onboardingAttempt } from './tables.js';

export type StoredOnboardingAttempt = {
  createdAt: string;
  detail: AttemptDetail;
  principalKey: string;
  updatedAt: string;
};

export type OnboardingAttemptPutResult = 'accepted' | 'conflict' | 'invalid';

export type OnboardingAttemptTransitionResult =
  | { status: 'advanced'; attempt: StoredOnboardingAttempt }
  | { status: 'already_terminal'; attempt: StoredOnboardingAttempt }
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

function toStored(
  row: typeof onboardingAttempt.$inferSelect,
): StoredOnboardingAttempt {
  const detail = attemptDetailSchema.parse({
    attemptId: row.attemptId,
    invitationId: row.invitationId,
    proposedRole: row.proposedRole,
    purpose: row.purpose,
    lifecycle: row.lifecycle,
    ordinal: row.ordinal,
    predecessorAttemptId: row.predecessorAttemptId,
    terminalReason: row.terminalReason,
    policy: row.policy,
  });

  return {
    createdAt: new Date(row.createdAt).toISOString(),
    detail,
    principalKey: row.principalKey,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function createPostgresOnboardingAttemptRepository(
  connection: PostgresConnection,
) {
  return {
    get: async (attemptId: string): Promise<StoredOnboardingAttempt | null> => {
      const [row] = await connection.db
        .select()
        .from(onboardingAttempt)
        .where(eq(onboardingAttempt.attemptId, attemptId))
        .limit(1);
      return row ? toStored(row) : null;
    },

    put: async (
      record: StoredOnboardingAttempt,
    ): Promise<OnboardingAttemptPutResult> => {
      if (!isNonterminal(record.detail.lifecycle)) {
        return 'invalid';
      }

      const detail = attemptDetailSchema.parse(record.detail);

      try {
        await connection.db.insert(onboardingAttempt).values({
          attemptId: detail.attemptId,
          createdAt: record.createdAt,
          invitationId: detail.invitationId,
          lifecycle: detail.lifecycle,
          ordinal: detail.ordinal,
          policy: detail.policy,
          predecessorAttemptId: detail.predecessorAttemptId,
          principalKey: record.principalKey,
          proposedRole: detail.proposedRole,
          purpose: detail.purpose,
          terminalReason: detail.terminalReason,
          updatedAt: record.updatedAt,
        });
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'onboarding_attempt_pkey')) {
          return 'conflict';
        }
        throw error;
      }
    },

    listByPrincipal: async (
      principalKey: string,
    ): Promise<readonly StoredOnboardingAttempt[]> => {
      const rows = await connection.db
        .select()
        .from(onboardingAttempt)
        .where(eq(onboardingAttempt.principalKey, principalKey));
      return rows.map(toStored);
    },

    applyTransition: async (input: {
      attemptId: string;
      next: AttemptDetail['lifecycle'];
      terminalReason?: AttemptDetail['terminalReason'];
      updatedAt: string;
    }): Promise<OnboardingAttemptTransitionResult> => {
      attemptLifecycleSchema.parse(input.next);
      if (input.terminalReason !== undefined && input.terminalReason !== null) {
        attemptTerminalReasonSchema.parse(input.terminalReason);
      }

      return connection.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(onboardingAttempt)
          .where(eq(onboardingAttempt.attemptId, input.attemptId))
          .for('update');

        if (!row) {
          return { reason: 'not_found' as const, status: 'invalid' as const };
        }

        const current = toStored(row);
        const result = transitionAttempt(
          current.detail,
          input.next,
          input.terminalReason ?? null,
        );

        if (result.status === 'already_terminal') {
          return {
            attempt: current,
            status: 'already_terminal' as const,
          };
        }
        if (result.status !== 'advanced') {
          return {
            reason: 'illegal_transition' as const,
            status: 'invalid' as const,
          };
        }

        const updated = await tx
          .update(onboardingAttempt)
          .set({
            lifecycle: result.attempt.lifecycle,
            policy: result.attempt.policy,
            terminalReason: result.attempt.terminalReason,
            updatedAt: input.updatedAt,
          })
          .where(
            and(
              eq(onboardingAttempt.attemptId, input.attemptId),
              eq(onboardingAttempt.lifecycle, current.detail.lifecycle),
            ),
          )
          .returning();

        if (updated.length === 0) {
          return { status: 'conflict' as const };
        }

        return {
          attempt: toStored(updated[0]!),
          status: 'advanced' as const,
        };
      });
    },
  };
}

export type PostgresOnboardingAttemptRepository = ReturnType<
  typeof createPostgresOnboardingAttemptRepository
>;

/** Structural adapter: disposable PG repo satisfies the domain port. */
export function asOnboardingAttemptRepository(
  repository: PostgresOnboardingAttemptRepository,
): OnboardingAttemptRepository {
  return repository;
}

// Keep branded ID helpers available for callers assembling records.
export { onboardingAttemptIdSchema, onboardingInvitationIdSchema };

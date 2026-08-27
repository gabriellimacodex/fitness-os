import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { OnboardingTransitionSink } from '@fitness-os/domain';

import type { PostgresConnection } from '../connection.js';
import { onboardingTransition } from './tables.js';

export type OnboardingTransitionAggregate =
  'invitation' | 'attempt' | 'role_mapping' | 'operation';

const AGGREGATES = new Set<OnboardingTransitionAggregate>([
  'invitation',
  'attempt',
  'role_mapping',
  'operation',
]);

export type StoredOnboardingTransition = {
  aggregate: OnboardingTransitionAggregate;
  aggregateId: string;
  previousState: string;
  nextState: string;
  operationId: string;
  reason: string;
  recordedAt: string;
};

function toRecord(
  row: typeof onboardingTransition.$inferSelect,
): StoredOnboardingTransition {
  if (!AGGREGATES.has(row.aggregate as OnboardingTransitionAggregate)) {
    throw new Error(
      `unexpected onboarding transition aggregate: ${row.aggregate}`,
    );
  }

  return {
    aggregate: row.aggregate as OnboardingTransitionAggregate,
    aggregateId: row.aggregateId,
    nextState: row.nextState,
    operationId: row.operationId,
    previousState: row.previousState,
    reason: row.reason,
    recordedAt: new Date(row.recordedAt).toISOString(),
  };
}

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

export function createPostgresOnboardingTransitionRepository(
  connection: PostgresConnection,
) {
  return {
    /**
     * Append-only insert. A repeat of the same
     * aggregate + aggregateId + operationId + previousState + nextState
     * tuple is a conflict-free replay, matching
     * SyntheticOnboardingTransitionSink's in-memory dedupe.
     */
    append: async (
      record: StoredOnboardingTransition,
    ): Promise<'accepted' | 'conflict'> => {
      if (!AGGREGATES.has(record.aggregate)) {
        throw new Error(
          `unexpected onboarding transition aggregate: ${record.aggregate}`,
        );
      }

      try {
        await connection.db.insert(onboardingTransition).values({
          aggregate: record.aggregate,
          aggregateId: record.aggregateId,
          id: randomUUID(),
          nextState: record.nextState,
          operationId: record.operationId,
          previousState: record.previousState,
          reason: record.reason,
          recordedAt: record.recordedAt,
        });
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'onboarding_transition_dedupe_unique')) {
          return 'conflict';
        }
        throw error;
      }
    },

    listByAggregate: async (
      aggregate: OnboardingTransitionAggregate,
      aggregateId: string,
    ): Promise<readonly StoredOnboardingTransition[]> => {
      const rows = await connection.db
        .select()
        .from(onboardingTransition)
        .where(
          and(
            eq(onboardingTransition.aggregate, aggregate),
            eq(onboardingTransition.aggregateId, aggregateId),
          ),
        )
        .orderBy(asc(onboardingTransition.recordedAt));
      return rows.map(toRecord);
    },
  };
}

export type PostgresOnboardingTransitionRepository = ReturnType<
  typeof createPostgresOnboardingTransitionRepository
>;

/** Structural adapter: disposable PG repo satisfies the domain port. */
export function asOnboardingTransitionSink(
  repository: PostgresOnboardingTransitionRepository,
): OnboardingTransitionSink {
  return {
    append: (record) =>
      repository.append({
        aggregate: record.aggregate,
        aggregateId: record.aggregateId,
        nextState: record.nextState,
        operationId: record.operationId,
        previousState: record.previousState,
        reason: record.reason,
        recordedAt: record.recordedAt,
      }),
  };
}

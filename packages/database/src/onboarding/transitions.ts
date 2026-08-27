import { randomUUID } from 'node:crypto';

import type {
  OnboardingTransitionRecord,
  OnboardingTransitionSink,
} from '@fitness-os/domain';

import type { PostgresConnection } from '../connection.js';
import { onboardingTransition } from './tables.js';

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

const AGGREGATES = new Set<OnboardingTransitionRecord['aggregate']>([
  'invitation',
  'attempt',
  'role_mapping',
  'operation',
]);

/**
 * Disposable append-only PG-backed transition sink. Ordinary application
 * code only inserts; there is no update/delete method on this repository.
 * Duplicate (aggregate, aggregateId, operationId, previousState, nextState)
 * rows are rejected as `conflict`, mirroring the in-memory synthetic sink.
 */
export function createPostgresOnboardingTransitionSink(
  connection: PostgresConnection,
): OnboardingTransitionSink {
  return {
    append: async (
      record: OnboardingTransitionRecord,
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
          nextState: record.nextState,
          operationId: record.operationId,
          previousState: record.previousState,
          reason: record.reason,
          recordedAt: record.recordedAt,
          transitionId: randomUUID(),
        });
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'onboarding_transition_dedupe_unique')) {
          return 'conflict';
        }
        throw error;
      }
    },
  };
}

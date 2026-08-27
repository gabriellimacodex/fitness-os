import { asc, eq } from 'drizzle-orm';
import type {
  PrivacyProcessorStepRepository,
  PrivacyReferencePutResult,
} from '@fitness-os/domain';
import {
  privacyProcessorStepReferenceSchema,
  type PrivacyProcessorStepReference,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { privacyProcessorStep } from './tables.js';

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

function toReference(
  row: typeof privacyProcessorStep.$inferSelect,
): PrivacyProcessorStepReference {
  return privacyProcessorStepReferenceSchema.parse({
    stepId: row.stepId,
    requestId: row.requestId,
    processorId: row.processorId,
    capability: row.capability,
    outcome: row.outcome,
    operationId: row.operationId,
    correlationId: row.correlationId,
    recordedAt: new Date(row.recordedAt).toISOString(),
  });
}

export function createPostgresPrivacyProcessorStepRepository(
  connection: PostgresConnection,
): PrivacyProcessorStepRepository {
  return {
    append: async (step): Promise<PrivacyReferencePutResult> => {
      const valid = privacyProcessorStepReferenceSchema.parse(step);
      try {
        await connection.db.insert(privacyProcessorStep).values({
          stepId: valid.stepId,
          requestId: valid.requestId,
          processorId: valid.processorId,
          capability: valid.capability,
          outcome: valid.outcome,
          operationId: valid.operationId,
          correlationId: valid.correlationId,
          recordedAt: valid.recordedAt,
        });
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_processor_step_pkey')) {
          return 'conflict';
        }
        throw error;
      }
    },

    listForRequest: async (requestId) => {
      const rows = await connection.db
        .select()
        .from(privacyProcessorStep)
        .where(eq(privacyProcessorStep.requestId, requestId))
        .orderBy(asc(privacyProcessorStep.recordedAt));
      return rows.map(toReference);
    },
  };
}

import { and, eq } from 'drizzle-orm';
import type { PrivacyProcessorExecutionJournal } from '@fitness-os/domain';
import {
  privacyProcessorExecutionJournalRecordSchema,
  type PrivacyProcessorExecutionJournalRecord,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { privacyProcessorExecutionJournal } from './tables.js';

function isPrimaryKeyViolation(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  ) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    isPrimaryKeyViolation(error.cause)
  );
}

const toRecord = (
  row: typeof privacyProcessorExecutionJournal.$inferSelect,
): PrivacyProcessorExecutionJournalRecord =>
  privacyProcessorExecutionJournalRecordSchema.parse({
    operationId: row.operationId,
    requestId: row.requestId,
    processorId: row.processorId,
    capability: row.capability,
    correlationId: row.correlationId,
    bindingDigest: row.bindingDigest,
    state: row.state,
    outcome: row.outcome,
    reservedAt: new Date(row.reservedAt).toISOString(),
    completedAt:
      row.completedAt === null ? null : new Date(row.completedAt).toISOString(),
    synthetic: row.synthetic,
  });

const sameBinding = (
  left: PrivacyProcessorExecutionJournalRecord,
  right: PrivacyProcessorExecutionJournalRecord,
) =>
  left.bindingDigest === right.bindingDigest &&
  left.requestId === right.requestId &&
  left.processorId === right.processorId &&
  left.capability === right.capability &&
  left.correlationId === right.correlationId &&
  left.synthetic === true &&
  right.synthetic === true;

export function createPostgresPrivacyProcessorExecutionJournal(
  connection: PostgresConnection,
): PrivacyProcessorExecutionJournal {
  const getByOperationId = async (operationId: string) => {
    const rows = await connection.db
      .select()
      .from(privacyProcessorExecutionJournal)
      .where(eq(privacyProcessorExecutionJournal.operationId, operationId));
    return rows[0] === undefined ? null : toRecord(rows[0]);
  };

  return {
    getByOperationId,

    reserve: async (candidate) => {
      const valid =
        privacyProcessorExecutionJournalRecordSchema.parse(candidate);
      if (valid.state !== 'reserved') return { status: 'conflict' };

      try {
        await connection.db.insert(privacyProcessorExecutionJournal).values({
          ...valid,
          completedAt: null,
          outcome: null,
        });
        return { status: 'reserved' };
      } catch (error) {
        if (!isPrimaryKeyViolation(error)) throw error;
      }

      const prior = await getByOperationId(valid.operationId);
      if (prior === null || !sameBinding(prior, valid)) {
        return { status: 'conflict' };
      }
      if (prior.state === 'completed') {
        return { status: 'completed', record: prior };
      }
      if (prior.state === 'reserved') {
        const reconciled = await connection.db
          .update(privacyProcessorExecutionJournal)
          .set({ state: 'reconciliation_required' })
          .where(
            and(
              eq(
                privacyProcessorExecutionJournal.operationId,
                valid.operationId,
              ),
              eq(
                privacyProcessorExecutionJournal.bindingDigest,
                valid.bindingDigest,
              ),
              eq(privacyProcessorExecutionJournal.state, 'reserved'),
            ),
          )
          .returning();
        if (reconciled.length === 1) {
          return { status: 'reconciliation_required' };
        }

        const raced = await getByOperationId(valid.operationId);
        if (raced === null || !sameBinding(raced, valid)) {
          return { status: 'conflict' };
        }
        if (raced.state === 'completed') {
          return { status: 'completed', record: raced };
        }
      }
      return { status: 'reconciliation_required' };
    },

    complete: async (candidate) => {
      const valid =
        privacyProcessorExecutionJournalRecordSchema.parse(candidate);
      if (valid.state !== 'completed') return 'conflict';

      const updated = await connection.db
        .update(privacyProcessorExecutionJournal)
        .set({
          state: valid.state,
          outcome: valid.outcome,
          completedAt: valid.completedAt,
        })
        .where(
          and(
            eq(privacyProcessorExecutionJournal.operationId, valid.operationId),
            eq(
              privacyProcessorExecutionJournal.bindingDigest,
              valid.bindingDigest,
            ),
            eq(privacyProcessorExecutionJournal.state, 'reserved'),
          ),
        )
        .returning();
      if (updated.length === 1) return 'accepted';

      const prior = await getByOperationId(valid.operationId);
      return prior !== null &&
        sameBinding(prior, valid) &&
        prior.state === 'completed' &&
        prior.outcome === valid.outcome &&
        prior.completedAt === valid.completedAt
        ? 'idempotent_replay'
        : 'conflict';
    },

    markReconciliationRequired: async (operationId, bindingDigest) => {
      const updated = await connection.db
        .update(privacyProcessorExecutionJournal)
        .set({ state: 'reconciliation_required' })
        .where(
          and(
            eq(privacyProcessorExecutionJournal.operationId, operationId),
            eq(privacyProcessorExecutionJournal.bindingDigest, bindingDigest),
            eq(privacyProcessorExecutionJournal.state, 'reserved'),
          ),
        )
        .returning();
      if (updated.length === 1) return 'accepted';

      const prior = await getByOperationId(operationId);
      return prior?.bindingDigest === bindingDigest &&
        prior.state === 'reconciliation_required'
        ? 'accepted'
        : 'conflict';
    },
  };
}

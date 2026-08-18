import { eq } from 'drizzle-orm';
import type {
  PrivacyAuditSink,
  PrivacyAuthorizationEvidenceLedger,
  PrivacyEvidenceAppendResult,
  PrivacyWithdrawalAppendResult,
} from '@fitness-os/domain';
import { planWithdrawal } from '@fitness-os/domain';
import {
  privacyAuditEventReferenceSchema,
  privacyEvidenceReferenceSchema,
  privacyWithdrawalReferenceSchema,
  type PrivacyAuditEventReference,
  type PrivacyEvidenceReference,
  type PrivacyWithdrawalReference,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import {
  privacyAuditEvent,
  privacyAuthorizationEvidence,
  privacyWithdrawal,
} from './tables.js';

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

function toEvidence(
  row: typeof privacyAuthorizationEvidence.$inferSelect,
): PrivacyEvidenceReference {
  return privacyEvidenceReferenceSchema.parse({
    evidenceId: row.evidenceId,
    purposeId: row.purposeId,
    policyVersionId: row.policyVersionId,
    contentDigest: row.contentDigest,
    recordedAt: new Date(row.recordedAt).toISOString(),
  });
}

function toWithdrawal(
  row: typeof privacyWithdrawal.$inferSelect,
): PrivacyWithdrawalReference {
  return privacyWithdrawalReferenceSchema.parse({
    withdrawalId: row.withdrawalId,
    evidenceId: row.evidenceId,
    state: row.state,
    withdrawnAt: new Date(row.withdrawnAt).toISOString(),
    operationId: row.operationId,
    processingOutcome: row.processingOutcome,
  });
}

export type PostgresPrivacyAuthorizationEvidenceLedger =
  PrivacyAuthorizationEvidenceLedger;

export function createPostgresPrivacyAuthorizationEvidenceLedger(
  connection: PostgresConnection,
): PostgresPrivacyAuthorizationEvidenceLedger {
  return {
    getEvidence: async (evidenceId) => {
      const [row] = await connection.db
        .select()
        .from(privacyAuthorizationEvidence)
        .where(eq(privacyAuthorizationEvidence.evidenceId, evidenceId))
        .limit(1);
      return row ? toEvidence(row) : null;
    },

    getAuthoritativeWithdrawal: async (evidenceId) => {
      const [row] = await connection.db
        .select()
        .from(privacyWithdrawal)
        .where(eq(privacyWithdrawal.evidenceId, evidenceId))
        .limit(1);
      return row ? toWithdrawal(row) : null;
    },

    appendEvidence: async (record): Promise<PrivacyEvidenceAppendResult> => {
      const valid = privacyEvidenceReferenceSchema.parse(record);
      try {
        await connection.db.insert(privacyAuthorizationEvidence).values({
          evidenceId: valid.evidenceId,
          purposeId: valid.purposeId,
          policyVersionId: valid.policyVersionId,
          contentDigest: valid.contentDigest,
          recordedAt: valid.recordedAt,
        });
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_authorization_evidence_pkey')) {
          return 'conflict';
        }
        throw error;
      }
    },

    appendWithdrawal: async (
      record,
    ): Promise<PrivacyWithdrawalAppendResult> => {
      const valid = privacyWithdrawalReferenceSchema.parse(record);
      const existing = await connection.db
        .select()
        .from(privacyWithdrawal)
        .where(eq(privacyWithdrawal.evidenceId, valid.evidenceId))
        .limit(1)
        .then((rows) => (rows[0] ? toWithdrawal(rows[0]) : null));

      const planned = planWithdrawal({
        existing,
        withdrawalId: valid.withdrawalId,
        evidenceId: valid.evidenceId,
        operationId: valid.operationId,
        withdrawnAt: valid.withdrawnAt,
      });

      if (planned.status === 'conflict') {
        return 'conflict';
      }
      if (planned.status === 'already_withdrawn') {
        return 'already_withdrawn';
      }
      if (planned.status === 'idempotent_replay') {
        return 'idempotent_replay';
      }

      try {
        await connection.db.insert(privacyWithdrawal).values({
          withdrawalId: planned.withdrawal.withdrawalId,
          evidenceId: planned.withdrawal.evidenceId,
          state: planned.withdrawal.state,
          withdrawnAt: planned.withdrawal.withdrawnAt,
          operationId: planned.withdrawal.operationId,
          processingOutcome: planned.withdrawal.processingOutcome,
        });
        return 'accepted';
      } catch (error) {
        if (
          isUniqueViolation(error, 'privacy_withdrawal_evidence_id_unique') ||
          isUniqueViolation(error, 'privacy_withdrawal_operation_id_unique') ||
          isUniqueViolation(error, 'privacy_withdrawal_pkey')
        ) {
          return 'conflict';
        }
        throw error;
      }
    },
  };
}

export function createPostgresPrivacyAuditSink(
  connection: PostgresConnection,
): PrivacyAuditSink {
  return {
    append: async (
      event: PrivacyAuditEventReference,
    ): Promise<'accepted' | 'unavailable'> => {
      try {
        const valid = privacyAuditEventReferenceSchema.parse(event);
        await connection.db.insert(privacyAuditEvent).values({
          auditEventId: valid.auditEventId,
          kind: valid.kind,
          outcome: valid.outcome,
          reasonCode: valid.reasonCode,
          policyVersionId: valid.policyVersionId,
          evidenceId: valid.evidenceId,
          requestId: valid.requestId,
          operationId: valid.operationId,
          correlationId: valid.correlationId,
          recordedAt: valid.recordedAt,
        });
        return 'accepted';
      } catch {
        return 'unavailable';
      }
    },
  };
}

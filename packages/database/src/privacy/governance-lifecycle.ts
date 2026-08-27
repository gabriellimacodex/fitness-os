import { eq } from 'drizzle-orm';
import type {
  PrivacyGovernanceLifecycleAppendResult,
  PrivacyGovernanceLifecycleLedger,
} from '@fitness-os/domain';
import {
  privacyGovernanceLifecycleProofReferenceSchema,
  type PrivacyGovernanceLifecycleProofReference,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { privacyGovernanceLifecycleProof } from './tables.js';

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
  row: typeof privacyGovernanceLifecycleProof.$inferSelect,
): PrivacyGovernanceLifecycleProofReference {
  const result =
    row.outcome === 'denied'
      ? { outcome: 'denied' as const }
      : {
          outcome: row.outcome as 'completed' | 'partially_failed',
          proofId: row.proofId,
        };

  return privacyGovernanceLifecycleProofReferenceSchema.parse({
    requestId: row.requestId,
    processorId: row.processorId,
    operationId: row.operationId,
    result,
    recordedAt: new Date(row.recordedAt).toISOString(),
    synthetic: row.synthetic,
  });
}

export type PostgresPrivacyGovernanceLifecycleLedger =
  PrivacyGovernanceLifecycleLedger;

export function createPostgresPrivacyGovernanceLifecycleLedger(
  connection: PostgresConnection,
): PostgresPrivacyGovernanceLifecycleLedger {
  return {
    getByOperationId: async (operationId) => {
      const [row] = await connection.db
        .select()
        .from(privacyGovernanceLifecycleProof)
        .where(eq(privacyGovernanceLifecycleProof.operationId, operationId))
        .limit(1);
      return row ? toReference(row) : null;
    },

    append: async (record): Promise<PrivacyGovernanceLifecycleAppendResult> => {
      const valid =
        privacyGovernanceLifecycleProofReferenceSchema.parse(record);
      try {
        await connection.db.insert(privacyGovernanceLifecycleProof).values({
          requestId: valid.requestId,
          processorId: valid.processorId,
          operationId: valid.operationId,
          outcome: valid.result.outcome,
          proofId:
            valid.result.outcome === 'denied' ? null : valid.result.proofId,
          recordedAt: valid.recordedAt,
          synthetic: valid.synthetic,
        });
        return 'accepted';
      } catch (error) {
        if (
          isUniqueViolation(error, 'privacy_governance_lifecycle_proof_pkey')
        ) {
          return 'conflict';
        }
        throw error;
      }
    },
  };
}

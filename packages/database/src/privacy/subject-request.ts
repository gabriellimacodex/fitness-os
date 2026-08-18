import { and, asc, eq } from 'drizzle-orm';
import type {
  PrivacyReferencePutResult,
  PrivacySubjectRequestApplyResult,
  PrivacySubjectRequestRepository,
} from '@fitness-os/domain';
import { transitionSubjectRequest } from '@fitness-os/domain';
import {
  privacySubjectRequestReferenceSchema,
  privacySubjectRequestTransitionReferenceSchema,
  type PrivacyCorrelationId,
  type PrivacyOperationId,
  type PrivacySubjectRequestReference,
  type PrivacySubjectRequestState,
  type PrivacySubjectRequestTransitionId,
  type PrivacySubjectRequestTransitionReason,
  type PrivacySubjectRequestTransitionReference,
  type PrivacyVerificationReference,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import {
  privacySubjectRequest,
  privacySubjectRequestTransition,
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

function toReference(
  row: typeof privacySubjectRequest.$inferSelect,
): PrivacySubjectRequestReference {
  const verification =
    row.verificationRefDigest === null || row.verificationSynthetic === null
      ? null
      : {
          verificationRefDigest: row.verificationRefDigest,
          synthetic: row.verificationSynthetic,
        };

  return privacySubjectRequestReferenceSchema.parse({
    requestId: row.requestId,
    requestType: row.requestType,
    state: row.state,
    verification,
    policyVersionId: row.policyVersionId,
    inventoryVersionDigest: row.inventoryVersionDigest,
    correlationId: row.correlationId,
    updatedAt: new Date(row.updatedAt).toISOString(),
  });
}

function toTransition(
  row: typeof privacySubjectRequestTransition.$inferSelect,
): PrivacySubjectRequestTransitionReference {
  return privacySubjectRequestTransitionReferenceSchema.parse({
    transitionId: row.transitionId,
    requestId: row.requestId,
    previousState: row.previousState,
    nextState: row.nextState,
    operationId: row.operationId,
    correlationId: row.correlationId,
    reasonCode: row.reasonCode,
    verificationRefDigest: row.verificationRefDigest,
    recordedAt: new Date(row.recordedAt).toISOString(),
  });
}

function toRow(record: PrivacySubjectRequestReference) {
  return {
    requestId: record.requestId,
    requestType: record.requestType,
    state: record.state,
    verificationRefDigest: record.verification?.verificationRefDigest ?? null,
    verificationSynthetic: record.verification?.synthetic ?? null,
    policyVersionId: record.policyVersionId,
    inventoryVersionDigest: record.inventoryVersionDigest,
    correlationId: record.correlationId,
    updatedAt: record.updatedAt,
  };
}

export function createPostgresPrivacySubjectRequestRepository(
  connection: PostgresConnection,
): PrivacySubjectRequestRepository {
  return {
    get: async (requestId) => {
      const [row] = await connection.db
        .select()
        .from(privacySubjectRequest)
        .where(eq(privacySubjectRequest.requestId, requestId))
        .limit(1);
      return row ? toReference(row) : null;
    },

    put: async (record): Promise<PrivacyReferencePutResult> => {
      const valid = privacySubjectRequestReferenceSchema.parse(record);
      try {
        await connection.db.insert(privacySubjectRequest).values(toRow(valid));
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_subject_request_pkey')) {
          return 'conflict';
        }
        throw error;
      }
    },

    listTransitions: async (requestId) => {
      const rows = await connection.db
        .select()
        .from(privacySubjectRequestTransition)
        .where(eq(privacySubjectRequestTransition.requestId, requestId))
        .orderBy(asc(privacySubjectRequestTransition.recordedAt));
      return rows.map(toTransition);
    },

    applyTransition: async (input: {
      requestId: string;
      next: PrivacySubjectRequestState;
      updatedAt: string;
      transitionId: PrivacySubjectRequestTransitionId;
      operationId: PrivacyOperationId;
      correlationId: PrivacyCorrelationId;
      reasonCode?: PrivacySubjectRequestTransitionReason | null;
      verification?: PrivacyVerificationReference | null;
      productionMode?: boolean;
    }): Promise<PrivacySubjectRequestApplyResult> => {
      try {
        return await connection.db.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(privacySubjectRequest)
            .where(eq(privacySubjectRequest.requestId, input.requestId))
            .for('update');

          if (!row) {
            return { reason: 'not_found' as const, status: 'invalid' as const };
          }

          const current = toReference(row);
          const result = transitionSubjectRequest({
            request: current,
            next: input.next,
            updatedAt: input.updatedAt,
            verification: input.verification,
            productionMode: input.productionMode,
          });

          if (result.status !== 'advanced') {
            return result;
          }

          const transition =
            privacySubjectRequestTransitionReferenceSchema.parse({
              transitionId: input.transitionId,
              requestId: current.requestId,
              previousState: current.state,
              nextState: result.request.state,
              operationId: input.operationId,
              correlationId: input.correlationId,
              reasonCode: input.reasonCode ?? null,
              verificationRefDigest:
                result.request.verification?.verificationRefDigest ?? null,
              recordedAt: input.updatedAt,
            });

          const updated = await tx
            .update(privacySubjectRequest)
            .set(toRow(result.request))
            .where(
              and(
                eq(privacySubjectRequest.requestId, result.request.requestId),
                eq(privacySubjectRequest.state, current.state),
              ),
            )
            .returning({ requestId: privacySubjectRequest.requestId });

          if (updated.length === 0) {
            return { status: 'conflict' as const };
          }

          await tx.insert(privacySubjectRequestTransition).values({
            transitionId: transition.transitionId,
            requestId: transition.requestId,
            previousState: transition.previousState,
            nextState: transition.nextState,
            operationId: transition.operationId,
            correlationId: transition.correlationId,
            reasonCode: transition.reasonCode,
            verificationRefDigest: transition.verificationRefDigest,
            recordedAt: transition.recordedAt,
          });

          return {
            request: result.request,
            status: 'advanced' as const,
            transition,
          };
        });
      } catch (error) {
        if (
          isUniqueViolation(
            error,
            'privacy_subject_request_transition_operation_id_unique',
          ) ||
          isUniqueViolation(error, 'privacy_subject_request_transition_pkey')
        ) {
          return { status: 'conflict' };
        }
        throw error;
      }
    },
  };
}

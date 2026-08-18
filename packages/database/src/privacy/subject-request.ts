import { eq } from 'drizzle-orm';
import type {
  PrivacyReferencePutResult,
  PrivacySubjectRequestApplyResult,
  PrivacySubjectRequestRepository,
} from '@fitness-os/domain';
import { transitionSubjectRequest } from '@fitness-os/domain';
import {
  privacySubjectRequestReferenceSchema,
  type PrivacySubjectRequestReference,
  type PrivacySubjectRequestState,
  type PrivacyVerificationReference,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { privacySubjectRequest } from './tables.js';

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

    applyTransition: async (input: {
      requestId: string;
      next: PrivacySubjectRequestState;
      updatedAt: string;
      verification?: PrivacyVerificationReference | null;
      productionMode?: boolean;
    }): Promise<PrivacySubjectRequestApplyResult> => {
      const [row] = await connection.db
        .select()
        .from(privacySubjectRequest)
        .where(eq(privacySubjectRequest.requestId, input.requestId))
        .limit(1);

      if (!row) {
        return { reason: 'not_found', status: 'invalid' };
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

      await connection.db
        .update(privacySubjectRequest)
        .set(toRow(result.request))
        .where(eq(privacySubjectRequest.requestId, result.request.requestId));

      return result;
    },
  };
}

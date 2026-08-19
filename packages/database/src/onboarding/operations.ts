import { eq } from 'drizzle-orm';
import {
  onboardingOperationIdSchema,
  type OnboardingOperationId,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { onboardingOperation } from './tables.js';

export type OnboardingMutationNamespace =
  | 'create_attempt'
  | 'resume_attempt'
  | 'abandon_attempt'
  | 'refresh_policy'
  | 'claim_attempt'
  | 'issue_student_invitation'
  | 'revoke_student_invitation';

export type StoredOnboardingOperation = {
  bindingKey: string;
  createdAt: string;
  digest: string;
  namespace: OnboardingMutationNamespace;
  operationId: OnboardingOperationId;
  principalKey: string;
  result: unknown;
  retryDigest: string;
};

export type OnboardingOperationPutResult =
  | { status: 'accepted'; operation: StoredOnboardingOperation }
  | { status: 'replay'; operation: StoredOnboardingOperation }
  | { status: 'conflict'; operation: StoredOnboardingOperation };

const NAMESPACES = new Set<OnboardingMutationNamespace>([
  'create_attempt',
  'resume_attempt',
  'abandon_attempt',
  'refresh_policy',
  'claim_attempt',
  'issue_student_invitation',
  'revoke_student_invitation',
]);

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
  row: typeof onboardingOperation.$inferSelect,
): StoredOnboardingOperation {
  if (!NAMESPACES.has(row.namespace as OnboardingMutationNamespace)) {
    throw new Error(
      `unexpected onboarding operation namespace: ${row.namespace}`,
    );
  }

  return {
    bindingKey: row.bindingKey,
    createdAt: new Date(row.createdAt).toISOString(),
    digest: row.digest,
    namespace: row.namespace as OnboardingMutationNamespace,
    operationId: onboardingOperationIdSchema.parse(row.operationId),
    principalKey: row.principalKey,
    result: row.result,
    retryDigest: row.retryDigest,
  };
}

export function createPostgresOnboardingOperationRepository(
  connection: PostgresConnection,
) {
  return {
    getByBindingKey: async (
      bindingKey: string,
    ): Promise<StoredOnboardingOperation | null> => {
      const [row] = await connection.db
        .select()
        .from(onboardingOperation)
        .where(eq(onboardingOperation.bindingKey, bindingKey))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    getByOperationId: async (
      operationId: string,
    ): Promise<StoredOnboardingOperation | null> => {
      const [row] = await connection.db
        .select()
        .from(onboardingOperation)
        .where(eq(onboardingOperation.operationId, operationId))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    /**
     * Append-only put. Same binding+digest → idempotent replay.
     * Same binding, different digest → conflict with existing row.
     */
    put: async (
      record: StoredOnboardingOperation,
    ): Promise<OnboardingOperationPutResult> => {
      if (!NAMESPACES.has(record.namespace)) {
        throw new Error(
          `unexpected onboarding operation namespace: ${record.namespace}`,
        );
      }
      if (!/^hmac-sha256\.v1:[a-f0-9]{64}$/.test(record.retryDigest)) {
        throw new Error('invalid onboarding operation retryDigest');
      }
      if (!/^[a-f0-9]{64}$/.test(record.digest)) {
        throw new Error('invalid onboarding operation digest');
      }

      try {
        await connection.db.insert(onboardingOperation).values({
          bindingKey: record.bindingKey,
          createdAt: record.createdAt,
          digest: record.digest,
          namespace: record.namespace,
          operationId: record.operationId,
          principalKey: record.principalKey,
          result: record.result,
          retryDigest: record.retryDigest,
        });
        return { operation: record, status: 'accepted' };
      } catch (error) {
        if (
          isUniqueViolation(error, 'onboarding_operation_binding_key_unique') ||
          isUniqueViolation(error, 'onboarding_operation_pkey')
        ) {
          const existing =
            (await connection.db
              .select()
              .from(onboardingOperation)
              .where(eq(onboardingOperation.bindingKey, record.bindingKey))
              .limit(1)
              .then((rows) => (rows[0] ? toRecord(rows[0]) : null))) ??
            (await connection.db
              .select()
              .from(onboardingOperation)
              .where(eq(onboardingOperation.operationId, record.operationId))
              .limit(1)
              .then((rows) => (rows[0] ? toRecord(rows[0]) : null)));

          if (existing === null) {
            throw error;
          }

          if (existing.digest === record.digest) {
            return { operation: existing, status: 'replay' };
          }

          return { operation: existing, status: 'conflict' };
        }
        throw error;
      }
    },
  };
}

export type PostgresOnboardingOperationRepository = ReturnType<
  typeof createPostgresOnboardingOperationRepository
>;

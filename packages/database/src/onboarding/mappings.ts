import { and, eq } from 'drizzle-orm';
import type { ProposedRole } from '@fitness-os/domain';
import {
  principalRoleMappingIdSchema,
  proposedRoleSchema,
  type PrincipalRoleMappingId,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { onboardingRoleMapping } from './tables.js';

export type StoredOnboardingRoleMapping = {
  createdAt: string;
  mappingId: PrincipalRoleMappingId;
  principalKey: string;
  role: ProposedRole;
};

export type OnboardingRoleMappingPutResult =
  | { status: 'accepted'; mapping: StoredOnboardingRoleMapping }
  | { status: 'replay'; mapping: StoredOnboardingRoleMapping }
  | { status: 'conflict'; mapping: StoredOnboardingRoleMapping };

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
  row: typeof onboardingRoleMapping.$inferSelect,
): StoredOnboardingRoleMapping {
  return {
    createdAt: new Date(row.createdAt).toISOString(),
    mappingId: principalRoleMappingIdSchema.parse(row.mappingId),
    principalKey: row.principalKey,
    role: proposedRoleSchema.parse(row.role),
  };
}

export function createPostgresOnboardingRoleMappingRepository(
  connection: PostgresConnection,
) {
  return {
    get: async (
      mappingId: string,
    ): Promise<StoredOnboardingRoleMapping | null> => {
      const [row] = await connection.db
        .select()
        .from(onboardingRoleMapping)
        .where(eq(onboardingRoleMapping.mappingId, mappingId))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    listByPrincipal: async (
      principalKey: string,
    ): Promise<readonly StoredOnboardingRoleMapping[]> => {
      const rows = await connection.db
        .select()
        .from(onboardingRoleMapping)
        .where(eq(onboardingRoleMapping.principalKey, principalKey));
      return rows.map(toRecord);
    },

    /**
     * Append-only put. Same principal+role (or same mapping_id) replays.
     * Same principal+role with a different mapping_id conflicts.
     */
    put: async (
      record: StoredOnboardingRoleMapping,
    ): Promise<OnboardingRoleMappingPutResult> => {
      try {
        await connection.db.insert(onboardingRoleMapping).values({
          createdAt: record.createdAt,
          mappingId: record.mappingId,
          principalKey: record.principalKey,
          role: record.role,
        });
        return { mapping: record, status: 'accepted' };
      } catch (error) {
        if (
          isUniqueViolation(
            error,
            'onboarding_role_mapping_principal_role_unique',
          ) ||
          isUniqueViolation(error, 'onboarding_role_mapping_pkey')
        ) {
          const existing =
            (await connection.db
              .select()
              .from(onboardingRoleMapping)
              .where(
                and(
                  eq(onboardingRoleMapping.principalKey, record.principalKey),
                  eq(onboardingRoleMapping.role, record.role),
                ),
              )
              .limit(1)
              .then((rows) => (rows[0] ? toRecord(rows[0]) : null))) ??
            (await connection.db
              .select()
              .from(onboardingRoleMapping)
              .where(eq(onboardingRoleMapping.mappingId, record.mappingId))
              .limit(1)
              .then((rows) => (rows[0] ? toRecord(rows[0]) : null)));

          if (existing === null) {
            throw error;
          }

          if (
            existing.mappingId === record.mappingId &&
            existing.principalKey === record.principalKey &&
            existing.role === record.role
          ) {
            return { mapping: existing, status: 'replay' };
          }

          return { mapping: existing, status: 'conflict' };
        }
        throw error;
      }
    },
  };
}

export type PostgresOnboardingRoleMappingRepository = ReturnType<
  typeof createPostgresOnboardingRoleMappingRepository
>;

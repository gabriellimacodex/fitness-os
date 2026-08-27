import { eq } from 'drizzle-orm';
import type {
  PrincipalBindingRecord,
  PrincipalBindingRepository,
  PrincipalBindingResolveResult,
} from '@fitness-os/domain';

import type { PostgresConnection } from '../connection.js';
import { onboardingPrincipalBinding } from './tables.js';

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
  row: typeof onboardingPrincipalBinding.$inferSelect,
): PrincipalBindingRecord {
  return {
    bindingId: row.bindingId,
    createdAt: new Date(row.createdAt).toISOString(),
    principalKey: row.principalKey,
  };
}

export function createPostgresPrincipalBindingRepository(
  connection: PostgresConnection,
) {
  return {
    getByPrincipalKey: async (
      principalKey: string,
    ): Promise<PrincipalBindingRecord | null> => {
      const [row] = await connection.db
        .select()
        .from(onboardingPrincipalBinding)
        .where(eq(onboardingPrincipalBinding.principalKey, principalKey))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    /**
     * Insert-once, resolve-on-race: a first caller for a principalKey
     * establishes the binding; a concurrent or later caller resolves the
     * same row rather than creating a second one. Denies before any
     * database access in production mode or for an empty principalKey,
     * matching `SyntheticPrincipalBindingRepository` exactly.
     */
    resolveOrEstablish: async (input: {
      principalKey: string;
      productionMode: boolean;
      nowUtcMs: string;
    }): Promise<PrincipalBindingResolveResult> => {
      if (input.productionMode) {
        return { reason: 'synthetic_in_production', status: 'denied' };
      }
      if (input.principalKey.trim() === '') {
        return { reason: 'missing', status: 'denied' };
      }

      try {
        const [row] = await connection.db
          .insert(onboardingPrincipalBinding)
          .values({
            principalKey: input.principalKey,
            createdAt: input.nowUtcMs,
          })
          .returning();
        if (!row) {
          throw new Error('insert returned no row');
        }
        return { binding: toRecord(row), status: 'established' };
      } catch (error) {
        if (
          isUniqueViolation(
            error,
            'onboarding_principal_binding_principal_key_unique',
          )
        ) {
          const existing = await connection.db
            .select()
            .from(onboardingPrincipalBinding)
            .where(
              eq(onboardingPrincipalBinding.principalKey, input.principalKey),
            )
            .limit(1)
            .then((rows) => (rows[0] ? toRecord(rows[0]) : null));
          if (existing === null) {
            throw error;
          }
          return { binding: existing, status: 'resolved' };
        }
        throw error;
      }
    },
  };
}

export type PostgresPrincipalBindingRepository = ReturnType<
  typeof createPostgresPrincipalBindingRepository
>;

/** Structural adapter: disposable PG repo satisfies the domain port. */
export function asPrincipalBindingRepository(
  repository: PostgresPrincipalBindingRepository,
): PrincipalBindingRepository {
  return repository;
}

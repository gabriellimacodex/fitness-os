import { and, eq, gt } from 'drizzle-orm';
import type { ClaimFailureTracker } from '@fitness-os/domain';

import type { PostgresConnection } from '../connection.js';
import { onboardingClaimFailure } from './tables.js';

/**
 * PG-backed `ClaimFailureTracker`. Unlike `SyntheticClaimFailureTracker`,
 * this survives a restart and is shared across replicas because it reads and
 * writes one PostgreSQL table rather than process-local memory; it stores no
 * claim secret, invitation, or outcome detail, only the opaque caller key and
 * the trusted failure instant.
 */
export function createPostgresClaimFailureTracker(
  connection: PostgresConnection,
) {
  return {
    /**
     * Failure timestamps recorded for `key` strictly after `sinceUtcMs`, in
     * no guaranteed order — matching `SyntheticClaimFailureTracker` exactly.
     */
    recentFailures: async (
      key: string,
      sinceUtcMs: number,
    ): Promise<readonly number[]> => {
      const rows = await connection.db
        .select({ occurredAt: onboardingClaimFailure.occurredAt })
        .from(onboardingClaimFailure)
        .where(
          and(
            eq(onboardingClaimFailure.key, key),
            gt(
              onboardingClaimFailure.occurredAt,
              new Date(sinceUtcMs).toISOString(),
            ),
          ),
        );
      return rows.map((row) => new Date(row.occurredAt).getTime());
    },

    recordFailure: async (key: string, atUtcMs: number): Promise<void> => {
      await connection.db.insert(onboardingClaimFailure).values({
        key,
        occurredAt: new Date(atUtcMs).toISOString(),
      });
    },
  };
}

export type PostgresClaimFailureTracker = ReturnType<
  typeof createPostgresClaimFailureTracker
>;

/** Structural adapter: disposable PG tracker satisfies the domain port. */
export function asClaimFailureTracker(
  tracker: PostgresClaimFailureTracker,
): ClaimFailureTracker {
  return tracker;
}

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import type {
  OnboardingMechanismSelfTestComponents,
  OnboardingReadinessComponent,
  OnboardingReadinessComponentId,
  OnboardingReadinessProbe,
  OnboardingReadinessResult,
} from '@fitness-os/domain';
import {
  createSelfTestOnboardingReadinessProbe,
  SyntheticOnboardingReadinessProbe,
} from '@fitness-os/domain';

import type { PostgresConnection } from '../connection.js';
import { journalContainsRequiredHashes } from '../catalog/migration-readiness.js';
import { readJournalHashes } from '../catalog/readiness.js';
import { createPostgresClaimFailureTracker } from './claim-failure.js';

const drizzleRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

const REQUIRED_ONBOARDING_MIGRATION_FILES = [
  '0000_flippant_rick_jones.sql',
  '0007_prd07_onboarding_invitation.sql',
  '0008_prd07_onboarding_attempt.sql',
  '0009_prd07_onboarding_operation.sql',
  '0010_prd07_onboarding_role_mapping.sql',
  '0024_prd07_onboarding_claim_failure.sql',
] as const;

function hashMigrationFile(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(drizzleRoot, relativePath)))
    .digest('hex');
}

/** Content hashes of migrations required for onboarding schema readiness. */
export function requiredOnboardingMigrationHashes(): readonly string[] {
  return REQUIRED_ONBOARDING_MIGRATION_FILES.map((file) =>
    hashMigrationFile(file),
  );
}

export type OnboardingSchemaReadinessResult =
  | { ready: true }
  | {
      ready: false;
      reason:
        | 'missing_required_migration'
        | 'missing_required_table'
        | 'database_error';
      detail?: string;
    };

const REQUIRED_TABLES = [
  'onboarding_invitation',
  'onboarding_attempt',
  'onboarding_operation',
  'onboarding_role_mapping',
  'onboarding_claim_failure',
] as const;

/**
 * Thrown deliberately at the end of the functional claim-failure round-trip
 * transaction so the write never commits. Caught explicitly in
 * `checkOnboardingClaimFailureFunctionalReadiness` and treated as success;
 * any other thrown value is a real failure of the insert/read-back path.
 */
class OnboardingClaimFailureProbeRollback extends Error {}

export type OnboardingClaimFailureFunctionalReadinessResult =
  | { ready: true }
  | {
      ready: false;
      reason: 'round_trip_failed' | 'database_error';
      detail?: string;
    };

/**
 * Exercises the real `createPostgresClaimFailureTracker` path end to end:
 * records one synthetic failure key through the actual tracker
 * implementation inside a transaction, confirms it is visible via
 * `recentFailures`, and always rolls back so no probe row is ever committed
 * to the claim-throttling table. This catches a broken insert/select path
 * (column mismatch, constraint drift, permission failure) that
 * `checkOnboardingSchemaReadiness`'s static migration-hash and `pg_tables`
 * presence check cannot detect, since that check only proves the expected
 * migration ran and `onboarding_claim_failure` exists, not that the
 * production claim-throttling tracker can actually write to and read from
 * it.
 */
export async function checkOnboardingClaimFailureFunctionalReadiness(
  connection: PostgresConnection,
): Promise<OnboardingClaimFailureFunctionalReadinessResult> {
  const probeKey = `readiness-probe:${randomUUID()}`;
  const probeAtUtcMs = Date.now();

  try {
    await connection.db.transaction(async (tx) => {
      const txConnection: PostgresConnection = {
        db: tx,
        close: connection.close,
      };
      const tracker = createPostgresClaimFailureTracker(txConnection);
      await tracker.recordFailure(probeKey, probeAtUtcMs);

      const recentFailures = await tracker.recentFailures(
        probeKey,
        probeAtUtcMs - 1,
      );
      if (!recentFailures.includes(probeAtUtcMs)) {
        throw new Error('round_trip_read_back_missing');
      }

      // Always abort: this is a readiness probe, not a real recorded
      // failure, and must never leave a row in the claim-throttling table.
      throw new OnboardingClaimFailureProbeRollback();
    });

    // The transaction above always throws before reaching a commit; getting
    // here without an error means the sentinel rollback was swallowed
    // somewhere, which is itself not a verified round trip.
    return {
      ready: false,
      reason: 'round_trip_failed',
      detail: 'transaction_completed_without_rollback',
    };
  } catch (error) {
    if (error instanceof OnboardingClaimFailureProbeRollback) {
      return { ready: true };
    }
    const message = error instanceof Error ? error.message : 'unknown';
    const isRoundTripFailure = message === 'round_trip_read_back_missing';
    return {
      ready: false,
      reason: isRoundTripFailure ? 'round_trip_failed' : 'database_error',
      detail: message,
    };
  }
}

/**
 * Readiness components whose backing table is already one of
 * `REQUIRED_TABLES`, so `checkOnboardingSchemaReadiness` is real evidence for
 * them rather than an invented equivalence:
 * `invitation_repository` → `onboarding_invitation`,
 * `attempt_repository` → `onboarding_attempt`,
 * `operation_repository` → `onboarding_operation`,
 * `role_mapping_repository` → `onboarding_role_mapping`.
 *
 * `onboarding_claim_failure` (backing `createPostgresClaimFailureTracker`,
 * used by production claim throttling) has no dedicated readiness component
 * id of its own, so it is folded into the aggregate `schema` component
 * instead: `schema` is ready only when both the static migration/table
 * evidence (`checkOnboardingSchemaReadiness`, covering every table in
 * `REQUIRED_TABLES` including this one) and the functional round trip
 * (`checkOnboardingClaimFailureFunctionalReadiness`) succeed. This is a
 * single combined, fail-closed check across every table this package
 * requires (see the `schema`/repository binding note below), so omitting a
 * real, landed onboarding table from `REQUIRED_TABLES`, or a broken
 * claim-failure insert/select path, would otherwise let the aggregate
 * `schema` component report `ready` while production claim throttling is
 * actually broken.
 */
const REPOSITORY_COMPONENT_IDS = [
  'invitation_repository',
  'attempt_repository',
  'operation_repository',
  'role_mapping_repository',
] as const satisfies readonly OnboardingReadinessComponentId[];

const OVERRIDDEN_COMPONENT_IDS = new Set<OnboardingReadinessComponentId>([
  'schema',
  ...REPOSITORY_COMPONENT_IDS,
]);

/**
 * Schema-level readiness only: exact required migrations applied and exact
 * required tables present. Says nothing about identity/policy adapter
 * composition or production activation — see `OnboardingReadinessProbe` in
 * `@fitness-os/domain` for the full mechanism/production readiness result.
 */
export async function checkOnboardingSchemaReadiness(
  connection: PostgresConnection,
  options: {
    requiredHashes?: readonly string[];
  } = {},
): Promise<OnboardingSchemaReadinessResult> {
  const requiredHashes =
    options.requiredHashes ?? requiredOnboardingMigrationHashes();

  try {
    const journalHashes = await readJournalHashes(connection);
    const journal = journalContainsRequiredHashes(
      journalHashes.map((hash) => ({ hash })),
      requiredHashes,
    );

    if (!journal.ready) {
      return {
        ready: false,
        reason: 'missing_required_migration',
        detail: journal.missingHashes.join(','),
      };
    }

    const rows = await connection.db.execute<{ tablename: string }>(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `);
    const present = new Set(rows.map((row) => row.tablename));
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table));

    if (missing.length > 0) {
      return {
        ready: false,
        reason: 'missing_required_table',
        detail: missing.join(','),
      };
    }

    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      reason: 'database_error',
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

/**
 * Wraps a base `OnboardingReadinessProbe` (defaults to the domain synthetic
 * probe) and replaces its `schema` component plus the four repository
 * components with a real evaluation of `checkOnboardingSchemaReadiness`
 * against `connection`, per PRD 07's "Readiness" section ("Mechanism
 * readiness requires: exact required migration and schema markers"). `schema`
 * additionally requires `checkOnboardingClaimFailureFunctionalReadiness` to
 * succeed once the static check is ready — a real, rolled-back
 * record+read-back through `createPostgresClaimFailureTracker` — since the
 * static migration/table check alone cannot prove that table can actually be
 * written to and read from. The functional check is skipped (and `schema`
 * stays `not_ready`) when the static result itself is not `ready`, since a
 * write would just fail for a reason already reported.
 *
 * The repository components reuse the static schema result (not the
 * functional claim-failure check) because every table they are backed by is
 * already one of `REQUIRED_TABLES` (see `REPOSITORY_COMPONENT_IDS`), so that
 * check is real evidence for them and not an invented equivalence. They are
 * bound as one combined, fail-closed check: any missing required migration or
 * table flips all four `not_ready` together, rather than inferring a finer
 * per-repository split from partial schema state. This is table/migration
 * presence only — it does not exercise a read/write round-trip through the
 * repositories themselves.
 *
 * When `mechanismComponents` is also supplied, this first composes
 * `createSelfTestOnboardingReadinessProbe` from `@fitness-os/domain` around
 * the same base, additionally replacing `clock`, `id_factory`,
 * `secret_factory`, and `secret_verifier` with a real self-test of those
 * instances, so one probe carries both real schema/repository evidence and
 * real mechanism self-tests. Omitting `mechanismComponents` leaves those four
 * components exactly as the base probe reports them, matching prior
 * behavior. Any remaining component (identity/policy adapters) is left
 * exactly as the base probe reports it — this does not verify those. The
 * final evidence is normalized to exactly one database-derived component per
 * overridden id, even if a custom base omits or duplicates them.
 * `mechanismReady` is recomputed as the conjunction of all components so a
 * real schema gap flips it `false`; `productionReady` stays `false`,
 * unaffected by `LEGAL_PRIVACY_DECISION_REQUIRED`.
 */
export function createPostgresOnboardingReadinessProbe(
  connection: PostgresConnection,
  options: {
    baseProbe?: OnboardingReadinessProbe;
    evaluatedAt?: string;
    requiredHashes?: readonly string[];
    mechanismComponents?: OnboardingMechanismSelfTestComponents;
  } = {},
): OnboardingReadinessProbe {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const baseProbe =
    options.baseProbe ?? new SyntheticOnboardingReadinessProbe({ evaluatedAt });
  const composedBaseProbe =
    options.mechanismComponents !== undefined
      ? createSelfTestOnboardingReadinessProbe(options.mechanismComponents, {
          baseProbe,
        })
      : baseProbe;

  return {
    async evaluate(): Promise<OnboardingReadinessResult> {
      const base = await composedBaseProbe.evaluate();
      const schemaResult = await checkOnboardingSchemaReadiness(connection, {
        requiredHashes: options.requiredHashes,
      });
      // Only attempt the functional round trip once the static schema check
      // already reports the required migrations/tables present — otherwise
      // the insert would fail on a missing table for a reason this probe
      // already reports through `schema`, and running it anyway would just
      // duplicate that diagnosis with a heavier DB call.
      const claimFailureFunctionalResult = schemaResult.ready
        ? await checkOnboardingClaimFailureFunctionalReadiness(connection)
        : null;

      const schemaComponent: OnboardingReadinessComponent =
        schemaResult.ready && claimFailureFunctionalResult?.ready === true
          ? { componentId: 'schema', diagnosticCode: null, state: 'ready' }
          : {
              componentId: 'schema',
              diagnosticCode: !schemaResult.ready
                ? schemaResult.reason === 'missing_required_migration'
                  ? 'migration_missing'
                  : schemaResult.reason === 'missing_required_table'
                    ? 'schema_mismatch'
                    : 'configuration_mismatch'
                : 'configuration_mismatch',
              state: 'not_ready',
            };

      const repositoryComponents: OnboardingReadinessComponent[] =
        REPOSITORY_COMPONENT_IDS.map((componentId) =>
          schemaResult.ready
            ? { componentId, diagnosticCode: null, state: 'ready' }
            : {
                componentId,
                diagnosticCode: schemaComponent.diagnosticCode,
                state: 'not_ready',
              },
        );

      const overriddenComponents = [schemaComponent, ...repositoryComponents];
      const remainingComponents = base.components.filter(
        (component) => !OVERRIDDEN_COMPONENT_IDS.has(component.componentId),
      );
      const components = [...overriddenComponents, ...remainingComponents];
      const mechanismReady = components.every(
        (component) => component.state === 'ready',
      );
      // The base probe's own codes for the overridden components describe its
      // default state; drop them before re-adding only what the real check
      // still reports, so a resolved component does not leave a stale code.
      // A code a remaining component still reports is kept.
      const replacedDiagnostics = new Set(
        base.components
          .filter((component) =>
            OVERRIDDEN_COMPONENT_IDS.has(component.componentId),
          )
          .flatMap((component) =>
            component.diagnosticCode === null ? [] : [component.diagnosticCode],
          ),
      );
      const remainingDiagnostics = new Set(
        remainingComponents.flatMap((component) =>
          component.diagnosticCode === null ? [] : [component.diagnosticCode],
        ),
      );
      const diagnosticCodes = [
        ...new Set([
          ...base.diagnosticCodes.filter(
            (diagnostic) =>
              !replacedDiagnostics.has(diagnostic) ||
              remainingDiagnostics.has(diagnostic),
          ),
          ...overriddenComponents.flatMap((component) =>
            component.diagnosticCode === null ? [] : [component.diagnosticCode],
          ),
        ]),
      ];

      return {
        components,
        diagnosticCodes,
        evaluatedAt: base.evaluatedAt,
        mechanismReady,
        productionReady: false,
      };
    },
  };
}

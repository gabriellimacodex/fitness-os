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
import { onboardingOperationIdSchema } from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { journalContainsRequiredHashes } from '../catalog/migration-readiness.js';
import { readJournalHashes } from '../catalog/readiness.js';
import {
  createPostgresOnboardingOperationRepository,
  type StoredOnboardingOperation,
} from './operations.js';

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
] as const;

/**
 * Readiness components whose backing table is already one of
 * `REQUIRED_TABLES`, so `checkOnboardingSchemaReadiness` is real evidence for
 * them rather than an invented equivalence:
 * `invitation_repository` → `onboarding_invitation`,
 * `attempt_repository` → `onboarding_attempt`,
 * `role_mapping_repository` → `onboarding_role_mapping`.
 * `operation_repository` (→ `onboarding_operation`) is handled separately
 * below: it additionally requires a real functional round trip, not just
 * table presence — see `checkOnboardingOperationRepositoryFunctionalReadiness`.
 */
const SCHEMA_ONLY_REPOSITORY_COMPONENT_IDS = [
  'invitation_repository',
  'attempt_repository',
  'role_mapping_repository',
] as const satisfies readonly OnboardingReadinessComponentId[];

const REPOSITORY_COMPONENT_IDS = [
  ...SCHEMA_ONLY_REPOSITORY_COMPONENT_IDS,
  'operation_repository',
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
 * Thrown deliberately at the end of the functional operation-ledger
 * round-trip transaction so the write never commits. Caught explicitly in
 * `checkOnboardingOperationRepositoryFunctionalReadiness` and treated as
 * success; any other thrown value is a real failure of the put/read-back
 * round trip.
 */
class OnboardingOperationProbeRollback extends Error {}

export type OnboardingOperationRepositoryFunctionalReadinessResult =
  | { ready: true }
  | {
      ready: false;
      reason: 'round_trip_failed' | 'database_error';
      detail?: string;
    };

/**
 * Exercises the real `createPostgresOnboardingOperationRepository` put/get
 * path end to end: puts one synthetic operation-ledger row through the
 * actual repository inside a transaction, confirms it is visible via a
 * read-back, and always rolls back so no probe row is ever committed to the
 * append-only ledger. This catches a broken insert/select path (column
 * mismatch, constraint drift, permission failure) that the static
 * migration-hash and `pg_tables` presence check in
 * `checkOnboardingSchemaReadiness` cannot detect, since that check only
 * proves the expected migration ran and the table exists, not that the
 * repository can actually write to and read from it.
 */
export async function checkOnboardingOperationRepositoryFunctionalReadiness(
  connection: PostgresConnection,
): Promise<OnboardingOperationRepositoryFunctionalReadinessResult> {
  const probeRecord: StoredOnboardingOperation = {
    bindingKey: `readiness-probe:${randomUUID()}`,
    createdAt: new Date().toISOString(),
    digest: createHash('sha256').update(randomUUID()).digest('hex'),
    namespace: 'create_attempt',
    operationId: onboardingOperationIdSchema.parse(randomUUID()),
    principalKey: `readiness-probe:${randomUUID()}`,
    result: { probe: true },
    retryDigest: `hmac-sha256.v1:${createHash('sha256').update(randomUUID()).digest('hex')}`,
  };

  try {
    await connection.db.transaction(async (tx) => {
      const txConnection: PostgresConnection = {
        db: tx,
        close: connection.close,
      };
      const repository =
        createPostgresOnboardingOperationRepository(txConnection);
      const putResult = await repository.put(probeRecord);

      if (putResult.status !== 'accepted') {
        throw new Error(`put_${putResult.status}`);
      }

      const readBack = await repository.getByOperationId(
        probeRecord.operationId,
      );

      if (readBack?.operationId !== probeRecord.operationId) {
        throw new Error('round_trip_read_back_missing');
      }

      // Always abort: this is a readiness probe, not a real operation, and
      // must never leave a row in the append-only operation ledger.
      throw new OnboardingOperationProbeRollback();
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
    if (error instanceof OnboardingOperationProbeRollback) {
      return { ready: true };
    }
    const message = error instanceof Error ? error.message : 'unknown';
    const isRoundTripFailure =
      message.startsWith('put_') || message === 'round_trip_read_back_missing';
    return {
      ready: false,
      reason: isRoundTripFailure ? 'round_trip_failed' : 'database_error',
      detail: message,
    };
  }
}

/**
 * Wraps a base `OnboardingReadinessProbe` (defaults to the domain synthetic
 * probe) and replaces its `schema` component plus the four repository
 * components with a real evaluation of `checkOnboardingSchemaReadiness`
 * against `connection`, per PRD 07's "Readiness" section ("Mechanism
 * readiness requires: exact required migration and schema markers").
 *
 * `invitation_repository`, `attempt_repository`, and `role_mapping_repository`
 * reuse that same result because every table they are backed by is already
 * one of `REQUIRED_TABLES` (see `SCHEMA_ONLY_REPOSITORY_COMPONENT_IDS`), so
 * the check is real evidence for them and not an invented equivalence. They
 * are bound as one combined, fail-closed check alongside `schema`: any
 * missing required migration or table flips all of them `not_ready`
 * together, rather than inferring a finer per-repository split from partial
 * schema state. This is table/migration presence only for those three — it
 * does not exercise a read/write round-trip through the repositories
 * themselves.
 *
 * `operation_repository` is `ready` only when that same schema result is
 * `ready` **and** `checkOnboardingOperationRepositoryFunctionalReadiness`
 * confirms a real, rolled-back put+read-back through
 * `createPostgresOnboardingOperationRepository` succeeds — the static schema
 * check alone cannot prove the repository can actually write to and read
 * from the table it found. The functional check is skipped (and
 * `operation_repository` stays `not_ready`, with `schema`'s diagnostic code)
 * when the schema result itself is not `ready`, since a write would just
 * fail for a reason `schema` already reports.
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

      const schemaComponent: OnboardingReadinessComponent = schemaResult.ready
        ? { componentId: 'schema', diagnosticCode: null, state: 'ready' }
        : {
            componentId: 'schema',
            diagnosticCode:
              schemaResult.reason === 'missing_required_migration'
                ? 'migration_missing'
                : schemaResult.reason === 'missing_required_table'
                  ? 'schema_mismatch'
                  : 'configuration_mismatch',
            state: 'not_ready',
          };

      const schemaOnlyRepositoryComponents: OnboardingReadinessComponent[] =
        SCHEMA_ONLY_REPOSITORY_COMPONENT_IDS.map((componentId) =>
          schemaResult.ready
            ? { componentId, diagnosticCode: null, state: 'ready' }
            : {
                componentId,
                diagnosticCode: schemaComponent.diagnosticCode,
                state: 'not_ready',
              },
        );
      // Only attempt the functional round trip once the static schema check
      // already reports the required migration/table present — otherwise the
      // insert would fail on a missing table for a reason `schema` already
      // reports, and running it anyway would just duplicate that diagnosis
      // with a heavier DB call.
      const operationRepositoryFunctionalResult = schemaResult.ready
        ? await checkOnboardingOperationRepositoryFunctionalReadiness(
            connection,
          )
        : null;
      const operationRepositoryComponent: OnboardingReadinessComponent =
        schemaResult.ready &&
        operationRepositoryFunctionalResult?.ready === true
          ? {
              componentId: 'operation_repository',
              diagnosticCode: null,
              state: 'ready',
            }
          : {
              componentId: 'operation_repository',
              diagnosticCode: schemaResult.ready
                ? 'configuration_mismatch'
                : schemaComponent.diagnosticCode,
              state: 'not_ready',
            };

      const repositoryComponents = [
        ...schemaOnlyRepositoryComponents,
        operationRepositoryComponent,
      ];

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

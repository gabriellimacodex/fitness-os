import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import type {
  PrivacyReadinessComponent,
  PrivacyReadinessComponentId,
  PrivacyReadinessResult,
} from '@fitness-os/schemas';
import { canonicalizePrivacyReadinessDiagnosticCodes } from '@fitness-os/schemas';
import type {
  PrivacyExpectedProcessorInventoryPort,
  PrivacyReadinessProbe,
  PrivacyRuntimeProcessorRegistry,
} from '@fitness-os/domain';
import {
  compareExpectedInventoryToRuntime,
  SyntheticPrivacyReadinessProbe,
} from '@fitness-os/domain';

import type { PostgresConnection } from '../connection.js';
import { journalContainsRequiredHashes } from '../catalog/migration-readiness.js';
import { readJournalHashes } from '../catalog/readiness.js';

const drizzleRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

const REQUIRED_PRIVACY_CORE_MIGRATION_FILES = [
  '0000_flippant_rick_jones.sql',
  '0001_prd03_exercise_catalog.sql',
  '0002_prd21_privacy_core.sql',
  '0003_prd21_privacy_policy_purpose_processor.sql',
  '0004_prd21_privacy_subject_request.sql',
  '0005_prd21_privacy_subject_request_transition.sql',
  '0006_prd21_privacy_append_only_guards.sql',
  '0011_prd21_privacy_ordinary_schema_usage.sql',
  '0012_prd21_privacy_subject_request_scope.sql',
] as const;

const REQUIRED_GOVERNANCE_LIFECYCLE_MIGRATION_FILES = [
  '0015_prd21_privacy_governance_lifecycle_proof.sql',
] as const;

const REQUIRED_PROCESSOR_RETENTION_MIGRATION_FILES = [
  '0014_prd21_privacy_processor_step.sql',
  '0017_prd21_privacy_retention_preview.sql',
  '0018_prd21_privacy_retention_rule.sql',
  '0023_prd21_processor_execution_journal.sql',
] as const;

function hashMigrationFile(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(drizzleRoot, relativePath)))
    .digest('hex');
}

/** Content hashes of migrations required for privacy core readiness. */
export function requiredPrivacyCoreMigrationHashes(): readonly string[] {
  return REQUIRED_PRIVACY_CORE_MIGRATION_FILES.map((file) =>
    hashMigrationFile(file),
  );
}

/** Content hashes of migrations required for governance-lifecycle readiness. */
export function requiredPrivacyGovernanceLifecycleMigrationHashes(): readonly string[] {
  return REQUIRED_GOVERNANCE_LIFECYCLE_MIGRATION_FILES.map((file) =>
    hashMigrationFile(file),
  );
}

/**
 * Content hashes of migrations required for processor-step/retention
 * readiness (see `checkPrivacyProcessorRetentionDatabaseReadiness`).
 */
export function requiredPrivacyProcessorRetentionMigrationHashes(): readonly string[] {
  return REQUIRED_PROCESSOR_RETENTION_MIGRATION_FILES.map((file) =>
    hashMigrationFile(file),
  );
}

export type PrivacyCoreReadinessResult =
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
  'privacy_policy_package_version',
  'privacy_purpose_version',
  'privacy_processor_registration',
  'privacy_authorization_evidence',
  'privacy_withdrawal',
  'privacy_audit_event',
  'privacy_subject_request',
  'privacy_subject_request_transition',
] as const;

export async function checkPrivacyCoreDatabaseReadiness(
  connection: PostgresConnection,
  options: {
    requiredHashes?: readonly string[];
  } = {},
): Promise<PrivacyCoreReadinessResult> {
  const requiredHashes =
    options.requiredHashes ?? requiredPrivacyCoreMigrationHashes();

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

const GOVERNANCE_LIFECYCLE_REQUIRED_TABLES = [
  'privacy_governance_lifecycle_proof',
] as const;

/**
 * Checks only the governance-lifecycle proof ledger's own migration and
 * table — independent of `checkPrivacyCoreDatabaseReadiness`'s fixed core
 * migration list, since this table landed later (`0015`) and is not part of
 * the privacy-core bootstrap.
 */
export async function checkPrivacyGovernanceLifecycleDatabaseReadiness(
  connection: PostgresConnection,
  options: {
    requiredHashes?: readonly string[];
  } = {},
): Promise<PrivacyCoreReadinessResult> {
  const requiredHashes =
    options.requiredHashes ??
    requiredPrivacyGovernanceLifecycleMigrationHashes();

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
    const missing = GOVERNANCE_LIFECYCLE_REQUIRED_TABLES.filter(
      (table) => !present.has(table),
    );

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

const PROCESSOR_RETENTION_REQUIRED_TABLES = [
  'privacy_processor_step',
  'privacy_processor_execution_journal',
  'privacy_retention_preview',
  'privacy_retention_rule',
] as const;

/**
 * Checks the processor-step/execution-journal/retention-preview/retention-
 * rule tables independently of `checkPrivacyCoreDatabaseReadiness`'s fixed
 * core migration list, since these migrations (`0014`, `0017`, `0018`,
 * `0023`) landed later and are not part of the privacy-core bootstrap — the
 * same reasoning `checkPrivacyGovernanceLifecycleDatabaseReadiness` already
 * uses for `0015`. `apps/api/src/privacy/pg-persistence.ts` unconditionally
 * composes real repositories against these four tables
 * (`processorSteps`, `processorExecutionJournal`, `retentionPreviews`,
 * `retentionRules`), so `migrations`/`repositories` readiness must fail
 * closed when any of them is absent instead of reporting `ready` on evidence
 * that only covers the original core tables.
 */
export async function checkPrivacyProcessorRetentionDatabaseReadiness(
  connection: PostgresConnection,
  options: {
    requiredHashes?: readonly string[];
  } = {},
): Promise<PrivacyCoreReadinessResult> {
  const requiredHashes =
    options.requiredHashes ??
    requiredPrivacyProcessorRetentionMigrationHashes();

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
    const missing = PROCESSOR_RETENTION_REQUIRED_TABLES.filter(
      (table) => !present.has(table),
    );

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
 * Combines multiple repository-readiness results into the single worst
 * result, preferring a migration failure over a table failure over a
 * database error so the combined reason matches the most actionable cause.
 */
function combineCoreReadinessResults(
  results: readonly PrivacyCoreReadinessResult[],
): PrivacyCoreReadinessResult {
  const failures = results.filter(
    (result): result is Extract<PrivacyCoreReadinessResult, { ready: false }> =>
      !result.ready,
  );

  const migrationFailure = failures.find(
    (result) => result.reason === 'missing_required_migration',
  );
  if (migrationFailure !== undefined) {
    return migrationFailure;
  }

  const tableFailure = failures.find(
    (result) => result.reason === 'missing_required_table',
  );
  if (tableFailure !== undefined) {
    return tableFailure;
  }

  const databaseErrorFailure = failures.find(
    (result) => result.reason === 'database_error',
  );
  if (databaseErrorFailure !== undefined) {
    return databaseErrorFailure;
  }

  return { ready: true };
}

const ALWAYS_OVERRIDDEN_COMPONENT_IDS = [
  'migrations',
  'repositories',
  'audit_sink',
  'governance_lifecycle',
  'recovery',
] as const;

/**
 * The append-only guard triggers migration `0006` installs on every
 * immutable/append-only privacy ledger table. These enforce the destructive-
 * recovery safety net independently verified by the `privacy-migration-
 * recovery.integration.test.ts` evidence: a table can carry the right
 * migration hash and still lack real DML protection if a trigger was
 * manually dropped or its creation silently failed outside the migration
 * path, so this checks live `pg_trigger` state rather than re-deriving the
 * answer from the `migrations` component's journal evidence.
 */
const RECOVERY_REQUIRED_TRIGGERS = [
  'privacy_authorization_evidence_append_only_guard',
  'privacy_withdrawal_append_only_guard',
  'privacy_audit_event_append_only_guard',
  'privacy_subject_request_transition_append_only_guard',
  'privacy_policy_package_version_append_only_guard',
  'privacy_purpose_version_append_only_guard',
  'privacy_processor_registration_append_only_guard',
] as const;

export type PrivacyRecoveryReadinessResult =
  | { ready: true }
  | {
      ready: false;
      reason: 'missing_required_trigger' | 'database_error';
      detail?: string;
    };

/**
 * Verifies every append-only guard trigger migration `0006` installs is
 * actually present in the connected database, independent of whether the
 * migration journal recorded `0006` as applied.
 */
export async function checkPrivacyRecoveryReadiness(
  connection: PostgresConnection,
): Promise<PrivacyRecoveryReadinessResult> {
  try {
    const rows = await connection.db.execute<{ tgname: string }>(sql`
      SELECT tgname
      FROM pg_trigger
      WHERE NOT tgisinternal
    `);
    const present = new Set(rows.map((row) => row.tgname));
    const missing = RECOVERY_REQUIRED_TRIGGERS.filter(
      (trigger) => !present.has(trigger),
    );

    if (missing.length > 0) {
      return {
        ready: false,
        reason: 'missing_required_trigger',
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

const INVENTORY_COVERAGE_COMPONENT_IDS = [
  'expected_inventory',
  'runtime_processors',
] as const;

/**
 * Evaluates the reviewed expected inventory against the runtime processor
 * registry through the already-tested `compareExpectedInventoryToRuntime`
 * mechanism and projects the result onto the two readiness components. This
 * treats coverage as one combined check: any mismatch flips both components
 * `not_ready` together (fail-closed) rather than inventing a finer per-field
 * split between "expected inventory content" and "runtime availability".
 * `runtime_processors` keeps its `processor_missing` default when at least
 * one expected processor is absent from the runtime registry; otherwise both
 * components fall back to `inventory_mismatch`.
 */
async function evaluateInventoryCoverageComponents(
  expectedInventory: PrivacyExpectedProcessorInventoryPort,
  runtimeProcessors: PrivacyRuntimeProcessorRegistry,
): Promise<{
  expectedInventoryComponent: PrivacyReadinessComponent;
  runtimeProcessorsComponent: PrivacyReadinessComponent;
}> {
  const expected = await expectedInventory.getInventory();
  const runtime = await runtimeProcessors.listDescriptors();
  const coverage = compareExpectedInventoryToRuntime({ expected, runtime });

  if (coverage.status === 'matched') {
    return {
      expectedInventoryComponent: {
        componentId: 'expected_inventory',
        state: 'ready',
        diagnosticCode: null,
      },
      runtimeProcessorsComponent: {
        componentId: 'runtime_processors',
        state: 'ready',
        diagnosticCode: null,
      },
    };
  }

  const hasProcessorMissing = coverage.mismatches.some(
    (mismatch) => mismatch.diagnosticCode === 'processor_missing',
  );

  return {
    expectedInventoryComponent: {
      componentId: 'expected_inventory',
      state: 'not_ready',
      diagnosticCode: 'inventory_mismatch',
    },
    runtimeProcessorsComponent: {
      componentId: 'runtime_processors',
      state: 'not_ready',
      diagnosticCode: hasProcessorMissing
        ? 'processor_missing'
        : 'inventory_mismatch',
    },
  };
}

/**
 * Wraps a base `PrivacyReadinessProbe` (defaults to
 * `SyntheticPrivacyReadinessProbe`) and replaces its `migrations`,
 * `repositories`, `audit_sink`, `governance_lifecycle`, and `recovery`
 * components with a real evaluation of `checkPrivacyCoreDatabaseReadiness`,
 * `checkPrivacyProcessorRetentionDatabaseReadiness`,
 * `checkPrivacyGovernanceLifecycleDatabaseReadiness`, and
 * `checkPrivacyRecoveryReadiness` against `connection`. `migrations` and
 * `repositories` reflect the worst of `checkPrivacyCoreDatabaseReadiness` and
 * `checkPrivacyProcessorRetentionDatabaseReadiness` combined (see
 * `combineCoreReadinessResults`), so a missing processor-step, execution-
 * journal, or retention table/migration also fails those two components
 * closed, not just a missing core table. `audit_sink` reuses only the core
 * schema result: `privacy_audit_event` is already one of `REQUIRED_TABLES`,
 * so the same migration/table evidence that backs `repositories`'s core half
 * also backs the audit ledger's own table — mirroring the exact override
 * pattern already used for the other bound components, not a functional
 * round-trip through `createPostgresPrivacyAuditSink`. When both
 * `expectedInventory` and `runtimeProcessors` are supplied, this also
 * replaces `expected_inventory` and `runtime_processors` with a real
 * `compareExpectedInventoryToRuntime` evaluation; when either is omitted,
 * both stay exactly as the base probe reports them, matching prior behavior.
 * Every remaining component (identity_boundary, policy_package) is left
 * exactly as the base probe reports it — this does not verify those, since
 * both wait on an unresolved identity/legal-policy decision this probe
 * cannot and should not make. `mechanismReady` is recomputed as the
 * conjunction of all components so a real gap flips it `false`;
 * `productionReady` stays `false`, unaffected by
 * `LEGAL_PRIVACY_DECISION_REQUIRED`.
 */
export function createPostgresPrivacyReadinessProbe(
  connection: PostgresConnection,
  options: {
    baseProbe?: PrivacyReadinessProbe;
    evaluatedAt?: string;
    requiredHashes?: readonly string[];
    processorRetentionRequiredHashes?: readonly string[];
    governanceLifecycleRequiredHashes?: readonly string[];
    expectedInventory?: PrivacyExpectedProcessorInventoryPort;
    runtimeProcessors?: PrivacyRuntimeProcessorRegistry;
  } = {},
): PrivacyReadinessProbe {
  const baseProbe =
    options.baseProbe ??
    new SyntheticPrivacyReadinessProbe({
      evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    });
  const { expectedInventory, runtimeProcessors } = options;

  return {
    async evaluate(): Promise<PrivacyReadinessResult> {
      const base = await baseProbe.evaluate();
      const schemaResult = await checkPrivacyCoreDatabaseReadiness(connection, {
        requiredHashes: options.requiredHashes,
      });
      const processorRetentionResult =
        await checkPrivacyProcessorRetentionDatabaseReadiness(connection, {
          requiredHashes: options.processorRetentionRequiredHashes,
        });
      const repositoryResult = combineCoreReadinessResults([
        schemaResult,
        processorRetentionResult,
      ]);
      const governanceLifecycleResult =
        await checkPrivacyGovernanceLifecycleDatabaseReadiness(connection, {
          requiredHashes: options.governanceLifecycleRequiredHashes,
        });
      const recoveryResult = await checkPrivacyRecoveryReadiness(connection);
      const inventoryCoverage =
        expectedInventory !== undefined && runtimeProcessors !== undefined
          ? await evaluateInventoryCoverageComponents(
              expectedInventory,
              runtimeProcessors,
            )
          : null;

      const migrationsComponent: PrivacyReadinessComponent =
        repositoryResult.ready ||
        repositoryResult.reason === 'missing_required_table'
          ? { componentId: 'migrations', state: 'ready', diagnosticCode: null }
          : {
              componentId: 'migrations',
              state: 'not_ready',
              diagnosticCode:
                repositoryResult.reason === 'missing_required_migration'
                  ? 'migration_missing'
                  : 'repository_unavailable',
            };
      const repositoriesComponent: PrivacyReadinessComponent =
        repositoryResult.ready
          ? {
              componentId: 'repositories',
              state: 'ready',
              diagnosticCode: null,
            }
          : {
              componentId: 'repositories',
              state: 'not_ready',
              diagnosticCode: 'repository_unavailable',
            };
      const auditSinkComponent: PrivacyReadinessComponent = schemaResult.ready
        ? { componentId: 'audit_sink', state: 'ready', diagnosticCode: null }
        : {
            componentId: 'audit_sink',
            state: 'not_ready',
            diagnosticCode: 'audit_unavailable',
          };
      const governanceLifecycleComponent: PrivacyReadinessComponent =
        governanceLifecycleResult.ready
          ? {
              componentId: 'governance_lifecycle',
              state: 'ready',
              diagnosticCode: null,
            }
          : {
              componentId: 'governance_lifecycle',
              state: 'not_ready',
              diagnosticCode: 'governance_table_lifecycle_missing',
            };
      const recoveryComponent: PrivacyReadinessComponent = recoveryResult.ready
        ? { componentId: 'recovery', state: 'ready', diagnosticCode: null }
        : {
            componentId: 'recovery',
            state: 'not_ready',
            diagnosticCode: 'recovery_unverified',
          };

      const activeOverriddenComponentIds = new Set<PrivacyReadinessComponentId>(
        [
          ...ALWAYS_OVERRIDDEN_COMPONENT_IDS,
          ...(inventoryCoverage !== null
            ? INVENTORY_COVERAGE_COMPONENT_IDS
            : []),
        ],
      );

      const remainingComponents = base.components.filter(
        (component) => !activeOverriddenComponentIds.has(component.componentId),
      );
      const overriddenComponents = [
        migrationsComponent,
        repositoriesComponent,
        auditSinkComponent,
        governanceLifecycleComponent,
        recoveryComponent,
        ...(inventoryCoverage !== null
          ? [
              inventoryCoverage.expectedInventoryComponent,
              inventoryCoverage.runtimeProcessorsComponent,
            ]
          : []),
      ];
      const components = [...overriddenComponents, ...remainingComponents];
      const mechanismReady = components.every(
        (component) => component.state === 'ready',
      );
      // The base probe's own codes for the overridden components describe
      // its default (unavailable) state; drop them before re-adding only
      // what the real check still reports, so a resolved component doesn't
      // leave a stale code.
      const overriddenDiagnosticCodes = new Set(
        base.components
          .filter((component) =>
            activeOverriddenComponentIds.has(component.componentId),
          )
          .flatMap((component) =>
            component.diagnosticCode === null ? [] : [component.diagnosticCode],
          ),
      );
      const remainingDiagnosticCodes = new Set(
        remainingComponents.flatMap((component) =>
          component.diagnosticCode === null ? [] : [component.diagnosticCode],
        ),
      );
      const diagnosticCodes = canonicalizePrivacyReadinessDiagnosticCodes([
        ...new Set([
          ...base.diagnosticCodes.filter(
            (code) =>
              !overriddenDiagnosticCodes.has(code) ||
              remainingDiagnosticCodes.has(code),
          ),
          ...overriddenComponents.flatMap((component) =>
            component.diagnosticCode === null ? [] : [component.diagnosticCode],
          ),
        ]),
      ]);

      return {
        ...base,
        components,
        diagnosticCodes,
        mechanismReady,
        productionReady: false,
      };
    },
  };
}

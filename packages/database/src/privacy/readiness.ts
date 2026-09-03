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

const ALWAYS_OVERRIDDEN_COMPONENT_IDS = [
  'migrations',
  'repositories',
  'audit_sink',
  'governance_lifecycle',
] as const;

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
 * `repositories`, `audit_sink`, and `governance_lifecycle` components with a
 * real evaluation of `checkPrivacyCoreDatabaseReadiness` and
 * `checkPrivacyGovernanceLifecycleDatabaseReadiness` against `connection`.
 * `audit_sink` reuses the core schema result: `privacy_audit_event` is
 * already one of `REQUIRED_TABLES`, so the same migration/table evidence
 * that backs `repositories` also backs the audit ledger's own table —
 * mirroring the exact override pattern already used for the other bound
 * components, not a functional round-trip through
 * `createPostgresPrivacyAuditSink`. When both `expectedInventory` and
 * `runtimeProcessors` are supplied, this also replaces `expected_inventory`
 * and `runtime_processors` with a real `compareExpectedInventoryToRuntime`
 * evaluation; when either is omitted, both stay exactly as the base probe
 * reports them, matching prior behavior. Every remaining component
 * (identity_boundary, policy_package, recovery) is left exactly as the base
 * probe reports it — this does not verify those. `mechanismReady` is
 * recomputed as the conjunction of all components so a real gap flips it
 * `false`; `productionReady` stays `false`, unaffected by
 * `LEGAL_PRIVACY_DECISION_REQUIRED`.
 */
export function createPostgresPrivacyReadinessProbe(
  connection: PostgresConnection,
  options: {
    baseProbe?: PrivacyReadinessProbe;
    evaluatedAt?: string;
    requiredHashes?: readonly string[];
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
      const governanceLifecycleResult =
        await checkPrivacyGovernanceLifecycleDatabaseReadiness(connection, {
          requiredHashes: options.governanceLifecycleRequiredHashes,
        });
      const inventoryCoverage =
        expectedInventory !== undefined && runtimeProcessors !== undefined
          ? await evaluateInventoryCoverageComponents(
              expectedInventory,
              runtimeProcessors,
            )
          : null;

      const migrationsComponent: PrivacyReadinessComponent =
        schemaResult.ready || schemaResult.reason === 'missing_required_table'
          ? { componentId: 'migrations', state: 'ready', diagnosticCode: null }
          : {
              componentId: 'migrations',
              state: 'not_ready',
              diagnosticCode:
                schemaResult.reason === 'missing_required_migration'
                  ? 'migration_missing'
                  : 'repository_unavailable',
            };
      const repositoriesComponent: PrivacyReadinessComponent =
        schemaResult.ready
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

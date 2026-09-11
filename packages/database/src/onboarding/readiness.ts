import { createHash } from 'node:crypto';
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
  '0013_prd07_onboarding_principal_binding.sql',
  '0016_prd07_onboarding_transition.sql',
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
  'onboarding_principal_binding',
  'onboarding_transition',
] as const;

/**
 * Readiness components whose backing table is already one of
 * `REQUIRED_TABLES`, so `checkOnboardingSchemaReadiness` is real evidence for
 * them rather than an invented equivalence:
 * `invitation_repository` → `onboarding_invitation`,
 * `attempt_repository` → `onboarding_attempt`,
 * `operation_repository` → `onboarding_operation`,
 * `role_mapping_repository` → `onboarding_role_mapping`.
 *
 * `onboarding_principal_binding` and `onboarding_transition` are also real,
 * already-applied PRD 07 tables (migrations 0013/0016): `checkOnboardingSchemaReadiness`
 * is one combined, fail-closed check across every table the package
 * requires, so omitting a real landed table from `REQUIRED_TABLES` would
 * understate what "schema ready" actually verifies. Neither has a dedicated
 * `OnboardingReadinessComponentId` of its own, so they fold into the
 * combined `schema` result rather than a new per-table component.
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
 * readiness requires: exact required migration and schema markers").
 *
 * The repository components reuse that same result because every table they
 * are backed by is already one of `REQUIRED_TABLES` (see
 * `REPOSITORY_COMPONENT_IDS`), so the check is real evidence for them and not
 * an invented equivalence. They are bound as one combined, fail-closed check:
 * any missing required migration or table flips all four `not_ready`
 * together, rather than inferring a finer per-repository split from partial
 * schema state. This is table/migration presence only — it does not exercise
 * a read/write round-trip through the repositories themselves.
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

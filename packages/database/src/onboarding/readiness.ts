import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import type {
  OnboardingReadinessComponent,
  OnboardingReadinessProbe,
  OnboardingReadinessResult,
} from '@fitness-os/domain';
import { SyntheticOnboardingReadinessProbe } from '@fitness-os/domain';

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
 * probe) and replaces only its `schema` component with a real evaluation of
 * `checkOnboardingSchemaReadiness` against `connection`, per PRD 07's
 * "Readiness" section ("Mechanism readiness requires: exact required
 * migration and schema markers"). Every other component (clock, id/secret
 * factories, repositories, identity/policy adapters) is left exactly as the
 * base probe reports it — this does not verify those, only schema/migration
 * presence. The final evidence is normalized to exactly one database-derived
 * `schema` component, even if a custom base omits or duplicates it.
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
  } = {},
): OnboardingReadinessProbe {
  const baseProbe =
    options.baseProbe ??
    new SyntheticOnboardingReadinessProbe({
      evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    });

  return {
    async evaluate(): Promise<OnboardingReadinessResult> {
      const base = await baseProbe.evaluate();
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

      const components = [
        schemaComponent,
        ...base.components.filter(
          (component) => component.componentId !== 'schema',
        ),
      ];
      const mechanismReady = components.every(
        (component) => component.state === 'ready',
      );
      const replacedSchemaDiagnostics = new Set(
        base.components
          .filter((component) => component.componentId === 'schema')
          .map((component) => component.diagnosticCode)
          .filter((diagnostic) => diagnostic !== null),
      );
      const diagnosticCodes = [
        ...new Set([
          ...base.diagnosticCodes.filter(
            (diagnostic) => !replacedSchemaDiagnostics.has(diagnostic),
          ),
          ...(schemaComponent.diagnosticCode !== null
            ? [schemaComponent.diagnosticCode]
            : []),
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

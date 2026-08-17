import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import type { PostgresConnection } from '../connection.js';
import {
  activeLedgerKey,
  type LedgerKeyRing,
  type LedgerKeyRingFailure,
} from './ledger-keyring.js';
import { journalContainsRequiredHashes } from './migration-readiness.js';
import { SEEDED_TAXONOMY_DIMENSIONS, taxonomyDimensions } from './tables.js';

const drizzleRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

const REQUIRED_MIGRATION_FILES = [
  '0000_flippant_rick_jones.sql',
  '0001_prd03_exercise_catalog.sql',
] as const;

function hashMigrationFile(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(drizzleRoot, relativePath)))
    .digest('hex');
}

/** Content hashes of migrations required for catalog readiness (subset, not count). */
export function requiredCatalogMigrationHashes(): readonly string[] {
  return REQUIRED_MIGRATION_FILES.map((file) => hashMigrationFile(file));
}

export type CatalogReadinessResult =
  | { ready: true }
  | {
      ready: false;
      reason:
        | 'missing_required_migration'
        | 'missing_taxonomy_seed'
        | 'ledger_key_ring'
        | 'database_error';
      detail?: string | LedgerKeyRingFailure;
    };

export async function readJournalHashes(
  connection: PostgresConnection,
): Promise<string[]> {
  const rows = await connection.db.execute<{ hash: string }>(sql`
    SELECT hash
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at
  `);

  return rows.map((row) => row.hash);
}

export async function checkCatalogDatabaseReadiness(
  connection: PostgresConnection,
  ring: LedgerKeyRing,
  requiredHashes: readonly string[] = requiredCatalogMigrationHashes(),
): Promise<CatalogReadinessResult> {
  try {
    const active = activeLedgerKey(ring);
    if (typeof active === 'string') {
      return { ready: false, reason: 'ledger_key_ring', detail: active };
    }

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

    const dimensions = await connection.db.select().from(taxonomyDimensions);
    const keys = new Set(dimensions.map((row) => row.key));
    const ids = new Set(dimensions.map((row) => row.id));

    if (
      !keys.has('modality') ||
      !keys.has('equipment') ||
      !ids.has(SEEDED_TAXONOMY_DIMENSIONS.modality.id) ||
      !ids.has(SEEDED_TAXONOMY_DIMENSIONS.equipment.id)
    ) {
      return { ready: false, reason: 'missing_taxonomy_seed' };
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

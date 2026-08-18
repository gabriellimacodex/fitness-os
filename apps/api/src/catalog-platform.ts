import { randomBytes } from 'node:crypto';

import {
  checkCatalogDatabaseReadiness,
  createExerciseCatalogReader,
  createPostgresConnection,
  type LedgerKeyRing,
  type PostgresConnection,
} from '@fitness-os/database';

import type { PlatformOptions } from './app.js';

export interface CatalogPlatformHandles {
  platform: Pick<PlatformOptions, 'exerciseCatalog' | 'readinessCheck'>;
  connection: PostgresConnection;
}

export function readCatalogLedgerRing(
  env: NodeJS.ProcessEnv,
): LedgerKeyRing | null {
  const keyId = env.CATALOG_LEDGER_KEY_ID;
  const secretHex = env.CATALOG_LEDGER_SECRET_HEX;
  if (!keyId || !secretHex) {
    return null;
  }
  if (!/^[a-f0-9]{64}$/i.test(secretHex)) {
    throw new Error('CATALOG_LEDGER_SECRET_HEX must be 64 hex characters');
  }
  return {
    keys: [
      {
        keyId,
        secret: Buffer.from(secretHex, 'hex'),
        status: 'active',
      },
    ],
  };
}

export function createCatalogPlatformFromEnv(
  env: NodeJS.ProcessEnv,
): CatalogPlatformHandles | null {
  const databaseUrl = env.CATALOG_DATABASE_URL;
  const ring = readCatalogLedgerRing(env);
  if (!databaseUrl || ring === null) {
    return null;
  }

  const connection = createPostgresConnection(databaseUrl);
  const reader = createExerciseCatalogReader(connection);

  return {
    connection,
    platform: {
      exerciseCatalog: {
        reader,
        isInvalidRequest: () => false,
        isStorageUnavailable: (error) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof (error as { code: unknown }).code === 'string' &&
          ['ECONNREFUSED', 'ETIMEDOUT', '57P01', '08006'].includes(
            (error as { code: string }).code,
          ),
      },
      readinessCheck: async () => {
        const result = await checkCatalogDatabaseReadiness(connection, ring);
        return result.ready === true;
      },
    },
  };
}

/** Disposable ring for synthetic local tests only — never for production. */
export function createSyntheticCatalogLedgerRing(): LedgerKeyRing {
  return {
    keys: [
      {
        keyId: 'ledger.synthetic.v1',
        secret: randomBytes(32),
        status: 'active',
      },
    ],
  };
}

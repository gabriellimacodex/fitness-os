import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createManifestIngestionCommand } from '@fitness-os/domain';
import {
  createExerciseCatalogCuration,
  createPostgresConnection,
  type LedgerKeyRing,
} from '@fitness-os/database';

import { createCatalogGitInspection } from './git-inspection.js';
import { verifyCatalogArtifact } from './verification.js';

function usage(): never {
  console.error(
    'Usage: catalog-ingest --database-url <url> --ledger-key-id <id> --ledger-secret-hex <64hex> [--operation-id <uuid>] [--manifest <path>] [--review <path>]',
  );
  process.exit(2);
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

export async function runCatalogIngestCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  status: 'manifest_ingested';
  replayed: boolean;
  manifestId: string;
  exerciseCount: number;
  taxonomyTermCount: number;
}> {
  const databaseUrl =
    readArg(args, '--database-url') ?? env.CATALOG_DATABASE_URL;
  const keyId = readArg(args, '--ledger-key-id') ?? env.CATALOG_LEDGER_KEY_ID;
  const secretHex =
    readArg(args, '--ledger-secret-hex') ?? env.CATALOG_LEDGER_SECRET_HEX;
  const operationId = readArg(args, '--operation-id') ?? randomUUID();
  const manifestPath = resolve(
    readArg(args, '--manifest') ?? 'catalog/catalog-manifest.v1.json',
  );
  const reviewPath = resolve(
    readArg(args, '--review') ?? 'catalog/catalog-manifest.v1.review.json',
  );

  if (!databaseUrl || !keyId || !secretHex) {
    usage();
  }

  if (!/^[a-f0-9]{64}$/i.test(secretHex)) {
    throw new Error('ledger secret must be 64 hex characters');
  }

  const git = createCatalogGitInspection(process.cwd());
  const head = await git.resolveHead();
  const verified = await verifyCatalogArtifact(
    {
      candidateCommit: head,
      manifestPath: 'catalog/catalog-manifest.v1.json',
      manifestSource: await readFile(manifestPath, 'utf8'),
      reviewSource: await readFile(reviewPath, 'utf8'),
    },
    git,
  );

  const ring: LedgerKeyRing = {
    keys: [
      {
        keyId,
        secret: Buffer.from(secretHex, 'hex'),
        status: 'active',
      },
    ],
  };

  const command = createManifestIngestionCommand({
    operationId,
    manifest: verified.manifest,
  });
  if (command.status !== 'ready') {
    throw new Error(`Invalid ingest command: ${command.violations.join(',')}`);
  }

  const connection = createPostgresConnection(databaseUrl);
  try {
    const curation = createExerciseCatalogCuration(connection, ring);
    const result = await curation.ingestManifest(command.command);
    if (result.status !== 'manifest_ingested') {
      throw new Error(`Ingest failed: ${result.status}`);
    }
    return result;
  } finally {
    await connection.close();
  }
}

const entry = process.argv[1] ?? '';
const isMain =
  entry.includes('catalog-ingest') &&
  (entry.endsWith('cli.ts') || entry.endsWith('cli.js'));

if (isMain) {
  runCatalogIngestCli(process.argv.slice(2))
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : 'Catalog ingest failed',
      );
      process.exitCode = 1;
    });
}

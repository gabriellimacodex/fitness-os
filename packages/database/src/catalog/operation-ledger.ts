import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { catalogOperations } from './tables.js';
import {
  signLedgerResult,
  verifyLedgerResult,
  type LedgerKeyRing,
  type LedgerKeyRingFailure,
} from './ledger-keyring.js';
import type { PostgresConnection } from '../connection.js';

export type CatalogOperationNamespace =
  | 'exercise.publish'
  | 'exercise.lifecycle'
  | 'taxonomy.create'
  | 'taxonomy.lifecycle'
  | 'taxonomy.replace'
  | 'manifest.ingest';

export interface CatalogOperationRow {
  id: string;
  operationKey: string;
  namespace: CatalogOperationNamespace;
  canonicalizationVersion: string;
  inputDigest: string;
  status: 'committed';
  resultPayload: unknown;
  resultIntegrityKeyId: string;
  resultIntegrityDigest: string;
  createdAt: string;
}

export type CommitCatalogOperationResult =
  | { status: 'committed'; operation: CatalogOperationRow }
  | { status: 'replayed'; operation: CatalogOperationRow }
  | { status: 'operation_input_mismatch'; operationKey: string }
  | { status: 'integrity_failure'; reason: LedgerKeyRingFailure };

export function catalogOperationKey(
  namespace: CatalogOperationNamespace,
  operationId: string,
): string {
  return `${namespace}:${operationId.toLowerCase()}`;
}

function serializeResultPayload(resultPayload: unknown): string {
  return JSON.stringify(resultPayload);
}

export async function resolveCatalogOperation(
  connection: PostgresConnection,
  ring: LedgerKeyRing,
  input: {
    operationKey: string;
    namespace: CatalogOperationNamespace;
    canonicalizationVersion: string;
    inputDigest: string;
  },
): Promise<
  | { status: 'new_operation' }
  | { status: 'replayed'; operation: CatalogOperationRow }
  | { status: 'operation_input_mismatch'; operationKey: string }
  | { status: 'integrity_failure'; reason: LedgerKeyRingFailure }
> {
  const [existing] = await connection.db
    .select()
    .from(catalogOperations)
    .where(eq(catalogOperations.operationKey, input.operationKey))
    .limit(1);

  if (existing === undefined) {
    return { status: 'new_operation' };
  }

  const canonicalResult = serializeResultPayload(existing.resultPayload);
  const verification = verifyLedgerResult(ring, canonicalResult, {
    digest: existing.resultIntegrityDigest,
    keyId: existing.resultIntegrityKeyId,
  });

  if (verification !== true) {
    return { status: 'integrity_failure', reason: verification };
  }

  if (
    existing.inputDigest !== input.inputDigest ||
    existing.namespace !== input.namespace ||
    existing.canonicalizationVersion !== input.canonicalizationVersion
  ) {
    return {
      status: 'operation_input_mismatch',
      operationKey: input.operationKey,
    };
  }

  return {
    status: 'replayed',
    operation: existing as CatalogOperationRow,
  };
}

export async function commitCatalogOperation(
  connection: PostgresConnection,
  ring: LedgerKeyRing,
  input: {
    operationKey: string;
    namespace: CatalogOperationNamespace;
    canonicalizationVersion: string;
    inputDigest: string;
    resultPayload: unknown;
    createdAt?: string;
  },
): Promise<CommitCatalogOperationResult> {
  const resolved = await resolveCatalogOperation(connection, ring, input);

  if (resolved.status !== 'new_operation') {
    return resolved;
  }

  const canonicalResult = serializeResultPayload(input.resultPayload);
  const signed = signLedgerResult(ring, canonicalResult);

  if (typeof signed === 'string') {
    return { status: 'integrity_failure', reason: signed };
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const [inserted] = await connection.db
    .insert(catalogOperations)
    .values({
      id: randomUUID(),
      operationKey: input.operationKey,
      namespace: input.namespace,
      canonicalizationVersion: input.canonicalizationVersion,
      inputDigest: input.inputDigest,
      status: 'committed',
      resultPayload: input.resultPayload,
      resultIntegrityKeyId: signed.keyId,
      resultIntegrityDigest: signed.digest,
      createdAt,
    })
    .returning();

  if (inserted === undefined) {
    throw new Error('Catalog operation insert returned no row');
  }

  return {
    status: 'committed',
    operation: inserted as CatalogOperationRow,
  };
}

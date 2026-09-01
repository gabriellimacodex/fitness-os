import { eq } from 'drizzle-orm';
import type { PrivacyRetentionPreviewRepository } from '@fitness-os/domain';
import {
  privacyRetentionPreviewRecordSchema,
  type PrivacyRetentionPreviewRecord,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { privacyRetentionPreview } from './tables.js';

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint_name' in error &&
    error.constraint_name === constraint
  ) {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    isUniqueViolation(error.cause, constraint)
  );
}

function toRecord(
  row: typeof privacyRetentionPreview.$inferSelect,
): PrivacyRetentionPreviewRecord {
  return privacyRetentionPreviewRecordSchema.parse({
    selectionDigest: row.selectionDigest,
    policyVersionId: row.policyVersionId,
    inventoryVersionDigest: row.inventoryVersionDigest,
    processorDescriptorDigests: row.processorDescriptorDigests,
    watermark: new Date(row.watermark).toISOString(),
    approvedExceptionIds: row.approvedExceptionIds,
    synthetic: true,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    executedAt: row.executedAt ? new Date(row.executedAt).toISOString() : null,
  });
}

/**
 * Disposable PG-backed retention preview evidence, keyed by the deterministic
 * `selectionDigest`. A repeat `put` for an existing digest is a conflict
 * rather than a silent overwrite or update — a preview is immutable once
 * accepted.
 */
export function createPostgresPrivacyRetentionPreviewRepository(
  connection: PostgresConnection,
): PrivacyRetentionPreviewRepository {
  return {
    getBySelectionDigest: async (selectionDigest: string) => {
      const [row] = await connection.db
        .select()
        .from(privacyRetentionPreview)
        .where(eq(privacyRetentionPreview.selectionDigest, selectionDigest))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    put: async (record: PrivacyRetentionPreviewRecord) => {
      try {
        await connection.db.insert(privacyRetentionPreview).values({
          selectionDigest: record.selectionDigest,
          policyVersionId: record.policyVersionId,
          inventoryVersionDigest: record.inventoryVersionDigest,
          processorDescriptorDigests: [...record.processorDescriptorDigests],
          watermark: record.watermark,
          approvedExceptionIds: [...record.approvedExceptionIds],
          status: record.status,
          createdAt: record.createdAt,
          executedAt: record.executedAt,
        });
        return 'accepted' as const;
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_retention_preview_pkey')) {
          return 'conflict' as const;
        }
        throw error;
      }
    },
  };
}

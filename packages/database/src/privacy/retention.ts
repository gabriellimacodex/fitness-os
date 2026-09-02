import { and, eq } from 'drizzle-orm';
import type {
  PrivacyRetentionPreviewRepository,
  PrivacyRetentionRuleRepository,
} from '@fitness-os/domain';
import {
  privacyRetentionPreviewRecordSchema,
  privacyRetentionRuleReferenceSchema,
  type PrivacyRetentionPreviewRecord,
  type PrivacyRetentionRuleReference,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import { privacyRetentionPreview, privacyRetentionRule } from './tables.js';

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
      if (record.status !== 'planned') {
        return 'conflict' as const;
      }
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
          executionOperationId: null,
        });
        return 'accepted' as const;
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_retention_preview_pkey')) {
          return 'conflict' as const;
        }
        throw error;
      }
    },

    markExecuted: async (input) => {
      const [updated] = await connection.db
        .update(privacyRetentionPreview)
        .set({
          executedAt: input.executedAt,
          executionOperationId: input.operationId,
          status: 'executed',
        })
        .where(
          and(
            eq(privacyRetentionPreview.selectionDigest, input.selectionDigest),
            eq(privacyRetentionPreview.status, 'planned'),
          ),
        )
        .returning({
          selectionDigest: privacyRetentionPreview.selectionDigest,
        });
      if (updated !== undefined) {
        return 'executed';
      }

      const [existing] = await connection.db
        .select({
          executionOperationId: privacyRetentionPreview.executionOperationId,
          status: privacyRetentionPreview.status,
        })
        .from(privacyRetentionPreview)
        .where(
          eq(privacyRetentionPreview.selectionDigest, input.selectionDigest),
        )
        .limit(1);
      if (existing === undefined) {
        return 'not_found';
      }
      return existing.status === 'executed' &&
        existing.executionOperationId === input.operationId
        ? 'idempotent_replay'
        : 'conflict';
    },
  };
}

function toRuleReference(
  row: typeof privacyRetentionRule.$inferSelect,
): PrivacyRetentionRuleReference {
  return privacyRetentionRuleReferenceSchema.parse({
    ruleId: row.ruleId,
    ruleVersionId: row.ruleVersionId,
    engineeringCategoryId: row.engineeringCategoryId,
    purposeVersionId: row.purposeVersionId,
    policyVersionId: row.policyVersionId,
    action: row.action,
    parametersDigest: row.parametersDigest,
    canonicalizationVersion: row.canonicalizationVersion,
    synthetic: row.synthetic,
  });
}

/**
 * Disposable PG-backed retention-rule reference registry. A `put` for an
 * already-accepted `ruleVersionId` is a conflict, never a silent overwrite —
 * a rule version is immutable once accepted, matching
 * `PrivacyRetentionRuleReferenceSchema`'s own documented invariant.
 */
export function createPostgresPrivacyRetentionRuleRepository(
  connection: PostgresConnection,
): PrivacyRetentionRuleRepository {
  return {
    getActiveVersion: async (ruleVersionId: string) => {
      const [row] = await connection.db
        .select()
        .from(privacyRetentionRule)
        .where(eq(privacyRetentionRule.ruleVersionId, ruleVersionId))
        .limit(1);
      return row ? toRuleReference(row) : null;
    },

    listActiveForCategoryAndPurpose: async (
      engineeringCategoryId: string,
      purposeVersionId: string,
    ) => {
      const rows = await connection.db
        .select()
        .from(privacyRetentionRule)
        .where(
          and(
            eq(
              privacyRetentionRule.engineeringCategoryId,
              engineeringCategoryId,
            ),
            eq(privacyRetentionRule.purposeVersionId, purposeVersionId),
          ),
        );
      return rows.map((row) => toRuleReference(row));
    },

    put: async (record: PrivacyRetentionRuleReference) => {
      const valid = privacyRetentionRuleReferenceSchema.parse(record);
      try {
        await connection.db.insert(privacyRetentionRule).values({
          ruleVersionId: valid.ruleVersionId,
          ruleId: valid.ruleId,
          engineeringCategoryId: valid.engineeringCategoryId,
          purposeVersionId: valid.purposeVersionId,
          policyVersionId: valid.policyVersionId,
          action: valid.action,
          parametersDigest: valid.parametersDigest,
          canonicalizationVersion: valid.canonicalizationVersion,
          synthetic: valid.synthetic,
        });
        return 'accepted' as const;
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_retention_rule_pkey')) {
          return 'conflict' as const;
        }
        throw error;
      }
    },
  };
}

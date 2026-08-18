import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * PRD 21 Option A disposable-core persistence.
 * Append-only ordinary-app ledgers for evidence, withdrawal, and audit.
 * No policy text, credentials, or free-text metadata columns.
 */

export const privacyAuthorizationEvidence = pgTable(
  'privacy_authorization_evidence',
  {
    evidenceId: uuid('evidence_id').primaryKey(),
    purposeId: uuid('purpose_id').notNull(),
    policyVersionId: uuid('policy_version_id').notNull(),
    contentDigest: text('content_digest').notNull(),
    recordedAt: timestamp('recorded_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      'privacy_authorization_evidence_content_digest_check',
      sql`${table.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    index('privacy_authorization_evidence_purpose_id_idx').on(table.purposeId),
    index('privacy_authorization_evidence_policy_version_id_idx').on(
      table.policyVersionId,
    ),
  ],
);

export const privacyWithdrawal = pgTable(
  'privacy_withdrawal',
  {
    withdrawalId: uuid('withdrawal_id').primaryKey(),
    evidenceId: uuid('evidence_id').notNull(),
    state: text('state').notNull(),
    withdrawnAt: timestamp('withdrawn_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    operationId: uuid('operation_id').notNull(),
    processingOutcome: text('processing_outcome').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.evidenceId],
      foreignColumns: [privacyAuthorizationEvidence.evidenceId],
      name: 'privacy_withdrawal_evidence_id_fk',
    }).onDelete('restrict'),
    uniqueIndex('privacy_withdrawal_evidence_id_unique').on(table.evidenceId),
    uniqueIndex('privacy_withdrawal_operation_id_unique').on(table.operationId),
    check('privacy_withdrawal_state_check', sql`${table.state} = 'withdrawn'`),
    check(
      'privacy_withdrawal_processing_outcome_check',
      sql`${table.processingOutcome} IN ('accepted', 'idempotent_replay')`,
    ),
    index('privacy_withdrawal_withdrawn_at_idx').on(table.withdrawnAt),
  ],
);

export const privacyAuditEvent = pgTable(
  'privacy_audit_event',
  {
    auditEventId: uuid('audit_event_id').primaryKey(),
    kind: text('kind').notNull(),
    outcome: text('outcome').notNull(),
    reasonCode: text('reason_code'),
    policyVersionId: uuid('policy_version_id'),
    evidenceId: uuid('evidence_id'),
    requestId: uuid('request_id'),
    operationId: uuid('operation_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    recordedAt: timestamp('recorded_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.evidenceId],
      foreignColumns: [privacyAuthorizationEvidence.evidenceId],
      name: 'privacy_audit_event_evidence_id_fk',
    }).onDelete('restrict'),
    check(
      'privacy_audit_event_kind_check',
      sql`${table.kind} IN (
        'data_use_evaluated',
        'authorization_evidence_appended',
        'authorization_withdrawn',
        'subject_request_transitioned',
        'processor_step_recorded',
        'retention_preview_recorded',
        'retention_execution_recorded',
        'governance_lifecycle_recorded'
      )`,
    ),
    check(
      'privacy_audit_event_outcome_check',
      sql`${table.outcome} IN ('succeeded', 'denied', 'failed', 'partial')`,
    ),
    check(
      'privacy_audit_event_reason_code_denied_check',
      sql`(
        (${table.outcome} = 'denied' AND ${table.reasonCode} IS NOT NULL) OR
        (${table.outcome} = 'succeeded' AND ${table.reasonCode} IS NULL) OR
        (${table.outcome} IN ('failed', 'partial'))
      )`,
    ),
    index('privacy_audit_event_recorded_at_idx').on(table.recordedAt),
    index('privacy_audit_event_correlation_id_idx').on(table.correlationId),
    index('privacy_audit_event_operation_id_idx').on(table.operationId),
  ],
);

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * PRD 21 Option A disposable persistence.
 * Reference-only policy/purpose/processor rows plus append-only evidence,
 * withdrawal, and audit ledgers. No policy text, credentials, or free-text
 * metadata columns.
 */

export const privacyPolicyPackageVersion = pgTable(
  'privacy_policy_package_version',
  {
    versionId: uuid('version_id').primaryKey(),
    packageId: uuid('package_id').notNull(),
    canonicalizationVersion: text('canonicalization_version').notNull(),
    contentDigest: text('content_digest').notNull(),
    synthetic: boolean('synthetic').notNull(),
  },
  (table) => [
    check(
      'privacy_policy_package_version_canonicalization_check',
      sql`${table.canonicalizationVersion} = 'privacy-governance.canonical.v1'`,
    ),
    check(
      'privacy_policy_package_version_content_digest_check',
      sql`${table.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    index('privacy_policy_package_version_package_id_idx').on(table.packageId),
  ],
);

export const privacyPurposeVersion = pgTable(
  'privacy_purpose_version',
  {
    purposeVersionId: uuid('purpose_version_id').primaryKey(),
    purposeId: uuid('purpose_id').notNull(),
    policyVersionId: uuid('policy_version_id').notNull(),
    allowedOperationKinds: jsonb('allowed_operation_kinds')
      .$type<string[]>()
      .notNull(),
    allowedCategoryIds: jsonb('allowed_category_ids')
      .$type<string[]>()
      .notNull(),
    evidenceRequired: boolean('evidence_required').notNull(),
    activationState: text('activation_state').notNull(),
    contentDigest: text('content_digest').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.policyVersionId],
      foreignColumns: [privacyPolicyPackageVersion.versionId],
      name: 'privacy_purpose_version_policy_version_id_fk',
    }).onDelete('restrict'),
    check(
      'privacy_purpose_version_activation_state_check',
      sql`${table.activationState} IN ('active', 'inactive', 'superseded')`,
    ),
    check(
      'privacy_purpose_version_content_digest_check',
      sql`${table.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    uniqueIndex('privacy_purpose_version_one_active')
      .on(table.purposeId)
      .where(sql`${table.activationState} = 'active'`),
    index('privacy_purpose_version_purpose_id_idx').on(table.purposeId),
  ],
);

export const privacyProcessorRegistration = pgTable(
  'privacy_processor_registration',
  {
    processorId: uuid('processor_id').primaryKey(),
    inventoryId: uuid('inventory_id').notNull(),
    descriptorDigest: text('descriptor_digest').notNull(),
    inventoryVersionDigest: text('inventory_version_digest').notNull(),
    allowedPurposeIds: jsonb('allowed_purpose_ids').$type<string[]>().notNull(),
    allowedCategoryIds: jsonb('allowed_category_ids')
      .$type<string[]>()
      .notNull(),
    capabilities: jsonb('capabilities').$type<string[]>().notNull(),
    supportsSubjectLookup: boolean('supports_subject_lookup').notNull(),
    codeOwner: text('code_owner').notNull(),
    synthetic: boolean('synthetic').notNull(),
  },
  (table) => [
    check(
      'privacy_processor_registration_descriptor_digest_check',
      sql`${table.descriptorDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'privacy_processor_registration_inventory_version_digest_check',
      sql`${table.inventoryVersionDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'privacy_processor_registration_code_owner_check',
      sql`${table.codeOwner} ~ '^[A-Za-z0-9._:-]+$' AND char_length(${table.codeOwner}) BETWEEN 1 AND 128`,
    ),
    index('privacy_processor_registration_inventory_id_idx').on(
      table.inventoryId,
    ),
  ],
);

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

/**
 * Current pointer for a data-subject request. Append-only transition history
 * lives in `privacy_subject_request_transition`.
 */
export const privacySubjectRequest = pgTable(
  'privacy_subject_request',
  {
    requestId: uuid('request_id').primaryKey(),
    requestType: text('request_type').notNull(),
    state: text('state').notNull(),
    /**
     * Opaque synthetic subject scope. Nullable only for pre-migration rows;
     * application fail-closed treats NULL as unreadable/incomplete (no backfill).
     */
    subjectScopeId: uuid('subject_scope_id'),
    verificationRefDigest: text('verification_ref_digest'),
    verificationSynthetic: boolean('verification_synthetic'),
    policyVersionId: uuid('policy_version_id').notNull(),
    inventoryVersionDigest: text('inventory_version_digest').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.policyVersionId],
      foreignColumns: [privacyPolicyPackageVersion.versionId],
      name: 'privacy_subject_request_policy_version_id_fk',
    }).onDelete('restrict'),
    check(
      'privacy_subject_request_type_check',
      sql`${table.requestType} IN ('access', 'export', 'deletion')`,
    ),
    check(
      'privacy_subject_request_state_check',
      sql`${table.state} IN (
        'received',
        'verification_required',
        'policy_blocked',
        'ready',
        'in_progress',
        'partially_failed',
        'completed',
        'cancelled',
        'denied'
      )`,
    ),
    check(
      'privacy_subject_request_inventory_version_digest_check',
      sql`${table.inventoryVersionDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'privacy_subject_request_verification_pair_check',
      sql`(
        (${table.verificationRefDigest} IS NULL AND ${table.verificationSynthetic} IS NULL) OR
        (${table.verificationRefDigest} ~ '^[a-f0-9]{64}$' AND ${table.verificationSynthetic} IS NOT NULL)
      )`,
    ),
    index('privacy_subject_request_state_idx').on(table.state),
    index('privacy_subject_request_updated_at_idx').on(table.updatedAt),
    index('privacy_subject_request_subject_scope_id_idx').on(
      table.subjectScopeId,
    ),
  ],
);

/**
 * Append-only transition history for data-subject requests.
 * DB guards reject UPDATE/DELETE; ordinary role has SELECT/INSERT only.
 */
export const privacySubjectRequestTransition = pgTable(
  'privacy_subject_request_transition',
  {
    transitionId: uuid('transition_id').primaryKey(),
    requestId: uuid('request_id').notNull(),
    previousState: text('previous_state').notNull(),
    nextState: text('next_state').notNull(),
    operationId: uuid('operation_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    reasonCode: text('reason_code'),
    verificationRefDigest: text('verification_ref_digest'),
    recordedAt: timestamp('recorded_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.requestId],
      foreignColumns: [privacySubjectRequest.requestId],
      name: 'privacy_subject_request_transition_request_id_fk',
    }).onDelete('restrict'),
    uniqueIndex('privacy_subject_request_transition_operation_id_unique').on(
      table.operationId,
    ),
    check(
      'privacy_subject_request_transition_previous_state_check',
      sql`${table.previousState} IN (
        'received',
        'verification_required',
        'policy_blocked',
        'ready',
        'in_progress',
        'partially_failed',
        'completed',
        'cancelled',
        'denied'
      )`,
    ),
    check(
      'privacy_subject_request_transition_next_state_check',
      sql`${table.nextState} IN (
        'received',
        'verification_required',
        'policy_blocked',
        'ready',
        'in_progress',
        'partially_failed',
        'completed',
        'cancelled',
        'denied'
      )`,
    ),
    check(
      'privacy_subject_request_transition_reason_code_check',
      sql`${table.reasonCode} IS NULL OR ${table.reasonCode} IN (
        'forward',
        'verification_accepted',
        'policy_blocked',
        'cancelled',
        'denied'
      )`,
    ),
    check(
      'privacy_subject_request_transition_verification_digest_check',
      sql`${table.verificationRefDigest} IS NULL OR ${table.verificationRefDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    index('privacy_subject_request_transition_request_id_idx').on(
      table.requestId,
    ),
    index('privacy_subject_request_transition_recorded_at_idx').on(
      table.recordedAt,
    ),
  ],
);

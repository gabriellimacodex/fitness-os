CREATE TABLE "privacy_audit_event" (
	"audit_event_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"reason_code" text,
	"policy_version_id" uuid,
	"evidence_id" uuid,
	"request_id" uuid,
	"operation_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "privacy_audit_event_kind_check" CHECK ("privacy_audit_event"."kind" IN (
        'data_use_evaluated',
        'authorization_evidence_appended',
        'authorization_withdrawn',
        'subject_request_transitioned',
        'processor_step_recorded',
        'retention_preview_recorded',
        'retention_execution_recorded',
        'governance_lifecycle_recorded'
      )),
	CONSTRAINT "privacy_audit_event_outcome_check" CHECK ("privacy_audit_event"."outcome" IN ('succeeded', 'denied', 'failed', 'partial')),
	CONSTRAINT "privacy_audit_event_reason_code_denied_check" CHECK ((
        ("privacy_audit_event"."outcome" = 'denied' AND "privacy_audit_event"."reason_code" IS NOT NULL) OR
        ("privacy_audit_event"."outcome" = 'succeeded' AND "privacy_audit_event"."reason_code" IS NULL) OR
        ("privacy_audit_event"."outcome" IN ('failed', 'partial'))
      ))
);
--> statement-breakpoint
CREATE TABLE "privacy_authorization_evidence" (
	"evidence_id" uuid PRIMARY KEY NOT NULL,
	"purpose_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"content_digest" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "privacy_authorization_evidence_content_digest_check" CHECK ("privacy_authorization_evidence"."content_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "privacy_withdrawal" (
	"withdrawal_id" uuid PRIMARY KEY NOT NULL,
	"evidence_id" uuid NOT NULL,
	"state" text NOT NULL,
	"withdrawn_at" timestamp with time zone NOT NULL,
	"operation_id" uuid NOT NULL,
	"processing_outcome" text NOT NULL,
	CONSTRAINT "privacy_withdrawal_state_check" CHECK ("privacy_withdrawal"."state" = 'withdrawn'),
	CONSTRAINT "privacy_withdrawal_processing_outcome_check" CHECK ("privacy_withdrawal"."processing_outcome" IN ('accepted', 'idempotent_replay'))
);
--> statement-breakpoint
ALTER TABLE "privacy_audit_event" ADD CONSTRAINT "privacy_audit_event_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."privacy_authorization_evidence"("evidence_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_withdrawal" ADD CONSTRAINT "privacy_withdrawal_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."privacy_authorization_evidence"("evidence_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_audit_event_recorded_at_idx" ON "privacy_audit_event" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "privacy_audit_event_correlation_id_idx" ON "privacy_audit_event" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "privacy_audit_event_operation_id_idx" ON "privacy_audit_event" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "privacy_authorization_evidence_purpose_id_idx" ON "privacy_authorization_evidence" USING btree ("purpose_id");--> statement-breakpoint
CREATE INDEX "privacy_authorization_evidence_policy_version_id_idx" ON "privacy_authorization_evidence" USING btree ("policy_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_withdrawal_evidence_id_unique" ON "privacy_withdrawal" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_withdrawal_operation_id_unique" ON "privacy_withdrawal" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "privacy_withdrawal_withdrawn_at_idx" ON "privacy_withdrawal" USING btree ("withdrawn_at");
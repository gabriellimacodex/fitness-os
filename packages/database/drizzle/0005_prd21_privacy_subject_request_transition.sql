CREATE TABLE "privacy_subject_request_transition" (
	"transition_id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"previous_state" text NOT NULL,
	"next_state" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"reason_code" text,
	"verification_ref_digest" text,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "privacy_subject_request_transition_previous_state_check" CHECK ("privacy_subject_request_transition"."previous_state" IN (
        'received',
        'verification_required',
        'policy_blocked',
        'ready',
        'in_progress',
        'partially_failed',
        'completed',
        'cancelled',
        'denied'
      )),
	CONSTRAINT "privacy_subject_request_transition_next_state_check" CHECK ("privacy_subject_request_transition"."next_state" IN (
        'received',
        'verification_required',
        'policy_blocked',
        'ready',
        'in_progress',
        'partially_failed',
        'completed',
        'cancelled',
        'denied'
      )),
	CONSTRAINT "privacy_subject_request_transition_reason_code_check" CHECK ("privacy_subject_request_transition"."reason_code" IS NULL OR "privacy_subject_request_transition"."reason_code" IN (
        'forward',
        'verification_accepted',
        'policy_blocked',
        'cancelled',
        'denied'
      )),
	CONSTRAINT "privacy_subject_request_transition_verification_digest_check" CHECK ("privacy_subject_request_transition"."verification_ref_digest" IS NULL OR "privacy_subject_request_transition"."verification_ref_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "privacy_subject_request_transition" ADD CONSTRAINT "privacy_subject_request_transition_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."privacy_subject_request"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_subject_request_transition_operation_id_unique" ON "privacy_subject_request_transition" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "privacy_subject_request_transition_request_id_idx" ON "privacy_subject_request_transition" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "privacy_subject_request_transition_recorded_at_idx" ON "privacy_subject_request_transition" USING btree ("recorded_at");
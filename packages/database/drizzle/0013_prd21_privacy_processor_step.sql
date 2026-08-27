CREATE TABLE "privacy_processor_step" (
	"step_id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"processor_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"outcome" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "privacy_processor_step_capability_check" CHECK ("privacy_processor_step"."capability" IN (
        'inventory',
        'access',
        'export',
        'delete',
        'retention',
        'governance_lifecycle'
      )),
	CONSTRAINT "privacy_processor_step_outcome_check" CHECK ("privacy_processor_step"."outcome" IN ('completed', 'retryable_failure', 'permanent_failure'))
);
--> statement-breakpoint
ALTER TABLE "privacy_processor_step" ADD CONSTRAINT "privacy_processor_step_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."privacy_subject_request"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_processor_step_request_id_idx" ON "privacy_processor_step" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "privacy_processor_step_recorded_at_idx" ON "privacy_processor_step" USING btree ("recorded_at");--> statement-breakpoint
-- PRD 21 Option A: this table is append-only history, same as the guards
-- 0006 already applies to the other privacy ledgers. `privacy_reject_append_only_mutation`
-- and the `fitness_os_privacy_ordinary` role both already exist from 0006.
CREATE TRIGGER privacy_processor_step_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_processor_step"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
REVOKE ALL ON TABLE "privacy_processor_step" FROM fitness_os_privacy_ordinary;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "privacy_processor_step" TO fitness_os_privacy_ordinary;
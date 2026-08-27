CREATE TABLE "privacy_governance_lifecycle_proof" (
	"request_id" uuid NOT NULL,
	"processor_id" uuid NOT NULL,
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"outcome" text NOT NULL,
	"proof_id" uuid,
	"recorded_at" timestamp with time zone NOT NULL,
	"synthetic" boolean NOT NULL,
	CONSTRAINT "privacy_governance_lifecycle_proof_outcome_check" CHECK ("privacy_governance_lifecycle_proof"."outcome" IN ('completed', 'partially_failed', 'denied')),
	CONSTRAINT "privacy_governance_lifecycle_proof_proof_id_pair_check" CHECK ((
        ("privacy_governance_lifecycle_proof"."outcome" IN ('completed', 'partially_failed') AND "privacy_governance_lifecycle_proof"."proof_id" IS NOT NULL) OR
        ("privacy_governance_lifecycle_proof"."outcome" = 'denied' AND "privacy_governance_lifecycle_proof"."proof_id" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "privacy_governance_lifecycle_proof" ADD CONSTRAINT "privacy_governance_lifecycle_proof_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."privacy_subject_request"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_governance_lifecycle_proof_request_id_idx" ON "privacy_governance_lifecycle_proof" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "privacy_governance_lifecycle_proof_recorded_at_idx" ON "privacy_governance_lifecycle_proof" USING btree ("recorded_at");--> statement-breakpoint
-- PRD 21 Option A: this table is append-only history, same as the guards
-- 0006 already applies to the other privacy ledgers. `privacy_reject_append_only_mutation`
-- and the `fitness_os_privacy_ordinary` role both already exist from 0006.
CREATE TRIGGER privacy_governance_lifecycle_proof_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_governance_lifecycle_proof"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
REVOKE ALL ON TABLE "privacy_governance_lifecycle_proof" FROM fitness_os_privacy_ordinary;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "privacy_governance_lifecycle_proof" TO fitness_os_privacy_ordinary;
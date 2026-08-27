-- Agent 90 R1 (PR #171): append-only is enforced only by application code
-- (the repository exposes no update/delete method) — there is deliberately
-- no database-level guard trigger/role-revoke here yet, unlike PRD 21's
-- privacy_reject_append_only_mutation() pattern in migration 0006. Explicitly
-- deferred: none of the four prior onboarding tables (migrations 0007-0010)
-- have this guard either, so adding it here alone would be inconsistent: a
-- DB-enforced guard for onboarding history tables is a follow-on slice that
-- should cover all of them together, not just this one.
CREATE TABLE "onboarding_transition" (
	"transition_id" uuid PRIMARY KEY NOT NULL,
	"aggregate" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"previous_state" text NOT NULL,
	"next_state" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_transition_aggregate_check" CHECK ("onboarding_transition"."aggregate" IN (
        'invitation',
        'attempt',
        'role_mapping',
        'operation'
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_transition_dedupe_unique" ON "onboarding_transition" USING btree ("aggregate","aggregate_id","operation_id","previous_state","next_state");--> statement-breakpoint
CREATE INDEX "onboarding_transition_aggregate_id_idx" ON "onboarding_transition" USING btree ("aggregate","aggregate_id");--> statement-breakpoint
CREATE INDEX "onboarding_transition_recorded_at_idx" ON "onboarding_transition" USING btree ("recorded_at");

CREATE TABLE "onboarding_transition" (
	"transition_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"previous_state" text NOT NULL,
	"next_state" text NOT NULL,
	"operation_id" text NOT NULL,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_transition_aggregate_check" CHECK ("onboarding_transition"."aggregate" IN ('invitation', 'attempt', 'role_mapping', 'operation'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_transition_dedup_unique" ON "onboarding_transition" USING btree ("aggregate","aggregate_id","operation_id","previous_state","next_state");--> statement-breakpoint
CREATE INDEX "onboarding_transition_aggregate_idx" ON "onboarding_transition" USING btree ("aggregate","aggregate_id");--> statement-breakpoint
CREATE INDEX "onboarding_transition_recorded_at_idx" ON "onboarding_transition" USING btree ("recorded_at");
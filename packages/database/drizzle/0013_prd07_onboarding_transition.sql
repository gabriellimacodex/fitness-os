CREATE TABLE "onboarding_transition" (
	"id" uuid PRIMARY KEY NOT NULL,
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
CREATE UNIQUE INDEX "onboarding_transition_dedupe_unique" ON "onboarding_transition" USING btree ("aggregate","aggregate_id","operation_id","previous_state","next_state");--> statement-breakpoint
CREATE INDEX "onboarding_transition_aggregate_id_idx" ON "onboarding_transition" USING btree ("aggregate","aggregate_id");
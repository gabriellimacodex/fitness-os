CREATE TABLE "onboarding_claim_failure" (
	"failure_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "onboarding_claim_failure_key_occurred_at_idx" ON "onboarding_claim_failure" USING btree ("key","occurred_at");
CREATE TABLE "onboarding_invitation" (
	"invitation_id" uuid PRIMARY KEY NOT NULL,
	"claim_digest" text NOT NULL,
	"proposed_role" text NOT NULL,
	"purpose" text NOT NULL,
	"state" text NOT NULL,
	"target_coach_principal_key" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_invitation_proposed_role_check" CHECK ("onboarding_invitation"."proposed_role" IN ('student', 'coach')),
	CONSTRAINT "onboarding_invitation_purpose_check" CHECK ("onboarding_invitation"."purpose" IN ('coach_bootstrap', 'student_onboarding')),
	CONSTRAINT "onboarding_invitation_state_check" CHECK ("onboarding_invitation"."state" IN ('issued', 'claimed', 'revoked', 'expired')),
	CONSTRAINT "onboarding_invitation_claim_digest_check" CHECK ("onboarding_invitation"."claim_digest" ~ '^hmac-sha256\.v1:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_invitation_claim_digest_unique" ON "onboarding_invitation" USING btree ("claim_digest");--> statement-breakpoint
CREATE INDEX "onboarding_invitation_state_idx" ON "onboarding_invitation" USING btree ("state");--> statement-breakpoint
CREATE INDEX "onboarding_invitation_target_coach_idx" ON "onboarding_invitation" USING btree ("target_coach_principal_key");
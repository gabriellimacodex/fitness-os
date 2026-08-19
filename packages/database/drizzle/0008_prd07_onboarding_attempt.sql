CREATE TABLE "onboarding_attempt" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"invitation_id" uuid NOT NULL,
	"principal_key" text NOT NULL,
	"proposed_role" text NOT NULL,
	"purpose" text NOT NULL,
	"lifecycle" text NOT NULL,
	"ordinal" integer NOT NULL,
	"predecessor_attempt_id" uuid,
	"terminal_reason" text,
	"policy" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_attempt_proposed_role_check" CHECK ("onboarding_attempt"."proposed_role" IN ('student', 'coach')),
	CONSTRAINT "onboarding_attempt_purpose_check" CHECK ("onboarding_attempt"."purpose" IN ('coach_bootstrap', 'student_onboarding')),
	CONSTRAINT "onboarding_attempt_lifecycle_check" CHECK ("onboarding_attempt"."lifecycle" IN (
        'policy_pending',
        'ready_to_claim',
        'completed',
        'terminal'
      )),
	CONSTRAINT "onboarding_attempt_ordinal_check" CHECK ("onboarding_attempt"."ordinal" BETWEEN 1 AND 4),
	CONSTRAINT "onboarding_attempt_terminal_reason_check" CHECK ("onboarding_attempt"."terminal_reason" IS NULL OR "onboarding_attempt"."terminal_reason" IN (
        'abandoned',
        'expired',
        'superseded',
        'invitation_unavailable',
        'mapping_conflict',
        'hard_disabled'
      )),
	CONSTRAINT "onboarding_attempt_terminal_pair_check" CHECK ((
        ("onboarding_attempt"."lifecycle" = 'terminal' AND "onboarding_attempt"."terminal_reason" IS NOT NULL) OR
        ("onboarding_attempt"."lifecycle" <> 'terminal' AND "onboarding_attempt"."terminal_reason" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "onboarding_attempt" ADD CONSTRAINT "onboarding_attempt_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."onboarding_invitation"("invitation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_attempt_principal_key_idx" ON "onboarding_attempt" USING btree ("principal_key");--> statement-breakpoint
CREATE INDEX "onboarding_attempt_lifecycle_idx" ON "onboarding_attempt" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "onboarding_attempt_invitation_id_idx" ON "onboarding_attempt" USING btree ("invitation_id");
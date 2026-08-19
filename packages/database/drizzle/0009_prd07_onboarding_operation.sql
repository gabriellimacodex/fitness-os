CREATE TABLE "onboarding_operation" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"binding_key" text NOT NULL,
	"principal_key" text NOT NULL,
	"namespace" text NOT NULL,
	"retry_digest" text NOT NULL,
	"digest" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_operation_namespace_check" CHECK ("onboarding_operation"."namespace" IN (
        'create_attempt',
        'resume_attempt',
        'abandon_attempt',
        'refresh_policy',
        'claim_attempt',
        'issue_student_invitation',
        'revoke_student_invitation'
      )),
	CONSTRAINT "onboarding_operation_retry_digest_check" CHECK ("onboarding_operation"."retry_digest" ~ '^hmac-sha256\.v1:[a-f0-9]{64}$'),
	CONSTRAINT "onboarding_operation_digest_check" CHECK ("onboarding_operation"."digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_operation_binding_key_unique" ON "onboarding_operation" USING btree ("binding_key");--> statement-breakpoint
CREATE INDEX "onboarding_operation_principal_key_idx" ON "onboarding_operation" USING btree ("principal_key");--> statement-breakpoint
CREATE INDEX "onboarding_operation_namespace_idx" ON "onboarding_operation" USING btree ("namespace");
CREATE TABLE "onboarding_role_mapping" (
	"mapping_id" uuid PRIMARY KEY NOT NULL,
	"principal_key" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_role_mapping_role_check" CHECK ("onboarding_role_mapping"."role" IN ('student', 'coach'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_role_mapping_principal_role_unique" ON "onboarding_role_mapping" USING btree ("principal_key","role");--> statement-breakpoint
CREATE INDEX "onboarding_role_mapping_principal_key_idx" ON "onboarding_role_mapping" USING btree ("principal_key");
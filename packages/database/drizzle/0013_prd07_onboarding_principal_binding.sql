CREATE TABLE "onboarding_principal_binding" (
	"binding_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_principal_binding_principal_key_unique" ON "onboarding_principal_binding" USING btree ("principal_key");
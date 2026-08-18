CREATE TABLE "privacy_policy_package_version" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"package_id" uuid NOT NULL,
	"canonicalization_version" text NOT NULL,
	"content_digest" text NOT NULL,
	"synthetic" boolean NOT NULL,
	CONSTRAINT "privacy_policy_package_version_canonicalization_check" CHECK ("privacy_policy_package_version"."canonicalization_version" = 'privacy-governance.canonical.v1'),
	CONSTRAINT "privacy_policy_package_version_content_digest_check" CHECK ("privacy_policy_package_version"."content_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "privacy_processor_registration" (
	"processor_id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"descriptor_digest" text NOT NULL,
	"inventory_version_digest" text NOT NULL,
	"allowed_purpose_ids" jsonb NOT NULL,
	"allowed_category_ids" jsonb NOT NULL,
	"capabilities" jsonb NOT NULL,
	"supports_subject_lookup" boolean NOT NULL,
	"code_owner" text NOT NULL,
	"synthetic" boolean NOT NULL,
	CONSTRAINT "privacy_processor_registration_descriptor_digest_check" CHECK ("privacy_processor_registration"."descriptor_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_processor_registration_inventory_version_digest_check" CHECK ("privacy_processor_registration"."inventory_version_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_processor_registration_code_owner_check" CHECK ("privacy_processor_registration"."code_owner" ~ '^[A-Za-z0-9._:-]+$' AND char_length("privacy_processor_registration"."code_owner") BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE TABLE "privacy_purpose_version" (
	"purpose_version_id" uuid PRIMARY KEY NOT NULL,
	"purpose_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"allowed_operation_kinds" jsonb NOT NULL,
	"allowed_category_ids" jsonb NOT NULL,
	"evidence_required" boolean NOT NULL,
	"activation_state" text NOT NULL,
	"content_digest" text NOT NULL,
	CONSTRAINT "privacy_purpose_version_activation_state_check" CHECK ("privacy_purpose_version"."activation_state" IN ('active', 'inactive', 'superseded')),
	CONSTRAINT "privacy_purpose_version_content_digest_check" CHECK ("privacy_purpose_version"."content_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "privacy_purpose_version" ADD CONSTRAINT "privacy_purpose_version_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."privacy_policy_package_version"("version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_policy_package_version_package_id_idx" ON "privacy_policy_package_version" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "privacy_processor_registration_inventory_id_idx" ON "privacy_processor_registration" USING btree ("inventory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_purpose_version_one_active" ON "privacy_purpose_version" USING btree ("purpose_id") WHERE "privacy_purpose_version"."activation_state" = 'active';--> statement-breakpoint
CREATE INDEX "privacy_purpose_version_purpose_id_idx" ON "privacy_purpose_version" USING btree ("purpose_id");
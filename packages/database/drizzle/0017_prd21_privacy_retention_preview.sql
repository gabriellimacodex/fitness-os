CREATE TABLE "privacy_retention_preview" (
	"selection_digest" text PRIMARY KEY NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"inventory_version_digest" text NOT NULL,
	"processor_descriptor_digests" jsonb NOT NULL,
	"watermark" timestamp with time zone NOT NULL,
	"approved_exception_ids" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	CONSTRAINT "privacy_retention_preview_selection_digest_check" CHECK ("privacy_retention_preview"."selection_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_retention_preview_inventory_digest_check" CHECK ("privacy_retention_preview"."inventory_version_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_retention_preview_status_check" CHECK ("privacy_retention_preview"."status" IN ('planned', 'executed')),
	CONSTRAINT "privacy_retention_preview_status_executed_at_pair_check" CHECK ((
        ("privacy_retention_preview"."status" = 'executed' AND "privacy_retention_preview"."executed_at" IS NOT NULL) OR
        ("privacy_retention_preview"."status" = 'planned' AND "privacy_retention_preview"."executed_at" IS NULL)
      ))
);
--> statement-breakpoint
CREATE INDEX "privacy_retention_preview_created_at_idx" ON "privacy_retention_preview" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "privacy_retention_preview_policy_version_id_idx" ON "privacy_retention_preview" USING btree ("policy_version_id");
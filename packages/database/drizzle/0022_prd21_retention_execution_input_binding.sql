ALTER TABLE "privacy_retention_preview" ADD COLUMN "execution_input_digest" text;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_retention_preview_execution_operation_id_unique" ON "privacy_retention_preview" USING btree ("execution_operation_id");--> statement-breakpoint
ALTER TABLE "privacy_retention_preview" ADD CONSTRAINT "privacy_retention_preview_status_input_digest_pair_check" CHECK ((
        ("privacy_retention_preview"."status" = 'executed' AND "privacy_retention_preview"."execution_input_digest" ~ '^[a-f0-9]{64}$') OR
        ("privacy_retention_preview"."status" = 'planned' AND "privacy_retention_preview"."execution_input_digest" IS NULL)
      )) NOT VALID;

ALTER TABLE "privacy_retention_preview" ADD CONSTRAINT "privacy_retention_preview_status_operation_pair_check" CHECK ((
        ("privacy_retention_preview"."status" = 'executed' AND "privacy_retention_preview"."execution_operation_id" IS NOT NULL) OR
        ("privacy_retention_preview"."status" = 'planned' AND "privacy_retention_preview"."execution_operation_id" IS NULL)
      )) NOT VALID;

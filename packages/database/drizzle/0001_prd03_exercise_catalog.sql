CREATE TABLE "catalog_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_key" text NOT NULL,
	"namespace" text NOT NULL,
	"canonicalization_version" text NOT NULL,
	"input_digest" text NOT NULL,
	"status" text NOT NULL,
	"result_payload" jsonb NOT NULL,
	"result_integrity_key_id" text NOT NULL,
	"result_integrity_digest" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_operation_namespace_check" CHECK ("catalog_operation"."namespace" IN (
        'exercise.publish',
        'exercise.lifecycle',
        'taxonomy.create',
        'taxonomy.lifecycle',
        'taxonomy.replace',
        'manifest.ingest'
      )),
	CONSTRAINT "catalog_operation_status_check" CHECK ("catalog_operation"."status" IN ('committed')),
	CONSTRAINT "catalog_operation_input_digest_check" CHECK ("catalog_operation"."input_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "catalog_operation_result_integrity_digest_check" CHECK ("catalog_operation"."result_integrity_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "catalog_operation_result_integrity_key_id_check" CHECK (char_length("catalog_operation"."result_integrity_key_id") BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE TABLE "exercise_lifecycle_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text NOT NULL,
	"previous_lifecycle" text,
	"next_lifecycle" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exercise_lifecycle_event_kind_check" CHECK ("exercise_lifecycle_event"."event_kind" IN ('published', 'archived', 'reactivated')),
	CONSTRAINT "exercise_lifecycle_event_reason_check" CHECK (char_length("exercise_lifecycle_event"."reason") BETWEEN 1 AND 500),
	CONSTRAINT "exercise_lifecycle_event_next_lifecycle_check" CHECK ("exercise_lifecycle_event"."next_lifecycle" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "exercise_reference_candidate" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"locator" text NOT NULL,
	"purpose" text NOT NULL,
	"assessment" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exercise_reference_candidate_kind_check" CHECK ("exercise_reference_candidate"."kind" IN ('doi', 'https_url')),
	CONSTRAINT "exercise_reference_candidate_purpose_check" CHECK ("exercise_reference_candidate"."purpose" IN ('provenance', 'evidence_candidate')),
	CONSTRAINT "exercise_reference_candidate_assessment_check" CHECK ("exercise_reference_candidate"."assessment" = 'unassessed'),
	CONSTRAINT "exercise_reference_candidate_locator_check" CHECK (char_length("exercise_reference_candidate"."locator") BETWEEN 1 AND 2048)
);
--> statement-breakpoint
CREATE TABLE "exercise_revision_reference" (
	"revision_id" uuid NOT NULL,
	"reference_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	CONSTRAINT "exercise_revision_reference_purpose_check" CHECK ("exercise_revision_reference"."purpose" IN ('provenance', 'evidence_candidate'))
);
--> statement-breakpoint
CREATE TABLE "exercise_revision_taxonomy_term" (
	"revision_id" uuid NOT NULL,
	"term_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exercise_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"display_name" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"description" text NOT NULL,
	"origin_kind" text NOT NULL,
	"change_reason" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"primary_provenance_reference_id" uuid,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"operation_id" uuid NOT NULL,
	CONSTRAINT "exercise_revision_revision_check" CHECK ("exercise_revision"."revision" >= 1),
	CONSTRAINT "exercise_revision_display_name_check" CHECK (char_length("exercise_revision"."display_name") BETWEEN 1 AND 120),
	CONSTRAINT "exercise_revision_description_check" CHECK (char_length("exercise_revision"."description") BETWEEN 1 AND 1000),
	CONSTRAINT "exercise_revision_origin_kind_check" CHECK ("exercise_revision"."origin_kind" IN ('internally_curated', 'derived_from_public_locator')),
	CONSTRAINT "exercise_revision_change_reason_check" CHECK (char_length("exercise_revision"."change_reason") BETWEEN 1 AND 500),
	CONSTRAINT "exercise_revision_content_hash_check" CHECK ("exercise_revision"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "exercise_revision_provenance_shape_check" CHECK ((
        ("exercise_revision"."origin_kind" = 'internally_curated' AND "exercise_revision"."primary_provenance_reference_id" IS NULL)
        OR
        ("exercise_revision"."origin_kind" = 'derived_from_public_locator' AND "exercise_revision"."primary_provenance_reference_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "exercise" (
	"id" uuid PRIMARY KEY NOT NULL,
	"canonical_key" text NOT NULL,
	"lifecycle" text NOT NULL,
	"current_revision_id" uuid,
	"current_revision_number" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exercise_lifecycle_check" CHECK ("exercise"."lifecycle" IN ('active', 'archived')),
	CONSTRAINT "exercise_canonical_key_check" CHECK ("exercise"."canonical_key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length("exercise"."canonical_key") BETWEEN 1 AND 64),
	CONSTRAINT "exercise_current_revision_number_check" CHECK ("exercise"."current_revision_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "taxonomy_dimension" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "taxonomy_dimension_key_check" CHECK ("taxonomy_dimension"."key" IN ('modality', 'equipment')),
	CONSTRAINT "taxonomy_dimension_label_check" CHECK (char_length("taxonomy_dimension"."label") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE "taxonomy_lifecycle_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text NOT NULL,
	"previous_lifecycle" text,
	"next_lifecycle" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "taxonomy_lifecycle_event_kind_check" CHECK ("taxonomy_lifecycle_event"."event_kind" IN ('created', 'archived', 'replaced')),
	CONSTRAINT "taxonomy_lifecycle_event_reason_check" CHECK (char_length("taxonomy_lifecycle_event"."reason") BETWEEN 1 AND 500),
	CONSTRAINT "taxonomy_lifecycle_event_next_lifecycle_check" CHECK ("taxonomy_lifecycle_event"."next_lifecycle" IN ('active', 'archived', 'replaced'))
);
--> statement-breakpoint
CREATE TABLE "taxonomy_term" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dimension_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"meaning" text NOT NULL,
	"lifecycle" text NOT NULL,
	"replaced_by_term_id" uuid,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "taxonomy_term_lifecycle_check" CHECK ("taxonomy_term"."lifecycle" IN ('active', 'archived', 'replaced')),
	CONSTRAINT "taxonomy_term_key_check" CHECK ("taxonomy_term"."key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length("taxonomy_term"."key") BETWEEN 1 AND 64),
	CONSTRAINT "taxonomy_term_label_check" CHECK (char_length("taxonomy_term"."label") BETWEEN 1 AND 120),
	CONSTRAINT "taxonomy_term_meaning_check" CHECK (char_length("taxonomy_term"."meaning") BETWEEN 1 AND 1000),
	CONSTRAINT "taxonomy_term_replacement_shape_check" CHECK ((
        ("taxonomy_term"."lifecycle" = 'replaced' AND "taxonomy_term"."replaced_by_term_id" IS NOT NULL AND "taxonomy_term"."replaced_by_term_id" <> "taxonomy_term"."id")
        OR
        ("taxonomy_term"."lifecycle" <> 'replaced' AND "taxonomy_term"."replaced_by_term_id" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "exercise_lifecycle_event" ADD CONSTRAINT "exercise_lifecycle_event_operation_id_catalog_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."catalog_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_lifecycle_event" ADD CONSTRAINT "exercise_lifecycle_event_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revision_reference" ADD CONSTRAINT "exercise_revision_reference_revision_id_exercise_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."exercise_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revision_reference" ADD CONSTRAINT "exercise_revision_reference_reference_id_exercise_reference_candidate_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."exercise_reference_candidate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revision_taxonomy_term" ADD CONSTRAINT "exercise_revision_taxonomy_term_revision_id_exercise_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."exercise_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revision_taxonomy_term" ADD CONSTRAINT "exercise_revision_taxonomy_term_term_id_taxonomy_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."taxonomy_term"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revision" ADD CONSTRAINT "exercise_revision_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revision" ADD CONSTRAINT "exercise_revision_operation_id_catalog_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."catalog_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revision" ADD CONSTRAINT "exercise_revision_primary_provenance_reference_id_fk" FOREIGN KEY ("primary_provenance_reference_id") REFERENCES "public"."exercise_reference_candidate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_lifecycle_event" ADD CONSTRAINT "taxonomy_lifecycle_event_operation_id_catalog_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."catalog_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_lifecycle_event" ADD CONSTRAINT "taxonomy_lifecycle_event_term_id_taxonomy_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."taxonomy_term"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD CONSTRAINT "taxonomy_term_dimension_id_taxonomy_dimension_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."taxonomy_dimension"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD CONSTRAINT "taxonomy_term_operation_id_catalog_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."catalog_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD CONSTRAINT "taxonomy_term_replaced_by_term_id_taxonomy_term_id_fk" FOREIGN KEY ("replaced_by_term_id") REFERENCES "public"."taxonomy_term"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_operation_operation_key_unique" ON "catalog_operation" USING btree ("operation_key");--> statement-breakpoint
CREATE INDEX "catalog_operation_created_at_idx" ON "catalog_operation" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "exercise_lifecycle_event_exercise_recorded_idx" ON "exercise_lifecycle_event" USING btree ("exercise_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_reference_candidate_kind_locator_purpose_unique" ON "exercise_reference_candidate" USING btree ("kind","locator","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_revision_reference_unique" ON "exercise_revision_reference" USING btree ("revision_id","reference_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_revision_taxonomy_term_unique" ON "exercise_revision_taxonomy_term" USING btree ("revision_id","term_id");--> statement-breakpoint
CREATE INDEX "exercise_revision_taxonomy_term_term_idx" ON "exercise_revision_taxonomy_term" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_revision_exercise_revision_unique" ON "exercise_revision" USING btree ("exercise_id","revision");--> statement-breakpoint
CREATE INDEX "exercise_revision_exercise_id_idx" ON "exercise_revision" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_canonical_key_unique" ON "exercise" USING btree ("canonical_key");--> statement-breakpoint
CREATE INDEX "exercise_lifecycle_id_idx" ON "exercise" USING btree ("lifecycle","id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_dimension_key_unique" ON "taxonomy_dimension" USING btree ("key");--> statement-breakpoint
CREATE INDEX "taxonomy_lifecycle_event_term_recorded_idx" ON "taxonomy_lifecycle_event" USING btree ("term_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_term_dimension_key_unique" ON "taxonomy_term" USING btree ("dimension_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_term_replaced_by_unique" ON "taxonomy_term" USING btree ("replaced_by_term_id") WHERE "taxonomy_term"."replaced_by_term_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "taxonomy_term_dimension_lifecycle_idx" ON "taxonomy_term" USING btree ("dimension_id","lifecycle");--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_current_revision_id_exercise_revision_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."exercise_revision"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
INSERT INTO "taxonomy_dimension" ("id", "key", "label") VALUES
	('a1000001-0000-4000-8000-000000000001', 'modality', 'Modality'),
	('a1000002-0000-4000-8000-000000000002', 'equipment', 'Equipment');
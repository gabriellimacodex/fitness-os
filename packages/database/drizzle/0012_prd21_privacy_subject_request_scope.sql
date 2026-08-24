ALTER TABLE "privacy_subject_request" ADD COLUMN "subject_scope_id" uuid;--> statement-breakpoint
CREATE INDEX "privacy_subject_request_subject_scope_id_idx" ON "privacy_subject_request" USING btree ("subject_scope_id");

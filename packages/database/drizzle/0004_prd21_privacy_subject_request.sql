CREATE TABLE "privacy_subject_request" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"request_type" text NOT NULL,
	"state" text NOT NULL,
	"verification_ref_digest" text,
	"verification_synthetic" boolean,
	"policy_version_id" uuid NOT NULL,
	"inventory_version_digest" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "privacy_subject_request_type_check" CHECK ("privacy_subject_request"."request_type" IN ('access', 'export', 'deletion')),
	CONSTRAINT "privacy_subject_request_state_check" CHECK ("privacy_subject_request"."state" IN (
        'received',
        'verification_required',
        'policy_blocked',
        'ready',
        'in_progress',
        'partially_failed',
        'completed',
        'cancelled',
        'denied'
      )),
	CONSTRAINT "privacy_subject_request_inventory_version_digest_check" CHECK ("privacy_subject_request"."inventory_version_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_subject_request_verification_pair_check" CHECK ((
        ("privacy_subject_request"."verification_ref_digest" IS NULL AND "privacy_subject_request"."verification_synthetic" IS NULL) OR
        ("privacy_subject_request"."verification_ref_digest" ~ '^[a-f0-9]{64}$' AND "privacy_subject_request"."verification_synthetic" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "privacy_subject_request" ADD CONSTRAINT "privacy_subject_request_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."privacy_policy_package_version"("version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_subject_request_state_idx" ON "privacy_subject_request" USING btree ("state");--> statement-breakpoint
CREATE INDEX "privacy_subject_request_updated_at_idx" ON "privacy_subject_request" USING btree ("updated_at");
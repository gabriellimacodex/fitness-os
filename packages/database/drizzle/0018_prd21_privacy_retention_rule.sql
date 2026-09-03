CREATE TABLE "privacy_retention_rule" (
	"rule_version_id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"engineering_category_id" uuid NOT NULL,
	"purpose_version_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"action" text NOT NULL,
	"parameters_digest" text NOT NULL,
	"canonicalization_version" text NOT NULL,
	"synthetic" boolean NOT NULL,
	CONSTRAINT "privacy_retention_rule_action_check" CHECK ("privacy_retention_rule"."action" IN ('delete', 'irreversibly_transform', 'retain_under_exception')),
	CONSTRAINT "privacy_retention_rule_parameters_digest_check" CHECK ("privacy_retention_rule"."parameters_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_retention_rule_canonicalization_check" CHECK ("privacy_retention_rule"."canonicalization_version" = 'privacy-governance.canonical.v1')
);
--> statement-breakpoint
CREATE INDEX "privacy_retention_rule_category_purpose_idx" ON "privacy_retention_rule" USING btree ("engineering_category_id","purpose_version_id");--> statement-breakpoint
CREATE INDEX "privacy_retention_rule_rule_id_idx" ON "privacy_retention_rule" USING btree ("rule_id");
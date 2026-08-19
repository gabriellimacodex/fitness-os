-- PRD 21 Option A: reject ordinary/ad hoc UPDATE/DELETE on append-only and
-- immutable privacy ledgers. Restricted lifecycle DML remains a later slice.
CREATE OR REPLACE FUNCTION privacy_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'fitness_os_privacy_append_only: % forbidden on %', TG_OP, TG_TABLE_NAME
		USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
	CREATE ROLE fitness_os_privacy_ordinary NOLOGIN;
EXCEPTION
	WHEN duplicate_object THEN
		NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER privacy_authorization_evidence_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_authorization_evidence"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER privacy_withdrawal_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_withdrawal"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER privacy_audit_event_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_audit_event"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER privacy_subject_request_transition_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_subject_request_transition"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER privacy_policy_package_version_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_policy_package_version"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER privacy_purpose_version_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_purpose_version"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER privacy_processor_registration_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_processor_registration"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
REVOKE ALL ON TABLE
	"privacy_authorization_evidence",
	"privacy_withdrawal",
	"privacy_audit_event",
	"privacy_subject_request_transition",
	"privacy_policy_package_version",
	"privacy_purpose_version",
	"privacy_processor_registration"
FROM fitness_os_privacy_ordinary;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE
	"privacy_authorization_evidence",
	"privacy_withdrawal",
	"privacy_audit_event",
	"privacy_subject_request_transition",
	"privacy_policy_package_version",
	"privacy_purpose_version",
	"privacy_processor_registration"
TO fitness_os_privacy_ordinary;

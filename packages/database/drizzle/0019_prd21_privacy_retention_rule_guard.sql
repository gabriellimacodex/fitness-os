-- PRD 21 Option A: retention-rule versions are immutable once accepted.
-- The shared function and ordinary role were introduced by migration 0006.
CREATE TRIGGER privacy_retention_rule_append_only_guard
BEFORE UPDATE OR DELETE ON "privacy_retention_rule"
FOR EACH ROW
EXECUTE FUNCTION privacy_reject_append_only_mutation();
--> statement-breakpoint
REVOKE ALL ON TABLE "privacy_retention_rule" FROM fitness_os_privacy_ordinary;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "privacy_retention_rule" TO fitness_os_privacy_ordinary;

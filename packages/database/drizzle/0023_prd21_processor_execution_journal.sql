-- PRD 21 Option A: durable synthetic execution ownership and reconciliation.
CREATE TABLE "privacy_processor_execution_journal" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"processor_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"binding_digest" text NOT NULL,
	"state" text NOT NULL,
	"outcome" text,
	"reserved_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"synthetic" boolean NOT NULL,
	CONSTRAINT "privacy_processor_execution_journal_capability_check" CHECK ("privacy_processor_execution_journal"."capability" IN ('access', 'export', 'delete', 'retention', 'governance_lifecycle')),
	CONSTRAINT "privacy_processor_execution_journal_binding_digest_check" CHECK ("privacy_processor_execution_journal"."binding_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "privacy_processor_execution_journal_state_check" CHECK ("privacy_processor_execution_journal"."state" IN ('reserved', 'completed', 'reconciliation_required')),
	CONSTRAINT "privacy_processor_execution_journal_outcome_check" CHECK ("privacy_processor_execution_journal"."outcome" IS NULL OR "privacy_processor_execution_journal"."outcome" IN ('completed', 'retryable_failure', 'permanent_failure')),
	CONSTRAINT "privacy_processor_execution_journal_completion_pair_check" CHECK ((
        ("privacy_processor_execution_journal"."state" = 'completed' AND "privacy_processor_execution_journal"."outcome" IS NOT NULL AND "privacy_processor_execution_journal"."completed_at" IS NOT NULL) OR
        ("privacy_processor_execution_journal"."state" IN ('reserved', 'reconciliation_required') AND "privacy_processor_execution_journal"."outcome" IS NULL AND "privacy_processor_execution_journal"."completed_at" IS NULL)
      )),
	CONSTRAINT "privacy_processor_execution_journal_synthetic_check" CHECK ("privacy_processor_execution_journal"."synthetic" = true)
);
--> statement-breakpoint
ALTER TABLE "privacy_processor_execution_journal" ADD CONSTRAINT "privacy_processor_execution_journal_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."privacy_subject_request"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_processor_execution_journal_request_id_idx" ON "privacy_processor_execution_journal" USING btree ("request_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION privacy_guard_processor_execution_journal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.state <> 'reserved'
			OR NEW.outcome IS NOT NULL
			OR NEW.completed_at IS NOT NULL
		THEN
			RAISE EXCEPTION 'fitness_os_privacy_execution_journal: initial state must be reserved'
				USING ERRCODE = '42501';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'fitness_os_privacy_execution_journal: DELETE forbidden'
			USING ERRCODE = '42501';
	END IF;

	IF OLD.operation_id IS DISTINCT FROM NEW.operation_id
		OR OLD.request_id IS DISTINCT FROM NEW.request_id
		OR OLD.processor_id IS DISTINCT FROM NEW.processor_id
		OR OLD.capability IS DISTINCT FROM NEW.capability
		OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
		OR OLD.binding_digest IS DISTINCT FROM NEW.binding_digest
		OR OLD.reserved_at IS DISTINCT FROM NEW.reserved_at
		OR OLD.synthetic IS DISTINCT FROM NEW.synthetic
	THEN
		RAISE EXCEPTION 'fitness_os_privacy_execution_journal: immutable binding mutation forbidden'
			USING ERRCODE = '42501';
	END IF;

	IF OLD.state <> 'reserved'
		OR NEW.state NOT IN ('completed', 'reconciliation_required')
	THEN
		RAISE EXCEPTION 'fitness_os_privacy_execution_journal: invalid state transition'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER privacy_processor_execution_journal_mutation_guard
BEFORE INSERT OR UPDATE OR DELETE ON "privacy_processor_execution_journal"
FOR EACH ROW
EXECUTE FUNCTION privacy_guard_processor_execution_journal_mutation();
--> statement-breakpoint
REVOKE ALL ON TABLE "privacy_processor_execution_journal" FROM fitness_os_privacy_ordinary;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "privacy_processor_execution_journal" TO fitness_os_privacy_ordinary;

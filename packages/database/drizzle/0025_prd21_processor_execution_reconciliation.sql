-- PRD 21 Option A: allow a reconciliation hold to reach a terminal outcome.
-- The repository exposes this transition only after independent receipt
-- verification; immutable binding columns and initial-state guards remain.
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

	IF NOT (
		(OLD.state = 'reserved' AND NEW.state IN ('completed', 'reconciliation_required'))
		OR (OLD.state = 'reconciliation_required' AND NEW.state = 'completed')
	) THEN
		RAISE EXCEPTION 'fitness_os_privacy_execution_journal: invalid state transition'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$$;

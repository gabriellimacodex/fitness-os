CREATE TABLE "onboarding_attempt_cardinality_guard" (
	"principal_key" text NOT NULL,
	"proposed_role" text NOT NULL,
	"active_count" integer NOT NULL,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_attempt_cardinality_guard_principal_key_proposed_role_pk" PRIMARY KEY("principal_key","proposed_role"),
	CONSTRAINT "onboarding_attempt_cardinality_guard_proposed_role_check" CHECK ("onboarding_attempt_cardinality_guard"."proposed_role" IN ('student', 'coach')),
	CONSTRAINT "onboarding_attempt_cardinality_guard_active_count_check" CHECK ("onboarding_attempt_cardinality_guard"."active_count" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE INDEX "onboarding_attempt_principal_role_lifecycle_idx" ON "onboarding_attempt" USING btree ("principal_key","proposed_role","lifecycle");
--> statement-breakpoint
-- PRD 07: "Store one cardinality guard per principal/proposed-role... A
-- constraint trigger or equivalently reviewed database-enforced routine
-- rejects a bypass write that would exceed the cap, underflow the guard, or
-- diverge from the nonterminal rows." Rather than trusting application code
-- to keep a separately-written counter in sync, this trigger recomputes
-- `active_count` from the real nonterminal `onboarding_attempt` rows on every
-- insert/update/delete, so the guard can never diverge from ground truth and
-- underflow is structurally impossible (a COUNT(*) is never negative). The
-- guard row's own `active_count BETWEEN 0 AND 4` check constraint then
-- rejects the triggering transaction outright the moment a write would push
-- a scope's true nonterminal count past the cap — including a write that
-- bypasses the application's own pre-check entirely.
CREATE OR REPLACE FUNCTION onboarding_guard_attempt_cardinality()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	v_principal_key text;
	v_proposed_role text;
	v_count integer;
BEGIN
	IF TG_OP = 'UPDATE' AND (
		OLD.principal_key IS DISTINCT FROM NEW.principal_key
		OR OLD.proposed_role IS DISTINCT FROM NEW.proposed_role
	) THEN
		RAISE EXCEPTION 'fitness_os_onboarding_attempt_cardinality: principal_key/proposed_role are immutable'
			USING ERRCODE = '42501';
	END IF;

	IF TG_OP = 'DELETE' THEN
		v_principal_key := OLD.principal_key;
		v_proposed_role := OLD.proposed_role;
	ELSE
		v_principal_key := NEW.principal_key;
		v_proposed_role := NEW.proposed_role;
	END IF;

	INSERT INTO onboarding_attempt_cardinality_guard (
		principal_key, proposed_role, active_count, lock_version, updated_at
	)
	VALUES (v_principal_key, v_proposed_role, 0, 0, now())
	ON CONFLICT (principal_key, proposed_role) DO NOTHING;

	-- Serialize concurrent writers for this exact principal/role scope so two
	-- racing inserts cannot both observe a stale count below the cap.
	PERFORM 1
	FROM onboarding_attempt_cardinality_guard
	WHERE principal_key = v_principal_key
		AND proposed_role = v_proposed_role
	FOR UPDATE;

	SELECT count(*) INTO v_count
	FROM onboarding_attempt
	WHERE principal_key = v_principal_key
		AND proposed_role = v_proposed_role
		AND lifecycle IN ('policy_pending', 'ready_to_claim');

	UPDATE onboarding_attempt_cardinality_guard
	SET active_count = v_count,
		lock_version = lock_version + 1,
		updated_at = now()
	WHERE principal_key = v_principal_key
		AND proposed_role = v_proposed_role;

	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER onboarding_attempt_cardinality_guard_sync
AFTER INSERT OR UPDATE OR DELETE ON "onboarding_attempt"
FOR EACH ROW
EXECUTE FUNCTION onboarding_guard_attempt_cardinality();
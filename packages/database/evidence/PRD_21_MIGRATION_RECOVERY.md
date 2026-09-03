# PRD 21 migration and recovery evidence

## Migration

- Immutable migrations: `drizzle/0002_prd21_privacy_core.sql`,
  `0003_prd21_privacy_policy_purpose_processor.sql`,
  `0004_prd21_privacy_subject_request.sql`,
  `0005_prd21_privacy_subject_request_transition.sql`,
  `0006_prd21_privacy_append_only_guards.sql`,
  `0011_prd21_privacy_ordinary_schema_usage.sql`,
  `0012_prd21_privacy_subject_request_scope.sql`,
  `0014_prd21_privacy_processor_step.sql`, and
  `0015_prd21_privacy_governance_lifecycle_proof.sql`.
- Scope: privacy-governance ledgers (audit, authorization evidence,
  withdrawal, policy/purpose/processor versions, subject request and its
  transitions, processor step, governance-lifecycle proof) and the
  `fitness_os_privacy_ordinary` least-privilege role. No PRD 02/03/07 table is
  altered by any of these migrations.
- `0006` adds `BEFORE UPDATE OR DELETE` triggers that reject ordinary
  mutation of every append-only/immutable ledger listed above
  (`privacy_reject_append_only_mutation`, `ERRCODE 42501`) and revokes
  `UPDATE`/`DELETE` from `fitness_os_privacy_ordinary`, leaving it only
  `SELECT`/`INSERT`. Restricted lifecycle DML (e.g. an approved deletion or
  retention execution) is a later, separately authorized slice under
  `LEGAL_PRIVACY_DECISION_REQUIRED`; this migration only proves the guard
  exists and rejects ordinary mutation.
- Apply with the Drizzle migrator from a deployment boundary that supplies an
  explicit database URL. Importing the database package does not open a
  connection.
- Validate against a disposable PostgreSQL database with
  `TEST_DATABASE_URL=<local-test-url> pnpm --filter @fitness-os/database test:integration`.

## Recovery

Applied migrations are immutable. If deployment fails before a migration is
recorded, inspect PostgreSQL transaction state and rerun only after the cause
is fixed. If the migration has been recorded, leave it unchanged and use a new
forward corrective migration.

Do not drop or truncate a privacy ledger table unless every row is proven
synthetic/disposable in a non-production environment. If any row exists or
its provenance is uncertain, preserve the table, verify the environment's
backup, and roll forward with a new migration rather than editing history.

`privacy-migration-recovery.integration.test.ts` exercises two destructive
scenarios against real disposable PostgreSQL:

1. A direct `UPDATE` and `DELETE` against an already-appended
   `privacy_audit_event` row are both rejected by the `0006` append-only
   guard trigger, and the row is proven unchanged afterward. This is the
   evidence that "fixing" a mistaken ledger entry cannot be done by mutating
   history — only a new forward-correcting row or migration is available,
   matching the append-only design intent.
2. A transaction that creates a new table and then attempts to insert a
   `privacy_audit_event` row violating `privacy_audit_event_reason_code_denied_check`
   is fully rolled back: the partially created table does not exist
   afterward, the pre-existing audit-event count is unchanged, and unrelated
   sentinel data in a separate schema survives untouched. This is bounded
   disposable-database evidence; it does not claim a production backup
   provider, retention policy, or restore rehearsal, and it does not exercise
   the restricted lifecycle DML path, which remains gated on
   `LEGAL_PRIVACY_DECISION_REQUIRED`.

## Drift check

```sh
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
  pnpm --filter @fitness-os/database db:check
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
  pnpm --filter @fitness-os/database db:generate
```

`db:check` must pass and `db:generate` must report no schema changes. A new
SQL file or metadata change is drift and must be reviewed rather than
discarded or silently rewritten.

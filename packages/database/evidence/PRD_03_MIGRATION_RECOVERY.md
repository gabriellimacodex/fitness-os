# PRD 03 migration and recovery evidence

## Migration

- Immutable migration: `drizzle/0001_prd03_exercise_catalog.sql`
- Scope: catalog operation ledger, exercise catalog tables, taxonomy seeds, and
  related constraints/indexes only. PRD 02 tables are unchanged.
- Option A: every committed `catalog_operation` row stores
  `result_integrity_key_id` and `result_integrity_digest` from the ledger key
  ring. The presentation cursor secret is not used.
- Readiness proves required migration content hashes are a **subset** of the
  Drizzle journal and that modality/equipment dimension seeds exist. Extra
  later journal rows do not fail readiness by count.
- Apply with the Drizzle migrator from a deployment boundary that supplies an
  explicit database URL. Importing the database package does not open a
  connection.
- Validate against a disposable PostgreSQL database with
  `TEST_DATABASE_URL=<local-test-url> pnpm --filter @fitness-os/database test:integration`.

## Recovery

Applied migrations are immutable. If deployment fails before this migration is
recorded, inspect PostgreSQL transaction state and rerun only after the cause is
fixed. If the migration has been recorded, leave it unchanged and use a new
forward corrective migration.

Do not drop catalog tables unless every table is proven empty in a
non-production environment. If any row exists or emptiness is uncertain,
preserve the tables, verify the environment's backup, and roll forward.

Lost ledger keys: missing active key or a historical `keyId` still cited by a
retained result keeps readiness false (`ledger_key_ring` /
`missing_ledger_key`). Rotate by adding a new active key and retaining retired
verifiers; do not rewrite committed rows.

## Drift check

```sh
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
  pnpm --filter @fitness-os/database db:check
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
  pnpm --filter @fitness-os/database db:generate
```

`db:check` must pass. Hand-maintained seed rows and the deferred
`exercise.current_revision_id` foreign key are intentional migration content;
do not regenerate them away without review.

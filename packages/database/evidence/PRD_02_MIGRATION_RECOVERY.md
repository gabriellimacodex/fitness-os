# PRD 02 migration and recovery evidence

## Migration

- Immutable migration: `drizzle/0000_flippant_rick_jones.sql`
- Scope: `students`, `coaches`, and `student_coach_links` only.
- Apply with the Drizzle migrator from a deployment boundary that supplies an
  explicit database URL. Importing the database package does not read an
  environment variable or open a connection.
- Validate against a disposable PostgreSQL database with
  `TEST_DATABASE_URL=<local-test-url> pnpm --filter @fitness-os/database test:integration`.

The integration suite resets only a loopback database named
`fitness_os_prd02_test`. It verifies clean apply, exact columns, foreign keys,
the temporal check, partial active-pair uniqueness, lookup indexes, repository
behavior, concurrency, and an already-applied no-replay result.

## Recovery

Applied migrations are immutable. If deployment fails before this migration is
recorded, inspect PostgreSQL transaction state and rerun only after the cause is
fixed. If the migration has been recorded, leave it unchanged and use a new
forward corrective migration.

Do not drop the PRD 02 tables unless every table is proven empty in a
non-production environment. If any row exists or emptiness is uncertain,
preserve the tables, verify the environment's backup, and roll forward.

`migration.integration.test.ts` exercises a deliberate transactional failure.
It proves that a partially created object is rolled back, the pre-failure
student-coach row count is unchanged, and unrelated sentinel data in a separate
schema survives. This is bounded disposable-database evidence; it does not
claim a production backup provider, retention policy, or restore rehearsal.

## Drift check

Run both commands from a clean candidate:

```sh
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
  pnpm --filter @fitness-os/database db:check
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
  pnpm --filter @fitness-os/database db:generate
```

`db:check` must pass and `db:generate` must report no schema changes. A new SQL
file or metadata change is drift and must be reviewed rather than discarded or
silently rewritten.

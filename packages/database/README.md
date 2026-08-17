# `@fitness-os/database`

This package owns the Fitness OS PostgreSQL schema boundary, Drizzle Kit
configuration, migrations, and persistence adapters.

PRD 02 owns `students`, `coaches`, and `student_coach_links` and their
repositories. PRD 03 Option A adds the exercise catalog tables, the global
`catalog_operation` ledger with ledger-key integrity fields, taxonomy dimension
seeds, subset journal readiness, and recovery evidence. Neither PRD adds a
public route, production connection, or product authorization claim. The
presentation cursor secret is never used to sign ledger results.

`createStudentCoachDatabase(connectionString)` accepts an explicit connection
string and returns the database handle, repositories, and an explicit async
`close()` method. Importing this package does not read environment variables or
open a socket.

## Drizzle Kit

`DATABASE_URL` is read only when Drizzle Kit loads `drizzle.config.ts`; importing
`@fitness-os/database` does not read environment variables or open a connection.

From this package, a schema change can be generated with:

```sh
DATABASE_URL=postgresql://... pnpm db:generate
```

Do not commit a real database URL.

## Verification

PostgreSQL-specific behavior is tested only against a disposable PostgreSQL
database. The destructive reset guard accepts a loopback URL whose database name
is exactly `fitness_os_prd02_test`:

```sh
TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/fitness_os_prd02_test \
  pnpm test:integration
```

The suite validates clean migration apply, constraints, indexes, migration
replay, recovery isolation, typed repository outcomes, history rules, concurrent
create/end operations, catalog seeds, Option A ledger commit/replay, and subset
readiness. See `evidence/PRD_02_MIGRATION_RECOVERY.md` and
`evidence/PRD_03_MIGRATION_RECOVERY.md` for recovery boundaries and drift
commands.

# `@fitness-os/database`

This package owns the Fitness OS PostgreSQL schema boundary, Drizzle Kit
configuration, migrations, and persistence adapters.

PRD 02 adds only the `students`, `coaches`, and `student_coach_links` tables and
their narrowly scoped repositories. It adds no runtime application composition,
public route, production connection, credential, profile field, or authorization
claim. The adapter consumes the domain-owned repository ports; the domain package
does not depend on this package.

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
replay, recovery isolation, typed repository outcomes, history rules, and
concurrent create/end operations. See
`evidence/PRD_02_MIGRATION_RECOVERY.md` for the recovery boundary and drift
commands.

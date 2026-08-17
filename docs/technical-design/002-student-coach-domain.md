# Technical Design 002 — Student & Coach Domain

## Status and authority

- Status: Approved after independent Agent 90 pre-flight
- PRD: [PRD 02 — Student & Coach Domain](../prds/002-student-coach-domain.md)
- Approval basis: Detailed design for an `APPROVED` registry PRD under Autonomous Pilot V1
- Architecture: existing modular monolith, explicit contracts, and PostgreSQL/Drizzle persistence boundary

## Design summary

PRD 02 introduces a data-only product foundation. Shared Zod contracts are
frozen first. The domain package then owns persistence ports and invariants,
while the database package owns Drizzle schema, a single versioned migration,
and PostgreSQL adapters. No public route or web consumer is added.

```text
packages/schemas
  opaque IDs + record contracts
              │
              ↓
packages/domain
  invariants + repository ports
              │
              ↓ implemented by
packages/database
  Drizzle schema + PostgreSQL adapter + migration

apps/api / apps/web
  no PRD 02 product route or persistence consumer
```

The dependency arrow points from the adapter toward the domain-owned contract:
`packages/database` may depend on `packages/domain`; `packages/domain` must not
depend on `packages/database`, Drizzle, or a PostgreSQL driver.

## Contract model

### Executable schemas

`packages/schemas` adds strict schemas and inferred types:

| Symbol                                           | Contract purpose                                     |
| ------------------------------------------------ | ---------------------------------------------------- |
| `studentIdSchema`, `StudentId`                   | Opaque UUID identifying a student domain record      |
| `coachIdSchema`, `CoachId`                       | Opaque UUID identifying a coach domain record        |
| `studentCoachLinkIdSchema`, `StudentCoachLinkId` | Opaque UUID identifying one historical link interval |
| `studentRecordSchema`, `StudentRecord`           | Exact `{ id, createdAt }` student record             |
| `coachRecordSchema`, `CoachRecord`               | Exact `{ id, createdAt }` coach record               |
| `studentCoachLinkSchema`, `StudentCoachLink`     | Exact temporal association record                    |

All record schemas reject unknown keys. Each identifier uses UUIDv4 validation
plus its own Zod nominal brand (`StudentId`, `CoachId`, or
`StudentCoachLinkId`), so valid identifiers for different resource kinds remain
compile-time incompatible. Timestamps accept only canonical RFC
3339 strings normalized to UTC with millisecond precision, for example
`2026-08-16T12:34:56.789Z`. `endedAt` is nullable and, when present, must be
strictly later than `startedAt`.

Schema transforms do not generate IDs or timestamps. Generation is an
application/service concern and tests inject deterministic values. The contract
does not include names, contacts, account identifiers, role claims, profile
attributes, or derived display fields.

### Freeze sequence

1. API/Domain implements schema tests and schema exports.
2. Orchestrator reviews names and shapes, updates `docs/contracts`, and records
   the contracts as frozen in one coordinated contract commit.
3. Domain and database implementation branches rebase on that exact freeze.
4. Any later shape change is a contract change requiring coordinated consumers,
   providers, tests, and registry updates.

No dependent implementation begins from prose-only field definitions.

## Domain model

The domain package consumes the shared record types and adds behavior through
small functions and ports. Records remain plain immutable values; no stateful
entity framework is introduced.

Required invariants:

- identifiers and `createdAt`/`startedAt` are immutable;
- `endedAt` transitions once from `null` to a later UTC instant;
- an ended link cannot be reopened or ended again as a successful mutation;
- no domain operation deletes a record; and
- no function treats a link or identifier as authorization.

The domain also defines a distinct `CreateStudentCoachLink` input containing
only `id`, `studentId`, `coachId`, and `startedAt`. It has no `endedAt` field.
The repository produces a `StudentCoachLink` with `endedAt: null`; an ended
record can only result from the separate `end` transition.

The domain owns explicit result unions rather than leaking driver exceptions:

```ts
type CreateResult<T> = { status: 'created'; value: T } | { status: 'conflict' };

type CreateLinkResult =
  | { status: 'created'; value: StudentCoachLink }
  | { status: 'conflict' }
  | {
      status: 'missing_references';
      missing: readonly ('student' | 'coach')[];
    };

type EndLinkResult =
  | { status: 'ended'; value: StudentCoachLink }
  | { status: 'not_found' }
  | { status: 'already_ended' }
  | { status: 'invalid_interval' };
```

Repository ports are limited to current acceptance needs:

```ts
interface StudentRepository {
  create(record: StudentRecord): Promise<CreateResult<StudentRecord>>;
  findById(id: StudentId): Promise<StudentRecord | null>;
}

interface CoachRepository {
  create(record: CoachRecord): Promise<CreateResult<CoachRecord>>;
  findById(id: CoachId): Promise<CoachRecord | null>;
}

interface StudentCoachLinkRepository {
  create(input: CreateStudentCoachLink): Promise<CreateLinkResult>;
  findById(id: StudentCoachLinkId): Promise<StudentCoachLink | null>;
  findActive(
    studentId: StudentId,
    coachId: CoachId,
  ): Promise<StudentCoachLink | null>;
  end(id: StudentCoachLinkId, endedAt: string): Promise<EndLinkResult>;
}
```

These are internal TypeScript contracts, not HTTP or authorization APIs. The
implementation may split files for clarity but must not add generic repository,
unit-of-work, event-bus, or entity-base abstractions.

## Persistence schema

The Drizzle schema uses PostgreSQL `uuid` and `timestamptz` columns:

### `students`

| Column       | Type          | Constraints               |
| ------------ | ------------- | ------------------------- |
| `id`         | `uuid`        | primary key               |
| `created_at` | `timestamptz` | not null, application-set |

### `coaches`

| Column       | Type          | Constraints               |
| ------------ | ------------- | ------------------------- |
| `id`         | `uuid`        | primary key               |
| `created_at` | `timestamptz` | not null, application-set |

### `student_coach_links`

| Column       | Type          | Constraints                                        |
| ------------ | ------------- | -------------------------------------------------- |
| `id`         | `uuid`        | primary key                                        |
| `student_id` | `uuid`        | not null, foreign key to `students.id`             |
| `coach_id`   | `uuid`        | not null, foreign key to `coaches.id`              |
| `started_at` | `timestamptz` | not null, application-set                          |
| `ended_at`   | `timestamptz` | nullable; null or strictly later than `started_at` |

Both foreign keys use `ON DELETE RESTRICT`. The migration adds:

- a check constraint for `ended_at IS NULL OR ended_at > started_at`;
- a partial unique index on `(student_id, coach_id) WHERE ended_at IS NULL`;
- an index on `(student_id, started_at)`; and
- an index on `(coach_id, started_at)`.

The partial unique index prevents duplicate active links for the same exact
pair under concurrency without imposing unapproved global cardinality. The
adapter additionally serializes writes for the exact pair and rejects a new
`startedAt` unless it is strictly later than the latest prior `endedAt`; this
prevents overlapping history while historical rows remain queryable.

No `updated_at`, soft-delete flag, profile column, external identity, JSON
metadata, audit payload, or speculative tenant identifier is added. A future
approved PRD adds new columns through a new migration; it does not edit an
applied PRD 02 migration.

## Persistence adapter and connection lifecycle

`packages/database` implements the domain repositories with Drizzle and a
narrow PostgreSQL driver. A factory accepts an explicit connection string and
returns the database handle, repositories, and an explicit async close method.
Constructing domain values or importing `packages/schemas`/`packages/domain`
does not read environment variables or open a socket.

Environment access remains at executable composition boundaries:

- Drizzle Kit requires `DATABASE_URL` when its configuration is invoked.
- Integration tests receive a disposable test URL from their harness.
- No application bootstrap or production connection is added because PRD 02
  exposes no runtime route that consumes a repository.

The adapter uses parameterized Drizzle operations and converts database
timestamps to canonical contract strings. It maps only named, expected
constraint failures to typed domain results. Unexpected driver errors remain
unexpected internal failures and preserve their cause for internal diagnosis;
they are not flattened into false conflict/not-found outcomes.

Link creation starts a transaction and locks the referenced student row and
coach row in that fixed order. Those parent-row locks serialize all link
creation for the same exact pair without an extension or provider-specific
advisory-lock contract. The adapter deterministically reports missing parents
as a non-empty set ordered `student`, then `coach`. Once both parents exist, it
reads the pair's latest interval under the same transaction and returns
`conflict` when a row is active or when the proposed `startedAt` is not strictly
later than the latest `endedAt`. It then inserts with `ended_at = NULL`; the
partial unique index remains defense in depth for active-link races.

The link-ending operation locks the link row in a transaction. It returns
`not_found` when absent, `already_ended` when the locked row has an end, and
`invalid_interval` when the requested value is not strictly later than the
locked `started_at`. Only then does it update the still-active row and return
the result. The database check constraint remains defense in depth, but expected
classification never depends on which constraint PostgreSQL evaluates first.

Automatic write retries are not added. A retry policy without a public command
or idempotency contract would be speculative and could duplicate future work.

## Migration plan

One Data/Infrastructure owner generates and commits the migration and Drizzle
metadata after the executable contract freeze. Concurrent migration generation
is prohibited.

The migration is additive and ordered:

1. create `students`;
2. create `coaches`;
3. create `student_coach_links` with foreign keys and temporal check; and
4. create the partial unique and lookup indexes.

Validation uses a clean disposable PostgreSQL database:

1. apply all committed migrations from zero;
2. verify the expected tables, columns, types, constraints, and indexes;
3. run repository integration tests for missing-parent precedence,
   non-overlapping pair history, ending classification, and concurrency;
4. run Drizzle schema/migration drift detection; and
5. apply the migration runner again to prove already-applied migrations are not replayed.

No seed or backfill exists because there are no prior product rows.

## Recovery and rollback

Before merge, recovery is a code/migration revert and recreation of the
disposable database. After an unapplied deployment artifact is withdrawn, no
database action is needed.

If the additive migration has been applied:

- first roll back application code to a version that ignores the new tables;
- do not edit the applied migration;
- if every PRD 02 table is proven empty in a non-production environment, a new
  explicit corrective migration may drop them in reverse dependency order; and
- if any table contains records or emptiness is uncertain, preserve the tables,
  take/verify a backup as required by the environment, and roll forward with a
  new migration. Automatic destructive rollback is prohibited.

Recovery evidence records the migration version, database environment,
row-count check, commands used, result, and responsible reviewer. This PRD does
not select a production backup provider or retention policy.

## Authorization boundary assumptions

PRD 02 introduces no authenticated actor, session, role claim, or public route.
The persistence layer cannot answer “may this caller access this student?”
because it receives no caller identity or policy context.

Future API work must satisfy all of these before returning or mutating a record:

1. authenticate a principal at the API boundary under an approved auth PRD;
2. resolve principal-to-domain-resource mapping under an approved identity/onboarding contract;
3. evaluate an explicit authorization policy in a backend service boundary;
4. treat link state as one policy input, never the complete proof; and
5. return only a separately frozen HTTP representation.

Until then, deny by absence: there is no client-reachable operation. Repository
methods are backend-only and must never be imported by web code. Database
foreign keys guarantee integrity, not authorization.

## Security and privacy design

- Random UUIDv4 values prevent sequential enumeration signals but remain private
  resource identifiers, not secrets.
- No direct identifier, credential, profile, body, health, or training field is stored.
- Timestamps are necessary for creation and immutable relationship history;
  no unrelated activity tracking is added.
- Query inputs pass through strict contract/domain validation and parameterized operations.
- Expected conflicts are mapped by known constraints; SQL text, connection
  strings, constraint names, and driver messages never become public payloads.
- Normal logs use operation name, outcome, duration, and existing correlation
  metadata. Record bodies and `DATABASE_URL` are excluded.
- Test data is generated and synthetic. Integration databases are disposable
  and isolated from developer or production data.
- Dependency review covers the selected PostgreSQL driver and any transitive
  production package addition.

Opaque IDs and association timestamps may still become personal data after a
future identity mapping. Privacy by default therefore applies from creation.
Consent, sharing, retention, deletion, residency, and data-subject rights are
not inferred here; PRD 21 must define them before dependent behavior requires them.

## Failure and concurrency behavior

| Failure or race                               | Required behavior                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Invalid boundary record                       | Reject before repository access                                           |
| Duplicate student, coach, or link ID          | Typed `conflict`; no existing row mutation                                |
| One or both missing parents for a new link    | Ordered `missing_references`; atomic failure; no orphan link              |
| Two concurrent active links for the same pair | Parent-row serialization; one success and one typed conflict              |
| Backdated or overlapping pair interval        | Typed conflict under the same serialized pair transaction                 |
| End time not later than start                 | `invalid_interval`; database check remains defense in depth               |
| End missing link                              | `not_found`; no mutation                                                  |
| End already-ended link                        | `already_ended`; original interval preserved                              |
| Database unavailable                          | Reject/throw internal dependency failure; do not claim conflict/not found |
| Unexpected SQL/driver failure                 | Preserve internal cause; redact at any later public boundary              |
| Migration partially fails                     | Deployment fails; inspect transaction state and recover before proceeding |
| Migration already applied                     | Runner reports no replay; schema remains unchanged                        |

The create operations use caller-generated stable random IDs from the trusted
service boundary. This enables a future command layer to define idempotency,
but PRD 02 does not claim that repeating a create after an ambiguous network
failure is idempotent.

## TDD and verification plan

### Contract tests

- accept canonical opaque IDs and UTC timestamps;
- prove the three nominal ID brands are not cross-assignable at compile time;
- reject malformed/non-UUID IDs, invalid timestamps, unknown keys, and hidden profile fields;
- accept active and correctly ended links;
- reject equal/reversed intervals and malformed nullability.

### Domain unit tests

- prove the one-way end transition and interval check;
- prove result unions are exhaustively handled;
- prove domain source has no prohibited database or framework dependency.

### PostgreSQL integration tests

- apply migrations from zero and inspect the schema;
- create and read each record with exact normalized output;
- reject missing foreign keys without orphan rows;
- return the fixed student-then-coach missing-reference set when both are absent;
- map duplicate primary keys and duplicate active pairs to conflict;
- create competing active links concurrently and prove exactly one succeeds;
- reject backdated or overlapping history after a prior interval ends;
- end a link once, distinguish second end from missing ID, and preserve timestamps;
- surface database unavailability and unexpected SQL errors as internal failures;
- rerun the migration runner without replay; and
- confirm schema/migration drift detection is clean.

The test harness provisions a disposable PostgreSQL database through existing
approved local/CI infrastructure or a narrowly justified ephemeral service. It
does not silently reuse a personal database, invent credentials, or replace
PostgreSQL-specific assertions with mocks.

### Repository gates

- formatting and lint;
- strict typecheck;
- unit and PostgreSQL integration tests;
- production package build and clean dist resolution;
- full repository check;
- migration validation and recovery evidence;
- dependency and secret scan; and
- Agent 90 plus independent QA/security review on the exact candidate SHA.

## Ownership and execution waves

### Wave 1 — contract freeze

Orchestrator coordinates the `packages/schemas` contract change and
`docs/contracts` registry update. API/Domain owns implementation and schema tests.

### Wave 2 — isolated implementation

- API/Domain owns domain invariants, ports, exports, and colocated unit tests.
- Data/Infrastructure exclusively owns Drizzle schema, migration, adapters, and
  colocated migration/repository tests.
- QA/Security reviews privacy, authorization assumptions, dependencies,
  migration safety, concurrency, and scope.

Wave 2 begins only after both branches are based on the frozen contract commit.

### Wave 3 — integration and Gate A

Orchestrator integrates the branches, runs clean-worktree gates, obtains Agent
90 and QA/security reviews, coordinates correction rounds, validates migration
and recovery evidence, updates required documentation, and records Gate A.

## Alternatives considered

- Public CRUD routes now: rejected because authentication, authorization,
  onboarding, and user workflows are later PRDs.
- Names or email fields: rejected as unnecessary PII and implicit identity design.
- One user/account table with a role enum: rejected because it invents auth and
  constrains whether a future person may hold multiple domain relationships.
- Treating an active link as authorization: rejected because data association
  is not caller identity or access policy.
- One coach per student: deferred because the approved outcome does not define
  that product cardinality.
- Deleting a link on removal: rejected because it destroys history and silently
  decides lifecycle policy.
- Event sourcing or a generic repository base: rejected as unearned complexity.
- In-memory or SQLite integration tests: rejected because they cannot prove
  PostgreSQL constraint, partial-index, timestamp, or concurrency behavior.
- Automatic down migration: rejected because destructive rollback can erase
  records and applied migrations are immutable.

## Known limitations and follow-on boundaries

- There is no client-visible capability; the foundation becomes useful through
  separately approved onboarding, privacy, and coach-workspace PRDs.
- A student–coach link does not grant access and cannot be used as a complete
  authorization decision.
- No retention or deletion behavior exists until PRD 21 defines it.
- No list/search query is provided; later PRDs add query contracts when a
  concrete workflow and authorization policy exist.
- The design validates against disposable PostgreSQL only; production
  deployment, backup provider, and credentials remain later operational work.
- Passing the plan establishes bounded evidence, not perfect security or
  freedom from future defects.

## Gate A evidence required

The integrated candidate must provide:

- exact reviewed commit SHA and clean CI;
- frozen executable contract and human registry consistency;
- Red → Green evidence for new behavior;
- unit and disposable-PostgreSQL integration results;
- migration-from-zero, drift, replay, and recovery evidence;
- dependency and secret review;
- architecture, scope, security/privacy, and authorization-boundary review;
- zero open `BLOCKER` and `HIGH` findings; and
- updated PRD, Technical Design, contract registry, migration documentation,
  and known limitations.

Gate B and Gate C are not required for this non-user-facing foundation. A
future capability using these records must satisfy its own applicable gates.

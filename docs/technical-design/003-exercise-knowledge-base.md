# Technical Design 003 — Exercise Knowledge Base

## Status and authority

- Status: Proposed for independent pre-flight review
- PRD: [PRD 03 — Exercise Knowledge Base](../prds/003-exercise-knowledge-base.md)
- Authority: Inherited Autonomous Pilot V1 approval for registered PRD 03
- Dependency: PRD 01 — `COMPLETED`
- Architecture: existing modular monolith, Fastify API boundary, PostgreSQL and
  Drizzle persistence, and Zod contract Source of Truth

## Design summary

PRD 03 adds one bounded catalog module. Public consumers receive validated,
read-only exercise knowledge through Fastify. Internal curation calls a domain
service that publishes immutable revisions through a repository port. Drizzle
implements that port without entering the domain package.

```text
packages/schemas (frozen catalog HTTP/data contracts)
            │
            ▼
apps/api read routes ──→ packages/domain catalog service/ports
                                  │
                                  ▼
                         packages/database Drizzle adapter
                                  │
                                  ▼
                              PostgreSQL

version-controlled curation input ──→ internal publish service

PRD 04 movement guidance ─────── future link by exercise ID only
PRD 05 training behavior ─────── future link by exercise revision ID only
PRD 15 assessed evidence ─────── future promotion of unassessed references
```

The catalog does not call PRD 04, PRD 05, or PRD 15 at runtime. Those future
capabilities may consume stable identifiers after their own authorization and
contract-freeze work.

## Design invariants

- Stable exercise identity is separate from revisioned display content.
- Published revisions, assignments, and reference associations are immutable.
- Current-state pointers and lifecycle state may change only in the same
  transaction as append-only lifecycle evidence.
- Keys are canonical, globally unique within their namespace, and never reused
  for another meaning.
- Public HTTP is read-only; no unauthenticated mutation route exists.
- Historical revision retrieval remains available after archive.
- Taxonomy is data with stable IDs, not a TypeScript enum that requires a schema
  release for every new term.
- Only the dimensions `modality` and `equipment` are established here.
- A reference locator is always `unassessed` in PRD 03 and has no recommendation
  or evidence-strength semantics.
- Remote locators are stored as inert text after parsing and are never fetched.
- Database failures affect readiness and fail through safe PRD 01 errors.

## Contract plan

### Freeze sequence

The Orchestrator coordinates the contract wave before API, domain, database, or
future consumer work begins:

1. Add strict Zod schemas and inferred types in `packages/schemas`.
2. Add schema tests for every valid variant and important invalid boundary.
3. Record provider, consumer, ownership, and `Frozen` status in
   `docs/contracts/README.md` without duplicating field definitions.
4. Commit the contract freeze.
5. Implement provider and consumer code only against the frozen symbols.

Names below are proposed responsibilities, not a parallel executable schema.
The contract owner may make surgical naming changes during freeze if all
provider, consumer, test, and registry references move together.

### Proposed shared contract groups

| Group               | Responsibility                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Identity            | Opaque UUID-based exercise, revision, taxonomy-dimension, taxonomy-term, and reference identifiers           |
| Lifecycle           | Active and archived catalog states; active, archived, and replaced taxonomy-term states                      |
| Taxonomy            | Stable dimension/term identity and immutable display semantics                                               |
| Provenance          | Curated origin kind, recorded timestamp, bounded change reason, and associated reference IDs                 |
| Reference candidate | DOI or HTTPS locator, provenance/evidence-candidate purpose, and literal `unassessed` assessment             |
| Exercise summary    | Stable exercise identity, current revision number, current name, lifecycle, and compact taxonomy assignments |
| Exercise detail     | Summary plus aliases, neutral description, provenance, references, and immutable revision identity           |
| Historical revision | Exact published revision and the taxonomy/reference associations frozen with it                              |
| Collection          | Opaque cursor, bounded page size, active-only default, items, and next cursor                                |
| Queries             | Strict IDs, positive revision number, optional repeated taxonomy-term filters, cursor, and bounded limit     |

All objects are strict. Free text is normalized to Unicode NFC, trimmed, and
bounded. Canonical keys use lowercase ASCII letters, digits, and hyphens with a
fixed maximum length. Schemas reject unknown fields, empty aliases, duplicate
normalized aliases, unsupported locator schemes, and non-literal assessment
states.

### HTTP surface

| Method and path                                  | Behavior                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /exercises`                                 | Returns active current summaries ordered by immutable exercise ID with an opaque cursor; optional taxonomy-term filters use AND semantics |
| `GET /exercises/:exerciseId`                     | Returns the current published detail, including explicit archived state when directly addressed                                           |
| `GET /exercises/:exerciseId/revisions/:revision` | Returns the exact published historical revision even when the exercise or assigned terms are archived                                     |
| `GET /exercise-taxonomy`                         | Returns the two dimensions, active terms, and archived/replacement metadata needed to interpret returned revisions                        |

Default page size is 25 and the maximum is 100. Cursor contents are an
implementation detail, authenticated only for structural integrity rather than
treated as authorization, and decoded through the executable query schema.
Ordering by immutable exercise ID prevents a name change from duplicating or
skipping rows during traversal.

There are no `POST`, `PUT`, `PATCH`, or `DELETE` catalog routes. The routes reuse
the PRD 01 platform envelope:

- malformed queries and parameters → HTTP 400 / `BAD_REQUEST`;
- unknown or unpublished resources → HTTP 404 / `NOT_FOUND`;
- unavailable catalog storage → HTTP 503 / `SERVICE_UNAVAILABLE`; and
- corrupt data or unexpected failures → HTTP 500 / `INTERNAL_ERROR`.

Every response retains the server-generated `x-request-id`. Public errors never
include SQL, connection values, raw validation details, source locators, or
exception messages.

## Domain model

### Exercise identity and revisions

`Exercise` is the stable aggregate root. Its identity and canonical key never
change. The aggregate holds current lifecycle state and the identifier/number
of its current published revision.

`ExerciseRevision` is immutable after insertion and contains:

- its own opaque ID, parent exercise ID, and positive sequential number;
- normalized display name, aliases, and a short neutral catalog description;
- immutable taxonomy-term assignments;
- required provenance and a deterministic content hash;
- zero or more immutable reference-candidate associations; and
- publication timestamp.

The description identifies catalog subject matter only. It cannot contain
execution steps, prescriptive cues, injury guidance, dosage, progression, or a
scientific conclusion.

### Taxonomy

`TaxonomyDimension` and `TaxonomyTerm` have opaque IDs and immutable canonical
keys. The initial dimension keys are:

- `modality` — one broad catalog modality per published revision; and
- `equipment` — zero or more equipment classifications per revision.

Terms are curated data and are not hard-coded as closed TypeScript enums.
Production terms are supplied through a separately reviewed,
version-controlled manifest. The implementation may use clearly synthetic terms
in tests, but it may not represent fixtures as production knowledge.

A term's key, dimension, label, and meaning do not change in place. A semantic
correction creates a new term with `replacesTermId`, then archives the old term.
Archived terms cannot be assigned to a new revision but remain resolvable for
historical revisions. Keys from archived/replaced terms remain reserved.

### Provenance and reference readiness

Every revision has required provenance:

- origin kind: internally curated or derived from a recorded public locator;
- bounded change reason;
- recorded timestamp; and
- zero or more associated reference-candidate IDs.

A reference candidate stores only:

- an opaque ID;
- `doi` or `https_url` kind;
- a normalized locator;
- purpose `provenance` or `evidence_candidate`; and
- assessment fixed to `unassessed`.

Syntax validation proves neither existence nor accuracy. PRD 03 does not fetch,
quote, summarize, grade, recommend from, or label a candidate verified. PRD 15
may later create its own versioned assessed evidence entity that points back to
the candidate; it must not mutate PRD 03 history or reinterpret `unassessed`.

### Internal curation boundary

No curation method is registered as an HTTP route. An internal
`ExerciseCatalogService` exposes narrowly typed operations to trusted
composition code and tests:

- publish an initial or next revision;
- archive or reactivate an exercise;
- create a taxonomy term;
- replace/archive a taxonomy term; and
- resolve current or historical catalog records.

Each mutation accepts an opaque operation ID. Publication also accepts an
expected current revision and a content hash derived from the canonical input.
The service performs validation before opening a transaction and rechecks
database-owned invariants inside it.

The same operation ID and hash returns the committed result. Reusing an
operation ID with different input is a conflict and makes no change. A stale
expected revision is a conflict. These internal conflicts are typed domain
results, not new public platform error codes.

There is deliberately no actor/user ID because PRD 03 has no dependency on an
identity or authorization capability. The operation ID, manifest/change reason,
timestamp, and lifecycle events provide bounded operational traceability.
Authenticated human authoring and actor attribution require later approved
scope rather than an invented identity contract.

## Persistence design

One Data/Infrastructure owner creates one migration and its metadata. Proposed
tables are:

| Table                             | Purpose and material constraints                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exercise`                        | Stable UUID, immutable unique canonical key, lifecycle state, current revision ID/number, timestamps; no hard-delete repository method                                             |
| `exercise_revision`               | UUID, exercise FK, positive revision number, normalized content, provenance, content hash, publication operation ID, published timestamp; unique exercise/version and operation ID |
| `taxonomy_dimension`              | Stable UUID and immutable unique key; only `modality` and `equipment` seeded by this capability                                                                                    |
| `taxonomy_term`                   | Stable UUID, dimension FK, immutable unique key within dimension, label/meaning, lifecycle, optional replacement FK, timestamps                                                    |
| `exercise_revision_taxonomy_term` | Immutable revision/term association; composite uniqueness and dimension checks enforced by service plus integration tests                                                          |
| `exercise_reference_candidate`    | Stable UUID, kind, normalized locator, purpose, literal unassessed state, unique kind/locator/purpose                                                                              |
| `exercise_revision_reference`     | Immutable revision/reference association with composite uniqueness                                                                                                                 |
| `exercise_lifecycle_event`        | Append-only operation ID, exercise ID, event kind, bounded reason, previous/next state, timestamp                                                                                  |
| `taxonomy_lifecycle_event`        | Append-only operation ID, term ID, event kind, bounded reason, previous/next state, timestamp                                                                                      |

Database constraints enforce foreign keys, uniqueness, positive revision
numbers, permitted lifecycle/reference literals, nonempty bounded values where
practical, and replacement terms in the same dimension. Domain validation owns
cross-row rules that PostgreSQL cannot express safely as a simple constraint,
and integration tests prove them against a real PostgreSQL instance.

Indexes support:

- exercise key and immutable-ID lookup;
- active exercise cursor traversal;
- exercise/revision lookup;
- active term lookup by dimension;
- revision assignment joins; and
- operation-ID idempotency lookup.

No generic repository framework, search engine, cache, queue, or external
catalog service is introduced.

## Transaction and concurrency behavior

### Publish revision

1. Parse the internal command through the domain input contract.
2. Compute or verify the canonical content hash.
3. Begin a transaction and resolve an existing operation ID.
4. Lock the stable exercise row, or insert the first aggregate under the unique
   canonical-key constraint.
5. Compare the expected current revision.
6. Resolve taxonomy terms and reject archived, missing, or wrong-dimension
   assignments; require exactly one modality.
7. Validate and resolve inert reference candidates without network access.
8. Insert the immutable revision and associations.
9. Update the current revision pointer and append a lifecycle publication event.
10. Commit and validate the result through the executable output schema.

Any error rolls back the revision, associations, current pointer, and event.
Unique constraints resolve races that pass prechecks. A retry with the same
operation ID returns the existing row only after matching its content hash.

### Archive and reactivate

Archive/reactivate locks the exercise, treats an already-reached target state
as an idempotent success for the same operation, changes lifecycle state, and
appends one event in the same transaction. It never modifies the current
revision or deletes any row. Default list queries filter to active state; direct
and historical reads do not.

Taxonomy archive/replacement follows the same transaction pattern. A term may
be archived while historical revisions reference it. New publication cannot
assign it. Reactivation is allowed only for the same unchanged semantics;
semantic correction uses replacement instead.

## API and database composition

The API receives an `ExerciseKnowledgeReader` port and readiness dependency at
composition. Route handlers contain HTTP translation only and never import
Drizzle. Domain services contain rules and never import Fastify or database
packages. The database package implements repository/reader ports and maps rows
to domain values before an HTTP response is built.

PRD 03 replaces the default in-process readiness assumption in production
composition with a bounded catalog database check that verifies connectivity
and required migration availability. Only explicit success returns ready.
Failure returns the existing not-ready contract and logs safe internal context;
the public response contains no dependency name or connection detail.

## Migration, deployment, and recovery

### Forward plan

1. Create a single new immutable migration owned by one assigned data task.
2. Create tables in dependency order, then constraints and indexes.
3. Seed only the two taxonomy dimensions with stable predetermined IDs/keys.
4. Apply against an empty disposable PostgreSQL database in CI.
5. Verify table, constraint, index, seed, and migration-journal state exactly.
6. Run repository and route integration tests against the migrated database.
7. Apply in a production-like environment before enabling catalog routes.
8. Confirm readiness and read-only smoke behavior without logging credentials.

The migration contains no exercise facts, movement guidance, citations, paid
source content, or synthetic fixtures. A later production catalog manifest is
ingested only through the reviewed internal service and is not a schema
migration.

### Rollback and recovery

- Before first catalog data or downstream references exist, rollback may drop
  only the PRD 03 tables after verifying they contain no non-seed rows and after
  preserving migration evidence.
- Once catalog data, published revisions, or downstream references exist, a
  destructive down migration is prohibited. Recovery uses a new forward
  migration or restoration from the pre-deployment backup.
- An applied migration is never edited. A defect receives a new migration.
- Deployment captures a database backup or restorable snapshot before apply,
  records the exact migration SHA, and verifies row counts and constraints
  afterward.
- Partial apply or failed validation leaves routes disabled/not-ready until a
  forward fix or verified restore completes.
- Internal manifest ingestion is independently retryable by operation ID and
  does not require rolling back schema migration.

Migration tests must exercise clean apply, repeat deployment behavior, a
deliberate failure, schema verification, non-destructive recovery rules, and a
restore/forward-fix rehearsal appropriate to the test environment.

## Failure and observability design

| Failure                       | Required behavior                                          |
| ----------------------------- | ---------------------------------------------------------- |
| Invalid route input           | 400 safe platform envelope; no handler execution           |
| Missing/unpublished resource  | 404 safe envelope without disclosing draft/internal state  |
| Archived exercise in list     | Omitted; direct lookup remains explicit and stable         |
| Database unavailable          | Readiness not-ready; read request 503 safe envelope        |
| Stale concurrent publication  | Typed internal conflict; transaction rollback              |
| Identical publication retry   | Existing result returned; no duplicate rows/events         |
| Operation-ID/content mismatch | Typed internal conflict; no mutation                       |
| Invalid taxonomy assignment   | Reject before commit; no partial revision                  |
| Invalid reference locator     | Reject locally; never issue a network request              |
| Corrupt row/schema mismatch   | Log correlated internal error; 500 safe envelope           |
| Migration mismatch            | Startup/deployment fails closed; routes remain unavailable |

Structured internal logs use request ID for HTTP reads and operation ID plus
stable entity IDs for curation. They record outcome categories, duration, and
error class, not raw descriptions, locators, SQL, credentials, or public-facing
exception text. PRD 23 may later add pilot observability; PRD 03 adds no external
telemetry provider.

## Security and privacy review points

- Verify no public mutation route or Fastify-to-database shortcut exists.
- Verify the web package has no database/domain import and receives only shared
  contracts through Fastify.
- Verify unknown fields, overlong text, cursor tampering, alias floods, and
  repeated filters are bounded and rejected safely.
- Verify stored catalog text cannot become executable HTML or log injection.
- Verify DOI/HTTPS values are never fetched, redirected, previewed, or treated
  as trusted links by the API.
- Verify `unassessed` is the only PRD 03 assessment state and cannot influence a
  recommendation or safety decision.
- Verify archived/historical data cannot be hard-deleted through supported
  services and keys cannot be reused.
- Verify database errors and readiness never expose credentials, hosts, SQL,
  schema internals, or stack traces.
- Verify migrations and seed dimensions contain no secret, personal data,
  licensed source content, invented citation, movement guidance, or training
  prescription.

## TDD and verification strategy

Every behavior follows observable Red → minimal Green → refactor evidence.

### Contract tests

- accept every intended identifier, lifecycle, taxonomy, provenance, reference,
  list/detail/revision, and pagination variant;
- reject unknown fields, malformed IDs/cursors, invalid bounds, duplicate
  aliases, unsupported schemes, HTML-like overlong input, and any assessment
  other than `unassessed`; and
- provider responses and API consumer fixtures parse through shared schemas.

### Domain tests

- first and next publication, immutable older revision, stale expected revision,
  same-operation retry, operation/content mismatch, and canonical-key race;
- exact one-modality rule, equipment multiplicity, archived/missing/wrong-
  dimension terms, replacement semantics, and key non-reuse;
- archive/reactivate idempotency and append-only lifecycle events; and
- reference syntax, no evidence grading, no remote-fetch port, and provenance
  requirements.

### Persistence and migration tests

- clean apply against PostgreSQL, exact constraints/indexes/seeds, and migration
  journal;
- transaction rollback on each material failure point;
- uniqueness and concurrent publication behavior;
- historical reads after exercise and term archive;
- clean database unavailability and corrupt-row mapping; and
- backup/restore or forward-fix recovery rehearsal with destructive rollback
  protection once non-seed data exists.

### API integration tests

- active list and opaque cursor boundaries, taxonomy AND filters, detail,
  archived direct lookup, historical revision, and taxonomy discovery;
- invalid request, unknown resource, unsupported method, unavailable database,
  and corrupted provider result;
- every success parses through the frozen schema; and
- every response retains server request correlation and content-safe errors.

No live external provider, paid data source, remote citation fetch, student
account, movement asset, or UI is required. Tests use synthetic catalog content
that is visibly marked as fixture data.

## Delivery waves and ownership

1. **Pre-flight** — Agent 90 challenges scope, taxonomy/evidence boundaries,
   migration safety, and contract overlap.
2. **Contract freeze** — API/Domain owns `packages/schemas` tests and the
   Orchestrator coordinates `docs/contracts`.
3. **Domain and data** — API/Domain implements rules/ports while one
   Data/Infrastructure task owns schema, migration, adapter, and database tests.
4. **API integration** — API/Domain adds read routes and database-backed
   readiness after frozen contracts and reader port are available.
5. **QA and correction** — integration, migration/recovery, security,
   architecture, scope, Agent 90, exact-head CI, and Gate A.

PRD 04 may run concurrently only with separate ownership and no modification of
PRD 03 contracts. Any proposed shared exercise/movement field is a coordinated
contract decision, not an implicit dependency.

## Alternatives considered

- **Exercise name as identity:** rejected because names and aliases change and
  would corrupt downstream history.
- **Mutable current row only:** rejected because PRD 05 and PRD 15 need stable
  historical meaning and Product Principles prohibit silent historical change.
- **Closed taxonomy enums:** rejected because every vocabulary addition would
  force a schema release and encourage catch-all meanings.
- **Movement-pattern and muscle taxonomy now:** deferred to avoid inventing
  biomechanics or creating a hidden PRD 04 dependency.
- **Public CRUD before authorization:** rejected because PRD 03 has no identity,
  role, or admin-workflow dependency.
- **External catalog or citation provider:** rejected because current scope
  requires no provider, credential, cost, scraping, or licensing decision.
- **Treating URLs/DOIs as verified evidence:** rejected under PP-08; locators are
  inert and unassessed until PRD 15 performs authorized appraisal.
- **Storing catalog content only in source files:** rejected because downstream
  runtime consumers require transactionally versioned, queryable identity and
  lifecycle behavior.
- **Microservice, event bus, search index, or generic repository framework:**
  rejected as unearned complexity.

## Known limitations

- The public catalog may initially be empty or minimally populated; this design
  validates governed capability and does not invent a comprehensive catalog.
- No authenticated curation UI or actor identity exists. Curation remains an
  internal reviewed operation with operation-level traceability.
- Modality and equipment are deliberately narrow. Movement patterns, muscles,
  body regions, technique, safety, localization, and ranking require later
  authorized contract work.
- Syntax-valid reference locators may still be inaccurate, unavailable, or
  irrelevant. They remain unassessed and cannot support product claims.
- ID-ordered cursor pagination is deterministic but not a user-facing relevance
  order.
- This design reduces known consistency and evidence-integrity risks; it does
  not prove scientific validity, catalog completeness, or absence of defects.

## Gate A evidence required

- Exact candidate SHA and clean diff against the intended base.
- Frozen contract commit and consistent provider, consumer, tests, and human
  registry.
- TDD evidence and green lint, formatting, typecheck, unit/integration tests,
  production build, repository check, and exact-head CI.
- PostgreSQL migration apply, constraints, concurrency, recovery, and
  non-destructive rollback evidence.
- Architecture pass for modular-monolith, package, dist-first, and Fastify
  boundaries.
- Security/privacy pass for read-only public scope, safe errors, inert
  references, no secrets, and no personal data.
- Scope pass proving no PRD 04 movement guidance, PRD 05 training behavior,
  PRD 15 evidence appraisal, public authoring, UI, provider, or paid-source work.
- Independent Agent 90 and QA/security reports with every finding and deferral
  visible, zero known `BLOCKER`/`HIGH`, required documentation updated, and
  migration disposition `VALIDATED`.

Gate A passes only when every applicable check passes or is explicitly and
validly `NOT_APPLICABLE`. Passing PRD 03 does not authorize downstream PRDs or
change their dependency gates.

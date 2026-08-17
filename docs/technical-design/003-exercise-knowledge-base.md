# Technical Design 003 — Exercise Knowledge Base

## Status and authority

- Status: Approved after independent Agent 90 pre-flight
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

| Group               | Responsibility                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Identity            | Opaque UUID-based exercise, revision, taxonomy-dimension, taxonomy-term, and reference identifiers                           |
| Lifecycle           | Active and archived catalog states; active, archived, and replaced taxonomy-term states                                      |
| Taxonomy            | Stable dimension/term identity and immutable display semantics                                                               |
| Provenance          | Curated origin kind, recorded timestamp, bounded change reason, and associated reference IDs                                 |
| Reference candidate | DOI or HTTPS locator, provenance/evidence-candidate purpose, and literal `unassessed` assessment                             |
| Exercise summary    | Stable exercise identity, current revision number, current name, lifecycle, and compact taxonomy assignments                 |
| Exercise detail     | Summary plus aliases, neutral description, provenance, references, and immutable revision identity                           |
| Historical revision | Exact published revision and the taxonomy/reference associations frozen with it                                              |
| Collection          | Opaque cursor, bounded page size, items, and nullable next cursor for exercise and taxonomy pages                            |
| Queries             | Strict IDs, positive revision number, dimension/lifecycle filters, optional taxonomy-term filters, cursor, and bounded limit |

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
| `GET /exercise-taxonomy`                         | Returns a bounded page of terms for a required known dimension, with lifecycle and replacement metadata needed to interpret revisions     |

Exercise pages default to 25 items. Taxonomy pages default to 50 items. Both
have a maximum of 100. Taxonomy discovery requires `dimension=modality` or
`dimension=equipment`, accepts lifecycle `active` by default or explicit
`archived`/`all`, and orders by immutable `(dimensionId, termId)`. Exercise
pages order by immutable exercise ID. Cursor contents are an implementation
detail, authenticated only for structural integrity rather than treated as
authorization, and decoded through the executable query schema.

A valid query with no exercises or no matching terms returns HTTP 200 with
`items: []` and `nextCursor: null`. A known dimension with no terms is not an
error. Missing/unknown dimensions, invalid lifecycle values, out-of-range
limits, or malformed/mismatched cursors return the safe 400 contract. Archived
terms referenced by historical revisions remain available through the explicit
archived/all taxonomy filter; the endpoint never attempts an unbounded dump.

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

Terms are curated data and are not hard-coded as closed TypeScript enums. The
required production terms are supplied through the independently reviewed,
version-controlled manifest described below. The implementation may use clearly
synthetic terms in tests, but it may not represent fixtures as production
knowledge.

A term's key, dimension, label, and meaning do not change in place. A semantic
correction atomically creates an active target term, records a permanent
same-dimension replacement edge, and archives the source. Each term has at most
one predecessor and one successor: merges, splits, branching, self-replacement,
cross-dimension edges, cycles, and replacement by an archived/replaced target
are prohibited. Replacement chains therefore resolve to exactly one terminal
active term. Archived terms cannot be assigned to a new revision but remain
resolvable for historical revisions. Keys from archived/replaced terms remain
reserved. A replaced term cannot reactivate; only an independently archived,
semantically unchanged term with no replacement edge may reactivate.

### Provenance and reference readiness

Every revision has required provenance with exactly one permitted relational
combination:

- `internally_curated`: `primaryProvenanceReferenceId` is null; or
- `derived_from_public_locator`: `primaryProvenanceReferenceId` identifies one
  associated reference whose purpose is `provenance`.

Additional references with purpose `evidence_candidate` never satisfy derived
provenance. A nullable primary-reference foreign key plus database check and
composite relational constraint (or an equivalently strong deferred constraint
owned by the migration) makes the combination a database invariant, not only
an application convention. The service also validates it before insertion.
Recorded/publication timestamps are created by the injected trusted backend
clock after validation; manifests and callers do not contain or override them.
The bounded change reason is caller data, but server time and provenance linkage
are not.

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
`ExerciseCatalogService` exposes narrowly typed operations only to the isolated
deployment command and tests; `apps/api`, `apps/web`, and ordinary runtime
composition neither import nor register its mutation surface:

- publish an initial or next revision;
- archive or reactivate an exercise;
- create a taxonomy term;
- replace/archive a taxonomy term; and
- resolve current or historical catalog records.

Each mutation accepts an opaque operation UUID, while the invoked service method
supplies a fixed namespace such as `exercise.publish`, `exercise.lifecycle`,
`taxonomy.create`, `taxonomy.replace`, or `manifest.ingest`. Callers cannot
select the namespace. The global operation key is the namespace plus UUID.

After strict schema/domain validation, the service builds canonical semantic
input by applying Unicode NFC and whitespace rules, serializing fields in a
fixed schema order, representing null explicitly, omitting no required field,
sorting aliases by normalized value, sorting taxonomy IDs bytewise, and sorting
references by `(kind, canonicalLocator, purpose)`. Server-generated IDs,
timestamps, operation keys, and previous database results are excluded. The
service computes SHA-256 over UTF-8 canonical JSON with a fixed canonicalization
version. No caller-supplied hash is accepted or compared as authoritative.

The operation digest covers every validated caller-controlled semantic and
guard input, including target key/ID, expected current revision, reason,
taxonomy assignments, references, and manifest ID/version where applicable.
The immutable revision content hash uses the same versioned canonicalizer over
the revision-content subset only. Both values are computed by the service after
validation; neither depends on object insertion order, database row order,
locale, server time, or generated identifiers.

The service opens a transaction and resolves the global ledger entry before any
domain write. The same global operation key and server-computed digest returns
the committed typed result. The same key with different canonical input is a
conflict and makes no change. A raw UUID reused in another namespace is a
different safe key. A stale expected revision is a conflict. These internal
conflicts are typed domain results, not new public platform error codes.

There is deliberately no product actor/user ID because PRD 03 has no dependency
on an identity or authorization capability. Production mutation authority is
operational instead: only an authorized deployment operator may run the
restricted ingestion job with its environment-managed database secret. The
deployment system records the operator/job identity, exact artifact SHA,
operation ID, outcome, and time without copying credentials into catalog data.
Repository access or the ability to call public Fastify routes grants no such
authority. Authenticated product authoring and catalog actor attribution require
later approved scope rather than an invented identity contract.

### Production manifest and one-shot ingestion

PRD 03 completion requires one non-empty `catalog-manifest.v1` artifact in
version control. Its strict executable schema requires:

- a stable manifest ID and schema version;
- at least one active modality term and one active equipment term;
- at least one publishable exercise with exactly one modality assignment;
- canonical keys, plain neutral content, provenance input, and optional inert
  unassessed references; and
- no caller timestamps, generated IDs, content hashes, technique/safety
  guidance, evidence grades, remote payloads, or synthetic fixture markers.

An independent reviewer approves the exact manifest commit and records its path,
schema version, canonical digest, and source commit before execution. The build
packages that immutable manifest and review record into a dedicated deployment
artifact; the one-shot command is excluded from API/web registration and the
ordinary application runtime image. Only the restricted deployment
migration/ingestion job exposes it.

Before any database access, the command verifies that the packaged manifest's
path, schema version, source commit, and recomputed canonical digest exactly
match the approved record and that the reviewed source commit is an ancestor of
the candidate build SHA. Dirty, untracked, substituted, or mismatched content
fails closed. The command then parses the entire artifact through its Zod
schema, resolves all cross-record invariants in memory, and only then begins one
database transaction under `manifest.ingest:<operationUuid>`. It uses the
trusted server clock and server-generated entity IDs, writes all terms,
references, exercises, revisions, associations, lifecycle events, and the
global ledger result atomically, then exits. There is no watcher, recurring
sync, remote import, public invocation, or partial-record fallback.

Exact completion evidence records the manifest path and Git commit, schema
version, independently reviewed disposition, server-computed digest and
canonicalization version, validated counts by entity type, created stable IDs
and revision numbers, database and ledger row counts before/after, transaction
result, and an identical second invocation showing the same result with zero
row changes. It also records the deployment job identity, redacted operator
identity, candidate artifact SHA, proof that no API/runtime import or route can
invoke the command, and a deliberate reviewed-artifact mismatch rejected before
database access. A deliberately invalid manifest proves zero catalog or ledger
rows survive failure.

## Persistence design

One Data/Infrastructure owner creates one migration and its metadata. Proposed
tables are:

| Table                             | Purpose and material constraints                                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exercise`                        | Stable UUID, immutable unique canonical key, lifecycle state, current revision ID/number, timestamps; no hard-delete repository method                                                                                 |
| `catalog_operation`               | Global namespaced operation key, operation kind, canonicalization version, server-computed SHA-256 input digest, status, typed-result locator, server timestamps; one authoritative idempotency ledger                 |
| `exercise_revision`               | UUID, exercise FK, positive revision number, normalized content, origin kind, nullable primary provenance-reference FK, server-owned content hash/timestamps, operation-ledger FK; unique exercise/version             |
| `taxonomy_dimension`              | Stable UUID and immutable unique key; only `modality` and `equipment` seeded by this capability                                                                                                                        |
| `taxonomy_term`                   | Stable UUID, dimension FK, immutable unique key within dimension, label/meaning, lifecycle, optional permanent successor FK, operation-ledger FK, timestamps; same-dimension one-to-one acyclic replacement invariants |
| `exercise_revision_taxonomy_term` | Immutable revision/term association; composite uniqueness and dimension checks enforced by service plus integration tests                                                                                              |
| `exercise_reference_candidate`    | Stable UUID, kind, normalized locator, purpose, literal unassessed state, unique kind/locator/purpose                                                                                                                  |
| `exercise_revision_reference`     | Immutable revision/reference/purpose association with composite uniqueness; supports the deferred primary-provenance relation                                                                                          |
| `exercise_lifecycle_event`        | Append-only operation-ledger FK, exercise ID, event kind, bounded reason, previous/next state, server timestamp                                                                                                        |
| `taxonomy_lifecycle_event`        | Append-only operation-ledger FK, term ID, event kind, bounded reason, previous/next state, server timestamp                                                                                                            |

Database constraints enforce foreign keys, uniqueness, positive revision
numbers, permitted lifecycle/reference literals, nonempty bounded values where
practical, exact origin/reference combinations, and replacement terms in the
same dimension. Named uniqueness plus deferred/composite constraints or a
constraint trigger enforce primary provenance linkage and acyclic one-to-one
replacement integrity at commit. Domain validation rejects invalid input early;
PostgreSQL integration tests prove that bypassing the service still cannot
commit an invalid relational state.

Indexes support:

- exercise key and immutable-ID lookup;
- active exercise cursor traversal;
- exercise/revision lookup;
- active term lookup by dimension;
- revision assignment joins; and
- globally namespaced operation-ledger idempotency lookup.

No generic repository framework, search engine, cache, queue, or external
catalog service is introduced.

## Transaction and concurrency behavior

### Publish revision

1. Parse the internal command through the domain input contract.
2. Canonicalize semantic input with the fixed server algorithm and compute its
   SHA-256 digest; ignore no field and accept no caller hash.
3. Begin a transaction and resolve or insert the global namespaced operation
   ledger entry before any catalog row.
4. Lock the stable exercise row, or insert the first aggregate under the unique
   canonical-key constraint.
5. Compare the expected current revision.
6. Resolve taxonomy terms and reject archived, missing, or wrong-dimension
   assignments; require exactly one modality.
7. Validate and resolve inert reference candidates without network access, and
   enforce the exact origin/primary-provenance-reference combination.
8. Generate IDs and timestamps from trusted server dependencies, then insert
   the immutable revision and associations.
9. Update the current revision pointer and append a lifecycle publication event.
10. Commit and validate the result through the executable output schema.

Any error rolls back the revision, associations, current pointer, and event.
Unique constraints resolve races that pass prechecks. A retry with the same
global operation key returns the existing row only after the service recomputes
and matches the canonical digest and canonicalization version.

### Archive and reactivate

Archive/reactivate locks the exercise, treats an already-reached target state
as an idempotent success for the same operation, changes lifecycle state, and
appends one event in the same transaction. It never modifies the current
revision or deletes any row. Default list queries filter to active state; direct
and historical reads do not.

Taxonomy archive/replacement follows the same transaction and global-ledger
pattern. Replacement locks the source, proposed target, and existing adjacent
chain rows in stable ID order. It atomically verifies same dimension, active
target, no predecessor/successor conflict, no self-edge, and no path back to the
source before recording the single successor and archiving the source. A unique
predecessor constraint plus deferred acyclicity enforcement resolves concurrent
races. Historical references remain unchanged. A replaced term cannot
reactivate; only an independently archived term with no replacement edge may.

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
2. Create the global operation ledger and catalog tables in dependency order,
   then named relational constraints, deferred invariants, and indexes.
3. Seed only the two taxonomy dimensions with stable predetermined IDs/keys.
4. Apply against an empty disposable PostgreSQL database in CI.
5. Verify table, constraint, index, seed, and migration-journal state exactly.
6. Run repository and route integration tests against the migrated database.
7. Create unrelated sentinel schema/data, execute deliberate migration failure
   and forward correction paths, and prove the sentinel remains byte-for-byte
   present.
8. Apply in a production-like environment before enabling catalog routes.
9. Ingest the exact independently reviewed production manifest once and capture
   the required digest, IDs, counts, ledger, and no-change retry evidence.
10. Confirm readiness and read-only smoke behavior without logging credentials.

The migration contains no exercise facts, movement guidance, citations, paid
source content, or synthetic fixtures. The required production catalog manifest
is ingested only through the reviewed one-shot internal service and is not a
schema migration.

### Recovery

- After any migration has been applied, recovery is forward-fix-first. The
  applied file is never edited and routine recovery never drops PRD 03 tables,
  truncates the database, recreates the database, or restores an entire shared
  database merely because the catalog is empty.
- Before apply, the operator records the exact migration SHA, migration journal,
  catalog and unrelated row counts, a sentinel value in an unrelated table, and
  a verified restorable backup/snapshot appropriate to the environment.
- A defect receives a new additive corrective migration. Routes remain disabled
  or not-ready until the forward fix passes schema, invariant, manifest, and
  sentinel verification.
- Restore is a last resort only when a forward fix cannot safely recover. The
  recovery record must prove the restore boundary is catalog-only, or use an
  approved point-in-time/database recovery procedure that preserves unrelated
  tables and all newer unrelated writes. A stale whole-database restore that
  would erase unrelated data is prohibited.
- Before restore, preserve the failed database and migration evidence, inventory
  all writes since the backup, verify the restore target and checksum, and obtain
  the responsible recovery review. After restore, compare unrelated sentinel
  data and row counts, migration journal, catalog constraints, and any replayed
  writes before traffic resumes.
- Manifest ingestion failure needs no database restore: its catalog rows and
  ledger entry roll back in one transaction. An identical retry is resolved by
  the manifest operation key and server-computed digest.

Migration/recovery tests create unrelated sentinel schema/data before apply and
exercise clean apply, repeat deployment, deliberate partial failure, a new
forward corrective migration, and a safe restore rehearsal. Every phase asserts
the sentinel and unrelated row counts are unchanged. Exact evidence records the
commands, SHAs, migration-journal state, pre/post counts, sentinel digest,
backup/restore boundary, result, and responsible reviewer.

## Failure and observability design

| Failure                                 | Required behavior                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Invalid route input                     | 400 safe platform envelope; no handler execution                                    |
| Valid empty exercise/taxonomy query     | 200 with empty items and null cursor                                                |
| Missing/unpublished resource            | 404 safe envelope without disclosing draft/internal state                           |
| Archived exercise in list               | Omitted; direct lookup remains explicit and stable                                  |
| Database unavailable                    | Readiness not-ready; read request 503 safe envelope                                 |
| Stale concurrent publication            | Typed internal conflict; transaction rollback                                       |
| Identical namespaced retry              | Existing result returned after server digest match; no duplicate ledger/domain rows |
| Operation-key/input mismatch            | Typed internal conflict; no mutation                                                |
| Invalid provenance relation             | Reject before commit and through database constraint                                |
| Invalid/concurrent taxonomy replacement | Reject entire operation; preserve chain and history                                 |
| Invalid production manifest             | Reject before transaction, or roll back catalog and ledger atomically               |
| Invalid reference locator               | Reject locally; never issue a network request                                       |
| Corrupt row/schema mismatch             | Log correlated internal error; 500 safe envelope                                    |
| Migration mismatch                      | Startup/deployment fails closed; forward fix preserves unrelated data               |

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
- Verify origin kind, primary provenance reference, association purpose, and
  server-owned timestamps satisfy only the two permitted combinations even
  when writes bypass service validation.
- Verify archived/historical data cannot be hard-deleted through supported
  services and keys cannot be reused.
- Verify canonicalization is deterministic across input orderings and runtimes,
  hashes are server-owned, and every mutation resolves the global namespaced
  operation ledger before domain writes.
- Verify the production manifest is non-empty, independently reviewed,
  schema-valid, one-shot, atomic, deployment-operator-only, exactly matched to
  its reviewed source commit/digest, absent from runtime registration, and free
  of synthetic or out-of-scope content.
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
  same namespaced-operation retry, cross-namespace UUID reuse,
  operation/content mismatch, deterministic canonicalization under permuted
  equivalent input, rejection of caller hashes/timestamps, and canonical-key
  race;
- exact one-modality rule, equipment multiplicity, archived/missing/wrong-
  dimension terms, key non-reuse, and replacement rejection for self,
  cross-dimension, cycle, merge, split, second predecessor/successor,
  archived/replaced target, reactivation, and concurrent races;
- archive/reactivate idempotency and append-only lifecycle events; and
- reference syntax, no evidence grading, no remote-fetch port, exact
  origin/reference combinations, and trusted server-clock requirements.

### Persistence and migration tests

- clean apply against PostgreSQL, exact constraints/indexes/seeds, and migration
  journal;
- transaction rollback on each material failure point;
- uniqueness and concurrent publication behavior;
- database rejection of invalid primary provenance relations and taxonomy
  replacement chains when the service is bypassed;
- historical reads after exercise and term archive;
- clean database unavailability and corrupt-row mapping; and
- forward-fix-first and last-resort safe-restore rehearsals that preserve an
  unrelated sentinel table, row digest, and post-backup unrelated writes.

### Manifest ingestion tests

- reject an empty manifest, missing dimension vocabulary, synthetic markers,
  caller timestamps/hashes, invalid cross-references, and any out-of-scope
  movement/evidence field before mutation;
- ingest the exact schema-valid non-empty manifest atomically and record its
  server digest, entity IDs, revisions, counts, and global ledger result;
- rerun the same manifest operation and prove the same result with zero row
  changes; and
- inject a mid-transaction failure and prove zero catalog or ledger rows remain.

### API integration tests

- active list and opaque cursor boundaries, taxonomy AND filters, detail,
  archived direct lookup, historical revision, and bounded taxonomy discovery
  across active/archived/all pages;
- 200 empty exercise pages and known-dimension taxonomy pages with null cursor,
  plus 400 missing/unknown dimensions and mismatched/tampered cursors;
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
2. **Contract freeze** — the PRD 03 owner adds only its distinct exercise
   schema module/tests after PRD 02's contract addition. The Orchestrator alone
   integrates schema barrels and `docs/contracts`, then admits PRD 04's distinct
   movement contract files.
3. **Domain** — API/Domain owns only the PRD 03 exercise-catalog module files;
   the Orchestrator serializes the domain barrel with PRD 02 and PRD 04.
4. **Data** — after the PRD 02 migration is merged, one global
   Data/Infrastructure owner rebases on that exact main head and exclusively
   owns the PRD 03 schema, migration, Drizzle metadata, adapter, and database
   tests. No other migration generation or metadata edit runs concurrently.
5. **API integration** — API/Domain adds only the distinct exercise route
   module/tests after frozen contracts and reader port exist. The Orchestrator
   alone serializes readiness, application registration, and shared API tests
   with PRD 04.
6. **QA and correction** — integration, migration/recovery, security,
   architecture, scope, Agent 90, exact-head CI, and Gate A.

The Master Execution Plan's Wave 2 schedule is authoritative. PRD 04 may overlap
only in its listed disjoint files; any proposed shared exercise/movement field
is a coordinated contract decision, not an implicit dependency.

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

- The public catalog is non-empty at completion but deliberately small. The
  reviewed production manifest proves governed ingestion, not comprehensive
  exercise coverage or scientific validity.
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
  forward-fix-first/safe-restore evidence preserving unrelated sentinel data.
- Exact non-empty production-manifest review and one-shot ingestion evidence,
  including canonical digest, entity IDs/counts, ledger result, atomic failure,
  identical no-change retry, restricted deployment-job/operator evidence,
  reviewed-artifact verification, and absence from API/runtime registration.
- Deterministic server canonicalization/hash and global namespaced operation
  ledger tests for every mutation family.
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

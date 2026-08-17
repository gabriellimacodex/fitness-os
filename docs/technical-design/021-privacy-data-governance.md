# Technical Design 021 — Privacy & Data Governance

## Status and authority

- Status: Draft — independent Agent 90 review required before contract freeze
- PRD: [PRD 21 — Privacy & Data Governance](../prds/021-privacy-data-governance.md)
- Authority: Inherited Autonomous Pilot V1 approval for registered PRD 21
- Dependency: PRD 02 — `COMPLETED`
- Pre-flight: the detailed PRD passed independent governance pre-flight; this
  Technical Design has not been independently approved
- Active stop: `LEGAL_PRIVACY_DECISION_REQUIRED` blocks production policy,
  real-data processing, public privacy UX, destructive real-data execution,
  production readiness, and PRD completion

This design authorizes no executable contract or implementation by itself.
Contract freeze begins only after independent review of this exact document.

## Design summary

PRD 21 adds one policy-agnostic privacy control plane inside the modular
monolith. Application services must obtain a typed, purpose-bound allow
decision before protected access. The decision service accepts explicit actor,
subject, purpose, operation, engineering category, policy version, evidence,
and processor context. Missing or inconsistent input produces a typed denial;
there is no permissive default.

```text
packages/schemas
  strict policy, evidence, inventory, request, retention, audit contracts
          │
          ▼
packages/domain/privacy-governance
  deterministic evaluator + state machines + provider-neutral ports
          │
          ├──────────────→ registered processor adapters
          │                   inventory / export / delete / retain
          │
          ▼
packages/database
  Drizzle repositories + append-only ledgers + PostgreSQL constraints

protected deployment input ──→ policy loader ──→ verified policy metadata
version-controlled inventory ─→ registry check ─→ readiness coverage
restricted governance lifecycle ─→ dependency-ordered metadata lifecycle

public Fastify routes: none in PRD 21
public Next.js privacy UX: none in PRD 21
real-data lifecycle execution: stopped pending approved policy
```

The first implementation slice uses synthetic policy packages, synthetic actor
contexts, synthetic subject locators, and disposable PostgreSQL only. It proves
the mechanism, not a lawful basis, legal classification, consent wording,
retention period, deletion entitlement, production authorization, or legal
compliance.

## Hard boundaries and invariants

- Privacy is deny-by-default. Unknown is never interpreted as allowed.
- A student ID, coach ID, relationship row, database role, or possession of an
  opaque locator is never complete authorization.
- No protected store is read before purpose, operation, category, policy,
  actor, subject, evidence, and processor prerequisites are evaluated.
- Policy and purpose versions are immutable to ordinary application mutation
  after activation. A change creates a new version and an explicit transition
  record.
- Permission or consent evidence is append-only to ordinary application
  mutation. Withdrawal is a separate, one-way event and never edits the
  original evidence.
- Re-consent or renewal creates new evidence; it cannot reopen a withdrawn
  record.
- Policy selection is pinned for one evaluation, request, preview, or job. A
  mid-operation policy change cannot silently alter its meaning.
- Every required store or processor is declared in a reviewed inventory.
  Runtime self-registration alone cannot claim complete coverage.
- Data-subject request completion is conjunctive across the exact pinned
  processor set. Missing, failed, or unjustifiably retained work stays visible.
- Retention evaluation and destructive execution are separate operations.
  Previewing can never delete or transform data.
- Audit contracts are allowlists of bounded metadata. They contain no generic
  payload, free-text detail, serialized request, export, body/training value,
  credential, signed URL, SQL, or raw dependency error.
- A mandatory audit failure prevents the governed allow, mutation, or
  destructive step from being represented as successful.
- Production readiness rejects synthetic, missing, unattributed, inactive,
  integrity-invalid, or environment-mismatched policy input.
- No policy loader, lifecycle command, or processor administration surface is
  registered on public Fastify routes.
- Web code remains a Fastify client and never imports the domain or database
  package.
- Historical facts are preserved unless an approved lifecycle rule explicitly
  applies. Code rollback is not data recovery.
- `Append-only` and `immutable` mean that ordinary application repositories and
  roles expose no update/delete path. They do not mean permanent retention:
  linkable governance records remain protected and preserved only until an
  approved lifecycle rule authorizes deletion or irreversible transformation
  through the separate governance-record lifecycle processor.
- Every governance table, including audit and lifecycle proof, is itself an
  inventoried processor location with an explicit lifecycle capability or an
  independently approved exception. There is no `keep everything` fallback.
- Generative AI makes no permission, entitlement, retention, deletion,
  sharing, or legal-language decision.

## Scope boundary and stop enforcement

### Safe design and implementation slice

The following work may proceed before a legal/privacy determination:

1. derive a repository inventory and threat model without opening real data;
2. freeze strict parameter shapes and typed denial outcomes;
3. implement deterministic domain state machines against local fakes;
4. validate additive migrations against synthetic disposable data;
5. simulate inventory, export, deletion, and retention through provider-neutral
   processor adapters;
6. exercise bounded destructive jobs and recovery using disposable fixtures;
7. implement fail-closed readiness that distinguishes mechanism readiness from
   production activation; and
8. prepare the exact decision packet required from authorized humans.

### Work that remains stopped

`LEGAL_PRIVACY_DECISION_REQUIRED` remains active before any of the following:

- activating a production policy or purpose;
- processing real student, coach, training, body, media, model, telemetry, or
  linked governance data through the new mechanisms;
- deciding a jurisdiction, legal role, lawful basis, age rule, notice, consent
  text, withdrawal consequence, sharing rule, retention period, deletion
  scope, legal hold, request entitlement, residency, transfer, or audit
  lifecycle;
- fulfilling a real access, export, or deletion request;
- executing retention, deletion, or irreversible transformation against real
  data, including linkable evidence, withdrawal, request, operation, audit, or
  lifecycle-proof metadata;
- exposing public student, coach, or operator privacy UX;
- claiming production privacy readiness, Gate A completion evidence for the
  stopped production path, or PRD 21 completion.

The policy-agnostic foundation may earn its own Gate A while this stop remains
accurately recorded. It may not use `NOT_APPLICABLE` to hide a policy decision
that is necessary for production activation or completion.

## Trust boundaries and threat model

| Boundary               | Trusted input                                                                                                | Untrusted or insufficient input                                                                     | Required containment                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Actor context          | Later authenticated principal mapping from PRD 07, with issuer/version integrity                             | Caller-supplied actor IDs, student/coach IDs, relationship rows                                     | Reject before subject lookup; do not reveal whether the subject exists |
| Policy input           | Strict, integrity-verified, attributed, environment-bound approved package                                   | Missing, synthetic, unsigned/unattributed, stale, downgraded, or unknown package                    | Deny and fail production readiness                                     |
| Permission evidence    | Append-only record plus current authoritative withdrawal state                                               | Client timestamps, editable evidence, cached grant without bounded invalidation                     | Serialize transitions and re-evaluate authoritatively                  |
| Processor registration | Reviewed expected inventory plus matching code-owned descriptor digest                                       | Runtime adapter claiming its own completeness                                                       | Mark coverage incomplete and readiness failed                          |
| Processor data         | Output parsed through strict processor result contracts                                                      | Raw provider/database output, free text, remote errors                                              | Reject, redact, and preserve safe partial-failure state                |
| Export                 | Bounded synthetic content and manifest in test-only storage                                                  | Delivery token, package path, raw archive, or user content in logs/audit                            | Keep artifact behind a future protected adapter; log metadata only     |
| Destructive work       | Exact approved rule, environment, preview, processor set, batch, and idempotency key                         | Ad hoc query, wildcard scope, stale preview, production execution under synthetic policy            | Refuse execution before processor mutation                             |
| Audit                  | Strict event variant with bounded identifiers and reason codes                                               | Arbitrary metadata map, payload, stack, SQL, URL, token, or free text                               | Schema rejection before persistence                                    |
| Governance lifecycle   | Exact policy/rule, legal-hold disposition, approved work item, lifecycle authority, and restricted processor | Ordinary application role, direct table DML, absent exception, or synthetic authority in production | Reject before mutation; production stays hard-disabled                 |

Primary misuse cases to test are purpose substitution, policy downgrade,
withdrawal races, request replay, processor omission, handler overstatement,
cross-subject work reuse, stale retention preview, environment mismatch,
partial lifecycle failure, audit payload smuggling, and a synthetic policy
reaching production configuration.

## Repository inventory and processor registration

### Design-time baseline

At this design base, the only product persistence integrated on the branch is
PostgreSQL for `students`, `coaches`, and `student_coach_links`. The Fastify
application also emits structured operational logs. There is no integrated
object store, queue, application cache, export store, analytics provider, body
provider, or notification provider on this base.

This observation is a bootstrap snapshot, not acceptance evidence. Before
contract freeze, an inventory task must inspect the exact candidate and create
a version-controlled, independently reviewed inventory artifact. Incoming
capabilities, including exercise catalog persistence, must be evaluated against
the then-current repository rather than copied from this snapshot.

### Inventory artifact

The planned `privacy/processor-inventory.v1.json` is metadata only. Its strict
schema records, for each bounded processor or data location:

- stable processor ID, registration version, code owner, and descriptor digest;
- adapter/package location and storage/provider kind;
- engineering category IDs and purpose bindings, without claiming a legal
  classification;
- subject lookup strategy and whether it requires PRD 07 identity mapping;
- supported inventory, access, export, deletion, retention, and recovery
  capabilities;
- explicit unsupported capabilities and independently reviewed rationale;
- every governance table/record family it stores, including policy metadata,
  purposes, processor registrations, operation results, evidence,
  withdrawals, requests, transitions, processor steps, retention
  rules/previews/work, audit events, export metadata, and lifecycle proofs;
- an explicit lifecycle capability for every linkable governance record
  family, or an independently approved rule/exception with provenance, review
  state, and expiry/review condition;
- replicas, caches, queues, logs, audit, backups, exports, and derived stores
  that participate in lifecycle coverage;
- environment applicability and required readiness status; and
- schema version and source commit.

The artifact contains no connection value, region choice, vendor secret,
subject locator, record count, policy text, data sample, or legal assertion.
Adding a new store or processor changes the reviewed inventory and invalidates
readiness until its descriptor and required handlers match.

### Expected inventory versus runtime registry

Coverage is the exact comparison of two independently sourced sets:

1. `ExpectedProcessorInventory` comes from the reviewed artifact packaged with
   the candidate build.
2. `RuntimeProcessorRegistry` is composed from code-owned adapters and exposes
   each adapter's immutable descriptor and supported handler set.

Readiness passes this check only when every required expected descriptor has
one exact runtime match and no required category/purpose/handler is omitted.
An extra runtime processor is also a failure because undeclared processing is
not authorized. A handler cannot mark itself `not_applicable`; that disposition
belongs to the reviewed inventory.

The comparison is table/record-family complete, not merely adapter complete.
Every governance table produced by the planned migration must map to exactly
one inventory location and declare retention/deletion/transformation behavior.
A missing capability, an unreviewed exception, an exception whose rule is
inactive/expired, or a generic `retain forever`/`keep everything` disposition
fails readiness. The governance lifecycle proof store and privacy audit ledger
are included recursively; neither can exempt itself from lifecycle coverage.

The initial implementation does not attempt runtime infrastructure discovery.
Cloud-account discovery, provider contracts, residency, and credentials are
future protected adapters and may activate separate stop conditions.

## Contract plan

### Freeze sequence

1. Independently review this Technical Design, inventory boundary, denial
   taxonomy, state machines, migration plan, and stop enforcement.
2. Add strict Zod schemas and inferred types in a distinct
   `packages/schemas/src/privacy-governance.ts` module with failing tests first.
3. Record provider, consumers, ownership, and `Frozen` status in
   `docs/contracts/README.md` without duplicating field definitions.
4. Freeze the schema commit before domain, database, or processor work begins.
5. Implement domain ports and state machines only against frozen symbols.
6. Re-review any schema change as a coordinated contract change.

Names in this document are proposed responsibilities, not already frozen
symbols. The contract owner may make surgical naming changes during the freeze
when schemas, consumers, tests, and registry move together.

### Contract groups

| Group                   | Responsibility                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                | Distinct branded IDs for purpose, policy, policy version, evidence, withdrawal, processor, request, request transition, preview, work item, audit event, and operation       |
| Engineering scope       | Bounded category ID, operation, subject scope, purpose binding, environment, and correlation references                                                                      |
| Policy package metadata | Schema/canonicalization version, synthetic marker, attribution reference, environment binding, content digest, activation state, effective inputs, and transition provenance |
| Purpose version         | Immutable purpose/version identity, bounded allowed operations/categories, evidence requirements, and policy reference                                                       |
| Actor context           | Strict issuer/version, principal reference, authority claims, and synthetic marker; no raw token or credential                                                               |
| Authorization evidence  | Immutable evidence decision, subject scope, purpose/policy version, source, content digest, trusted timestamp, and provenance                                                |
| Withdrawal              | Original evidence reference, one-way state, trusted timestamp, operation ID, and processing outcome                                                                          |
| Data-use decision       | Tagged `allowed` or `denied` result with evaluated policy version, stable reason code, correlation, and trusted decision metadata                                            |
| Processor descriptor    | Inventory identity, version/digest, category/purpose bindings, subject lookup, handler capabilities, and code owner                                                          |
| Subject request         | Request type, verification reference/state, pinned policy/inventory versions, lifecycle state, and bounded step summaries                                                    |
| Processor step          | Processor, operation, attempt, idempotency key, safe outcome, retry classification, and transition reference                                                                 |
| Export manifest         | Bounded file metadata, byte count, media type, source/version, and integrity digest; no delivery secret or content                                                           |
| Retention rule          | Versioned trigger/operator parameters, category/purpose scope, action, exception references, provenance, and environment                                                     |
| Retention preview/work  | Watermark, opaque item IDs, counts, selection digest, bounded batch, attempt, outcome, and retry state                                                                       |
| Governance lifecycle    | Closed record-family target, approved rule/hold/exception references, dependency plan, bounded work, authority class, minimal proof, and reconciliation outcome              |
| Privacy audit           | Closed event variants containing only minimum identifiers, policy/evidence references, outcome/reason, correlation, and trusted time                                         |
| Readiness               | Closed safe diagnostic codes, component state, schema/version digests, and overall false-unless-all-required result                                                          |

Every object is strict and bounded. Unknown keys fail. IDs are nominal and not
cross-assignable. Trusted timestamps, digests, environment identity, and
server-generated IDs cannot be supplied as authoritative caller values.
Canonicalization uses versioned, deterministic UTF-8 JSON and SHA-256; it sorts
set-like identifiers bytewise and never depends on object insertion order,
locale, database row order, or server time.

### Deny-by-default result

`DataUseDecision` is a tagged union, never a boolean. An allowed variant binds
exactly one subject scope, actor context digest, purpose version, operation,
engineering category, processor descriptor version, policy digest, evaluation
time, and correlation ID. It is request-local evidence of evaluation, not a
credential, bearer token, or reusable cross-request grant.

The denied variant uses a closed reason code. The initial taxonomy must cover
at least:

- actor context missing, invalid, synthetic in production, or lacking required
  authority;
- subject scope missing, invalid, or not mappable without disclosure;
- purpose unknown, inactive, version-mismatched, or transition-unresolved;
- policy missing, inactive, synthetic in production, integrity-invalid,
  unattributed, expired/not-effective, downgraded, or environment-mismatched;
- operation or engineering category outside the exact purpose binding;
- required evidence missing, mismatched, invalid, expired by approved input, or
  withdrawn;
- processor absent, undeclared, descriptor-mismatched, or missing a required
  handler;
- mandatory audit unavailable; and
- internal dependency unavailable.

These are engineering diagnosis codes, not legal conclusions. Public exposure
is not authorized here. Internal logs receive only the coarse operation,
outcome, stable code, duration, and correlation ID.

### Policy package boundary

A policy package is protected deployment input and is not legal truth authored
in source code. The loader performs the following checks before exposing a
version to the evaluator:

1. parse a strict schema and reject unknown keys;
2. recompute the canonical digest and verify attribution/integrity using a
   provider-neutral verifier;
3. reject a synthetic marker outside disposable test environments;
4. require exact environment binding;
5. require monotonic, non-reused version identity and an explicit transition
   from the previously active version;
6. require every referenced purpose, category, operation, evidence rule,
   processor, retention rule, and exception to resolve exactly; and
7. publish only immutable verified metadata to the evaluator.

Cryptographic key provider, signer authority, approved environment names,
legal approver identity, and production package content remain deferred. Tests
use a visibly synthetic integrity adapter that production readiness always
rejects.

## Domain services and ports

The domain package owns deterministic rules and imports no Fastify, Next.js,
React, Drizzle, PostgreSQL, provider SDK, filesystem, or environment API.
Side-effects enter through narrow injected ports.

### Core ports

| Port                                   | Responsibility                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PolicyPackageRepository`              | Return one immutable, already integrity-checked policy metadata version and its activation/transition state                                                        |
| `PurposeRegistry`                      | Resolve immutable purpose versions and exact category/operation/evidence bindings                                                                                  |
| `AuthorizationEvidenceLedger`          | Append evidence, resolve authoritative current withdrawal state, and serialize evidence transitions                                                                |
| `ExpectedProcessorInventory`           | Return the reviewed candidate inventory version and exact required descriptors                                                                                     |
| `RuntimeProcessorRegistry`             | Return composed adapter descriptors and typed lifecycle capabilities                                                                                               |
| `SubjectDataProcessor`                 | Execute only its declared inventory/export/delete/retention capability through strict inputs/results                                                               |
| `DataSubjectRequestRepository`         | Store request identity, pinned versions, idempotency result, current state, and append-only transitions                                                            |
| `RetentionRuleRepository`              | Resolve one immutable approved-or-synthetic rule version and its activation/environment state                                                                      |
| `RetentionWorkRepository`              | Store previews, bounded work, leases, results, and replay state                                                                                                    |
| `GovernanceRecordLifecycleProcessor`   | Execute only approved, dependency-ordered deletion or irreversible transformation of linkable governance records through a non-public least-privileged boundary    |
| `GovernanceLifecycleAuthorityVerifier` | Verify exact policy/rule, environment, legal-hold/exception disposition, work-item binding, and synthetic-versus-production authority without exposing credentials |
| `PrivacyAuditSink`                     | Atomically or durably accept one strict audit event variant; never accept arbitrary metadata                                                                       |
| `TrustedClock`                         | Supply server-controlled UTC timestamps                                                                                                                            |
| `IdFactory`                            | Supply distinct opaque IDs by entity type                                                                                                                          |
| `IntegrityVerifier`                    | Verify digest/attribution through an adapter without exposing secret/key material to the domain                                                                    |

Separate adapters may implement multiple ports, but composition does not merge
their authority. There is no generic repository, generic event payload, generic
admin role, generic processor fallback, or catch-all lifecycle handler.

### Data-use evaluation flow

1. Parse and normalize the complete evaluation input before any protected
   subject lookup.
2. Resolve one exact policy and purpose version; verify active state,
   transition, digest, environment, actor-context class, category, and
   operation.
3. Compare the expected processor descriptor with the runtime adapter digest
   and required capability.
4. Resolve required permission/authority evidence and authoritative withdrawal
   state under one consistent read boundary.
5. Produce one typed denial, or build a request-local allowed variant bound to
   the exact evaluated inputs.
6. Persist the mandatory allow/deny audit event before protected access. An
   audit failure cannot fall through to allow.
7. Invoke only the already-bound processor operation. Parse its result through
   the strict schema before returning it to the application service.

The first implementation disables cross-request allow caching. A production
cache or asynchronous consumer requires a separately reviewed bounded
invalidation design that proves successful withdrawal becomes authoritative
within an approved limit. That limit is itself unavailable until policy
determination.

## Permission evidence and withdrawal

The mechanism is named authorization evidence internally because the approved
policy may require consent, contract, another authority, or no user-grant
evidence for a particular purpose. Engineering never assumes consent is the
universal lawful basis.

An evidence record contains the minimum proof fields from the PRD, immutable to
ordinary application mutation: subject scope, purpose and policy version,
decision, evidence source class, notice/content digest when applicable, trusted
timestamp, provenance, and operation ID. It does not copy notice text, UI
fields, IP address, user agent, credential, signature material, or arbitrary
metadata. Whether any additional proof is necessary is a human/legal decision
and a future contract change.

### Evidence transition rules

- Evidence is inserted once and has no update/delete repository method.
- A withdrawal references exactly one grant-like evidence record and is itself
  append-only to ordinary application mutation.
- The evidence row and any number of withdrawal attempts are serialized by the
  referenced evidence ID. Exactly one authoritative successful withdrawal may
  commit.
- A replay with the same namespaced operation ID and canonical input returns
  the committed result. Reuse with different input conflicts with no mutation.
- A successful withdrawal changes future authoritative evaluations
  immediately after commit. It does not rewrite the evidence or choose a
  deletion/retention consequence.
- Re-consent or renewal creates a new evidence ID under an active approved
  purpose/policy version. It never removes the prior withdrawal.
- Concurrent grant/withdraw operations use stable lock order and database
  uniqueness/deferred constraints so a withdrawal cannot be lost.
- An audit event for a mutation commits in the same transaction when the audit
  ledger shares PostgreSQL. A future external audit sink requires a reviewed
  transactional outbox or equivalent durable barrier before use.

Production evidence capture and withdrawal UX remain unavailable until PRD 07
supplies authenticated principal mapping and authorized legal wording and
presentation have been approved.

## Governance-record lifecycle

Append-only application history and privacy lifecycle are separate authority
planes. Ordinary product services may append and read governed records but
receive no update/delete repository method or database privilege. A distinct,
non-public `GovernanceRecordLifecycleProcessor` is the only planned boundary
that may delete or irreversibly transform linkable governance metadata. It is
not imported by Fastify route registration, web code, the data-use evaluator,
or ordinary request processing.

The processor runs with a separate least-privileged database identity. That
identity receives no unrestricted table DML; it may execute only reviewed,
narrowly scoped lifecycle operations against work items already pinned by the
retention/request coordinator. Exact credential provisioning remains outside
this design. Production composition omits the lifecycle identity and
hard-disables the processor while `LEGAL_PRIVACY_DECISION_REQUIRED` is active.
Disposable tests use a visibly synthetic lifecycle identity that production
startup and readiness reject.

### Authorization and plan

One lifecycle command must bind all of the following before mutation:

- exact environment, candidate SHA, policy and rule version/digest;
- closed governance record family and engineering category/purpose scope;
- verified subject scope or policy-authorized non-subject scope;
- exact approved action: delete or a named irreversible transformation;
- legal-hold evaluation and every approved exception reference;
- expected processor inventory, table-family coverage, dependency-plan digest,
  preview/watermark, bounded work IDs, batch limit, and fencing token;
- lifecycle authority class, namespaced idempotency key, and mandatory audit
  availability; and
- minimal-proof contract version and recovery/reconciliation disposition.

Missing, synthetic-in-production, inactive, expired, mismatched, or ambiguous
input rejects before database mutation. A legal hold may preserve only the
records and period covered by an active approved hold rule. An exception may
produce `retained_under_approved_exception` only when its exact active rule,
scope, provenance, review/expiry condition, and authority resolve. An absent
rule, handler failure, generic operational concern, `keep everything`, or an
indefinite default is not an exception.

### Dependency order

The coordinator derives a closed dependency DAG from reviewed record-family
metadata; it never uses an unbounded cascade. One subject-scoped plan orders
work as follows, skipping a family only when the inventory proves it contains
no matching record or an independently approved exception applies:

1. freeze the pinned work set and reject new use of the affected ephemeral
   export/delivery artifacts;
2. delete or transform leaf export metadata, processor item handles, and other
   derived linkable artifacts;
3. process prior privacy audit events and lifecycle results that link to the
   subject or affected records;
4. process request processor steps before request transitions, and transitions
   before the request current record;
5. process retention work items before previews and subject-scoped rule
   bindings;
6. process withdrawals before their authorization-evidence parents;
7. process subject-linked operation results only after every record that needs
   their idempotency/reconciliation evidence has a terminal result; and
8. create the minimal lifecycle proof and final audit event after all targeted
   families reconcile.

Shared policy versions, purpose versions, processor registrations, and general
retention rules are not deleted merely because one subject is processed. Their
own eventual lifecycle requires a separate non-subject plan proving that no
live evidence, request, work, audit, or proof depends on them. Foreign keys
remain restrictive and enforce the same child-before-parent order. A plan that
does not cover every dependency fails before the first mutation.

### Minimal proof and recursive audit treatment

Deletion cannot be proven by retaining the deleted sensitive payload or a
reversible subject mapping. The minimal proof contract is separately approved
and limited to the lifecycle operation ID, policy/rule and plan digests,
processor/record-family code, opaque batch reference, aggregate attempted and
terminal counts, outcome/reason, environment, candidate SHA, and trusted
times. A subject locator, per-record digest, work-item handle, exception detail,
or deleted value is absent unless an exact approved rule requires the minimum
field and its own lifecycle.

The proof store and privacy audit ledger are processors in the exact inventory.
Processing old audit/proof records creates one new minimal proof/audit event for
the current bounded batch; a batch never deletes its own proof. A later eligible
batch may process an older proof and creates its own successor evidence. This
well-founded generation rule prevents recursive self-deletion while ensuring
audit/proof metadata is not permanently exempt. The approved audit lifecycle
must define minimum fields, retention, access, transformation/deletion, and the
point at which no subject-linkable locator remains.

### Batches, idempotency, and reconciliation

- Every batch is bounded by count and processor/record family, uses stable work
  order, lease expiry, and a fencing token, and commits one item/result at a
  time or in a proven atomic same-store unit.
- The same namespaced operation and canonical work digest returns the committed
  result. Reuse with different input conflicts with no additional mutation.
- Before retry after timeout, the adapter reconciles the work item, dependent
  rows, operation ledger, minimal proof, and audit event. It never infers
  deletion from absence alone when irreversible transformation is possible.
- A partial failure stops the affected dependency branch. Completed results
  remain immutable to ordinary application roles; unresolved parents do not
  advance and full completion is prohibited.
- Recovery is roll-forward: resume retryable work under the same plan or issue
  a new explicitly compatible plan. No code rollback recreates deleted data.
- Production execution additionally requires approved backup/replica purge or
  restore-filter/re-deletion behavior. Without it, readiness and execution
  remain blocked.

## Processor capabilities

Each processor exposes only the capabilities listed by its descriptor:

- `inventory` returns bounded category/purpose counts and opaque item handles;
- `access` returns a bounded typed representation only when the approved
  request scope authorizes it;
- `export` writes through an export-artifact adapter and returns manifest
  metadata, never package bytes or delivery secrets to logs/audit;
- `delete` reports `deleted`, `irreversibly_transformed`,
  `retained_under_approved_exception`, `not_found`, `retryable_failure`, or
  `permanent_failure`; and
- `retention` previews or executes exact opaque work items under a pinned rule.

The governance database is a separate processor location and exposes
`governance_lifecycle` only through the restricted port above. Every governance
record family is enumerated in its descriptor. A family without a matching
lifecycle handler or independently approved exception makes the descriptor
incomplete and production readiness false.

Processor item handles are scoped to processor, subject, inventory version,
and purpose. They cannot be moved to another processor or subject. List calls
are bounded and cursor-based. A processor cannot return a raw exception as a
result, treat an absent handler as `not_found`, invent an approved exception,
or report completion for work it did not perform.

Provider-specific storage, identity, key, delivery, notification, analytics,
and body systems remain behind adapters. None is selected or added by this
design.

## Data-subject request orchestration

PRD 21 provides a provider-neutral state machine, not a public workflow and not
a legal entitlement decision. A request uses an opaque ID, server clock,
namespaced idempotency key, one pinned policy version, one pinned expected
inventory version, and one verification-state reference supplied by a future
authorized identity boundary.

### Request states

| State                   | Meaning and permitted next state                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `received`              | Strict request metadata recorded; moves to `verification_required` or `policy_blocked`                                                                               |
| `verification_required` | No protected lookup may run; moves to `ready` only with an accepted verification reference under approved policy                                                     |
| `policy_blocked`        | Required policy or transition is absent/unapproved; may return to `verification_required` after an explicit compatible policy transition                             |
| `ready`                 | Policy, verification, and exact processor plan are pinned; moves to `in_progress`                                                                                    |
| `in_progress`           | Bounded processor steps run idempotently; moves to `partially_failed`, `completed`, or a policy-authorized terminal disposition                                      |
| `partially_failed`      | Successful steps remain immutable to ordinary application mutation and failed retryable steps may resume; moves to `in_progress` or an approved terminal disposition |
| `completed`             | Every required processor step has an acceptable terminal result under the pinned policy; terminal                                                                    |
| `cancelled`             | Cancellation was authorized before an irreversible boundary; terminal                                                                                                |
| `denied`                | A policy-authorized denial with safe reason evidence; terminal                                                                                                       |

`completed`, `cancelled`, and `denied` do not themselves assert a legal result.
Their production transition rules remain disabled until approved policy defines
eligibility, verification, scope, timing, communications, appeal, and agent
authority.

Every transition is append-only to ordinary application mutation, carries the
previous state/version, trusted timestamp, operation ID, correlation ID, and a
closed reason code, and updates the current pointer in the same transaction.
Invalid jumps and transitions without evidence are rejected by domain logic
and database constraints.

### Planning and execution

1. Validate request type `access`, `export`, or `deletion` without inferring
   eligibility.
2. Require a non-sensitive verification reference. Synthetic verification is
   accepted only in disposable tests and rejected by production readiness.
3. Pin the policy version and exact reviewed processor inventory digest.
4. Build one step per required processor/capability. Missing registrations or
   handlers leave the request visibly incomplete.
5. Execute bounded steps in stable processor-ID order. Each step has its own
   namespaced idempotency key, attempts, safe result, and transition evidence.
6. Retry only typed retryable failures. Permanent failure or an absent approved
   exception prevents full completion.
7. For exports, assemble a bounded manifest with per-file digest and source
   version. Delivery is a future protected adapter and no delivery URL/token is
   stored in request history or audit.
8. Complete only when the pinned plan is exhaustive and each step's outcome is
   allowed for that request type by the pinned policy.

An inventory version change during work does not silently alter the plan. The
coordinator records the mismatch and requires an explicit policy-compatible
replan transition. Removed processors remain part of historical request
evidence and must have a migration/recovery disposition before removal.

## Retention preview and execution

### Rule representation

A retention rule binds one immutable version to a purpose, engineering
category, trigger operator, duration/event parameters, action, exception
references, environment, and policy provenance. The schema provides a closed
set of deterministic mechanical operators; it does not accept executable code,
SQL fragments, arbitrary expressions, or free-text conditions.

No duration, trigger, legal hold, grace period, backup behavior, transformation
standard, or exception is defaulted. An absent parameter prevents evaluation
or execution and activates the recorded legal/privacy stop when needed.

### Preview

Preview is a read-only operation. It:

1. validates one exact active rule and environment;
2. pins policy, inventory, processor descriptors, evaluation watermark, and
   trusted time;
3. asks each declared processor to deterministically select bounded opaque work
   items;
4. records counts, per-processor cursors, item digests, and one aggregate
   selection digest without copying protected payloads; and
5. returns a preview ID and safe summary.

Repeating the same operation and inputs returns the same committed preview.
Preview creates no deletion, transformation, hold release, export, or provider
side effect.

### Execution

Execution is a separate deployment/operations capability and is never callable
from public Fastify routes or ordinary application credentials. Before each
bounded batch it requires:

- a non-synthetic active approved rule and policy version;
- exact environment and candidate-build binding;
- an unexpired, unexecuted preview whose inventory and processor digests still
  match;
- a protected execution-authority reference supplied by a later authorized
  operational boundary;
- a namespaced operation ID, batch bound, lease/fencing token, and stable work
  order;
- mandatory audit availability; and
- recovery evidence appropriate to the selected action and every affected
  processor, replica, backup, and export store.

The policy-agnostic implementation hard-disables this production path. Tests
exercise the same state machine only with a synthetic policy, synthetic
authority, exact disposable environment marker, and disposable data.

A processor result is persisted before the next work item. A retry returns the
existing typed result for an identical operation; conflicting input fails.
Retryable failure stops the affected bounded batch without claiming success.
Permanent failure and retained exceptions remain visible. An exception counts
as terminal only when it resolves to an active approved rule.

## Audit minimization and observability

### Privacy audit ledger

Audit uses closed event variants for:

- policy verification/activation attempt and transition;
- data-use allow or deny;
- evidence record and withdrawal;
- processor registration/coverage result;
- request and processor-step transition;
- retention preview and execution result; and
- governance-record lifecycle plan, per-family result, reconciliation, and
  minimal proof; and
- readiness state transition.

Each variant permits only the identifiers and version references needed for
that event, a closed operation/outcome/reason, correlation ID, trusted
timestamp, and minimum protected actor/subject locator when the approved audit
policy requires one. There is no `metadata`, `context`, `payload`, `details`,
`message`, or arbitrary string map escape hatch.

Contract tests maintain a prohibited-field corpus including request/response
bodies, body or training values, free text, notice text, export contents,
database/provider messages, stack traces, connection strings, credentials,
tokens, URLs, IP addresses, and user-agent strings. Any such key or value shape
is rejected before persistence.

The minimum actor/subject locator representation, access roles, retention, and
deletion behavior for audit itself remain human/legal decisions. Synthetic
mechanics use unlinkable fixture locators. The audit ledger is also an in-scope
processor and cannot be exempted from the inventory. Its old linkable events
are processed only through the dependency-ordered governance lifecycle; the
new minimal event/proof follows the generation rule defined above and remains
subject to a later approved lifecycle batch.

### Routine logs

Routine logs are distinct from the audit ledger. They contain only operation,
coarse outcome, duration, correlation ID, retry classification, and safe
component code. They never duplicate subject/evidence IDs, policy content,
processor item handles, request steps, export manifests, exception messages,
SQL, credentials, or signed locations.

Public errors are not introduced by this PRD. Future Fastify composition must
reuse frozen safe error envelopes and must not translate a typed privacy denial
into proof that a subject or record exists.

## Readiness model

Readiness is conjunctive and separates mechanism evidence from production
activation.

### Mechanism readiness

An internal synthetic/disposable check may report the mechanics healthy when:

- contract, canonicalization, and supported schema versions match;
- required migrations are applied;
- repositories and mandatory audit sink are available;
- the reviewed expected inventory exactly matches runtime descriptors;
- every governance table/record family has a synthetic lifecycle capability or
  independently reviewed synthetic-test exception, including audit and
  lifecycle proof;
- every required synthetic handler and state-machine capability is present;
  and
- synthetic recovery evidence is current for the candidate.

This status is named `mechanism_ready`, never `privacy_ready` or
`production_ready`.

### Production readiness

Production readiness defaults to false and additionally requires:

- an attributable, integrity-verified, non-synthetic approved policy package;
- resolved jurisdiction, roles, eligibility/minors, purposes, authority,
  notices, sharing, secondary use, retention, deletion, request, residency,
  backup, audit, and transition decisions for every activated path;
- a non-synthetic PRD 07 actor/subject mapping boundary;
- approved processor/provider, region, key, and credential configuration;
- exact lifecycle coverage for caches, queues, replicas, backups, exports,
  logs, and audit;
- a separately provisioned restricted governance-lifecycle identity, approved
  rule/hold/exception set, and record-family-complete dependency plan;
- production recovery evidence, including destructive-operation behavior; and
- no active applicable stop condition.

The current design necessarily produces `production_ready: false` with reason
`legal_privacy_decision_required`.

Safe readiness diagnostics use only closed codes such as policy missing,
synthetic, unattributed, integrity invalid, transition unresolved, environment
mismatch, inventory mismatch, processor/handler missing, migration missing,
audit unavailable, governance-table lifecycle missing, exception
unapproved/expired, hold unresolved, lifecycle authority
unavailable/synthetic, recovery unverified, identity boundary missing, or
active stop condition. They expose no policy text, subject/actor/evidence ID,
provider detail, host, region, credential, or raw exception.

## Persistence and migration plan

No migration is created by this Technical Design. After contract/domain review,
one global Data/Infrastructure owner rebases on the exact latest integrated
migration head and creates one new additive migration plus Drizzle metadata.
It must not edit an applied migration or run concurrently with another
migration owner.

### Planned records

| Record/table family                     | Purpose and required database properties                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy package/version metadata         | Ordinary-app immutable schema/canonicalization version, digest, attribution reference, synthetic marker, environment, activation/transition state; no policy text |
| Purpose versions                        | Ordinary-app immutable purpose identity/version and exact policy reference; activation uniqueness and no in-place semantic update                                 |
| Processor registrations                 | Reviewed inventory identity/version/digest and runtime descriptor result; append-only activation history                                                          |
| Authorization evidence                  | Ordinary-app immutable subject scope, purpose/policy version, decision, source class, content digest, trusted time, and operation ledger reference                |
| Withdrawals                             | One-way evidence reference with one authoritative committed withdrawal and ordinary-app immutable attempt/result history                                          |
| Privacy operation ledger                | Global namespaced idempotency key, canonical input digest/version, operation kind, state, typed-result locator, and trusted times                                 |
| Data-subject requests                   | Current state/version, request type, verification reference, pinned policy/inventory versions, and operation reference                                            |
| Request transitions and processor steps | Append-only state history, exact previous version, processor/capability, attempt, safe outcome, and retry class                                                   |
| Retention rules/previews/work items     | Immutable rule version, watermark, selection digest, bounded opaque work, lease/fence, attempt, result, and policy/inventory references                           |
| Governance lifecycle work/proofs        | Closed record-family target, dependency-plan digest, approved rule/hold/exception references, bounded work/result, reconciliation, and minimal proof              |
| Privacy audit events                    | Append-only closed event variant and minimal bounded references; no generic JSON payload                                                                          |

Foreign keys use restrictive deletion and encode the dependency direction
summarized in the governance lifecycle section:

- withdrawal references authorization evidence;
- request transition references request, and a processor step references its
  request plus the transition that opened the attempt;
- retention work references preview and rule, while preview references the
  pinned policy/inventory versions;
- subject-linked operation results are parents only while another record needs
  their idempotency/reconciliation evidence; and
- linkable audit events reference their governed operation/version until the
  lifecycle processor deletes or irreversibly transforms that old event.

The lifecycle plan processes children before parents and never relies on
`ON DELETE CASCADE` to define privacy behavior. A final minimal lifecycle proof
copies only approved opaque IDs/digests and has no foreign key back to a parent
the same batch deleted. It is a new inventoried generation with its own future
lifecycle, not a hidden constraint that makes the parent permanent.

Database constraints enforce immutable version identity, one active version
where applicable, one-way withdrawal, state/evidence coupling,
operation-digest replay, pinned request/preview versions, bounded work
uniqueness, and append-only ordinary application ledgers. Ordinary application
roles receive no update/delete grants on those records. A separate restricted
lifecycle role receives only execute permission on reviewed, fixed-search-path
operations that resolve pre-created work, rule, hold/exception, dependency,
fencing, and idempotency state server-side; it receives no arbitrary table DML.
Public/ordinary roles receive no execute grant. Service validation provides
early errors; PostgreSQL tests prove ad hoc direct SQL cannot commit the
material invariants or impersonate lifecycle authority.

Exact table names, columns, indexes, and constraint strategy are finalized only
after executable contract and domain-port review. The migration contains no
real subject row, production purpose, legal value, notice, retention duration,
vendor, region, secret, credential, or synthetic fixture seed.

### Migration validation

- clean apply and repeated deployment against disposable PostgreSQL;
- exact journal, table, constraint, index, trigger, and privilege state;
- database rejection of ordinary/ad hoc updates/deletes to evidence,
  withdrawals, transitions, rules, operations, audit, and lifecycle proof;
- explicit synthetic lifecycle execution through the restricted operation only
  in disposable test mode, covering every governance table family configured
  with a capability plus independently reviewed exception paths,
  child-before-parent order, legal hold, minimal proof, recursive audit
  treatment, and zero unplanned rows;
- rejection of synthetic lifecycle authority, synthetic policy/rule, missing
  table coverage, direct DML, or unrestricted role use in production mode;
- concurrent evidence/withdrawal, operation replay, request transition, lease,
  and active-version races;
- deliberate mid-migration failure followed by a new forward correction;
- preservation of pre-existing PRD 02 and later unrelated sentinel rows and
  digests through apply, failure, correction, and restore rehearsal; and
- drift detection between Drizzle schema, migration metadata, and actual
  PostgreSQL.

## Transaction, concurrency, and failure behavior

| Event                                                | Required behavior                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Missing/invalid policy                               | Typed deny before protected access; production readiness false                                 |
| Synthetic policy in production                       | Startup/readiness failure; no evaluator activation                                             |
| Actor/subject mapping missing                        | Deny without a subject-existence oracle                                                        |
| Evidence already withdrawn                           | Deterministic deny; original evidence unchanged                                                |
| Concurrent grant/withdrawal                          | Serialize by evidence/subject-purpose scope; withdrawal cannot be lost                         |
| Operation replay                                     | Same canonical input returns committed result; mismatched input conflicts with zero change     |
| Inventory mismatch                                   | Readiness false; request/retention plan incomplete                                             |
| Processor unavailable                                | Typed retryable failure; no raw dependency detail and no false completion                      |
| Required handler absent                              | Coverage failure, never `not_found` or `completed`                                             |
| Governance table/record family absent from inventory | Readiness false; no lifecycle preview, execution, or completion claim                          |
| Lifecycle rule/hold/exception unresolved             | Preserve records; production execution false; no indefinite-retention fallback                 |
| Ordinary/ad hoc governance mutation                  | Database privilege/constraint rejection; safe internal security event                          |
| Synthetic lifecycle authority in production          | Startup/readiness and execution rejection before mutation                                      |
| Policy changes during work                           | Continue only on pinned compatible version or enter explicit blocked/replan state              |
| Request step fails                                   | Preserve completed immutable steps; resume only retryable work idempotently                    |
| Audit write fails                                    | Governed allow/mutation/destructive step fails atomically where feasible; never silent success |
| Preview selection changes                            | Execution rejects stale digest and requires a new preview                                      |
| Batch lease is stale                                 | Fencing rejects mutation; work remains retryable and visible                                   |
| Partial deletion/retention failure                   | Stop affected batch, preserve result evidence, and do not claim full completion                |
| Lifecycle timeout or ambiguous result                | Reconcile item, dependencies, operation result, proof, and audit before retry                  |
| Database unavailable/corrupt row                     | Safe internal dependency failure and readiness false; no permissive fallback                   |
| Backup/replica behavior unknown                      | Real destructive execution and completion remain blocked                                       |

Where the privacy ledger and governed data share PostgreSQL, state and mandatory
audit evidence commit in one transaction. Cross-processor atomicity is not
pretended: the coordinator uses pinned plans, per-step idempotency, durable
results, explicit partial states, and safe resume. A future external side
effect requires the adapter to define its idempotency, timeout ambiguity,
compensation limits, and reconciliation before registration.

## Security and privilege enforcement

- Ordinary application code and database roles may append/read only the
  records required by their bounded service; they cannot update/delete
  evidence, withdrawals, request/operation history, audit, or lifecycle proof.
- The governance lifecycle port is non-public, separately composed, and
  least-privileged. It accepts no table name, SQL, arbitrary predicate,
  unbounded selector, caller-owned timestamp/digest, or free-form action.
- Restricted database operations resolve their table family, work IDs, policy,
  rule, hold/exception, dependency plan, environment, and fencing state from
  validated stored records. Fixed search paths, revoked public execution, and
  parameterized operations prevent object substitution.
- Production startup does not compose a lifecycle processor or credential
  while `LEGAL_PRIVACY_DECISION_REQUIRED` is active. If a future approved path
  needs that protected database role or key,
  `EXTERNAL_CREDENTIAL_REQUIRED` applies until least-privilege provisioning is
  available.
- Synthetic lifecycle identity, policy, rule, environment, work, and fixtures
  carry explicit markers. Any one reaching production causes startup,
  readiness, and command verification to fail before data access.
- Legal holds and exceptions are positive, exact, versioned inputs. Absence,
  ambiguity, expiry, or verification failure preserves the records and blocks
  completion; it never grants broad retention or mutation authority.
- Minimal proof and audit remain protected processors. Access, retention, and
  lifecycle for them require separate approved policy; operational logs never
  become a substitute proof store.
- Secret/key material, database credentials, policy text, subject mappings,
  record handles, deleted values, and raw errors never enter commands, audit,
  proofs, routine logs, or public errors.

## TDD and verification strategy

All behavior follows observable Red → minimal Green → refactor. Tests use only
visibly synthetic values and disposable infrastructure.

### Contract tests

- valid variants for every nominal ID, policy/evidence result, processor
  descriptor, request/step state, retention preview/work result, audit event,
  governance lifecycle command/result/proof, and readiness diagnosis;
- unknown keys, cross-assigned brands, malformed digests/times, unbounded
  arrays/text, caller-owned trusted fields, and invalid tagged-union
  combinations;
- exhaustive typed denial and state/outcome handling; and
- a prohibited-payload corpus proving no raw bodies, media, measurements,
  training values, free text, notice text, export content, dependency errors,
  credentials, tokens, URLs, or arbitrary metadata enter audit/log contracts.

### Domain tests

- deny on each missing or mismatched actor, subject, purpose, policy, category,
  operation, evidence, withdrawal, processor, handler, environment, integrity,
  and audit input;
- allow only when every exact synthetic input matches, with request-local
  binding that cannot be reused for another subject/operation/processor;
- deterministic canonicalization under permuted equivalent input;
- purpose/policy/evidence versions immutable to ordinary mutation, re-consent
  as new evidence, one-way withdrawal, operation replay/conflict, and
  concurrency races;
- inventory exact-set comparison, descriptor substitution, extra/missing
  processor, every governance table/record family, missing lifecycle
  capability, unapproved/expired exception, and unsupported handler behavior;
- every valid and invalid request transition, pinned plan, partial failure,
  resume, terminal-state protection, and false-completion attempt;
- retention rule ambiguity, deterministic preview, zero-side-effect preview,
  stale digest, environment mismatch, bounded batches, leases/fencing,
  retries, and approved-exception resolution;
- governance lifecycle child-before-parent planning, hold precedence,
  exception scoping, minimal proof, recursive audit generations, partial
  branch failure, and reconciliation; and
- audit failure preventing allow/mutation/destructive success.

### PostgreSQL integration tests

- clean migration apply/replay/drift and exact constraints;
- ordinary-role and ad hoc direct-SQL attempts to mutate append-only evidence,
  withdrawal, transitions, rules, operation results, audit, and lifecycle
  proof, all rejected;
- restricted synthetic lifecycle operations that delete/transform every
  governance record family configured with that capability, only from
  pre-created bounded work in disposable PostgreSQL, with no unrestricted DML
  grant, plus exact exception-only family behavior;
- production-mode rejection of synthetic lifecycle identity, policy, rule,
  hold/exception, work, or environment markers before mutation;
- restrictive-FK dependency ordering, legal-hold preservation, exact approved
  exception, minimal-proof generation, older-audit lifecycle, and proof
  generation progression;
- concurrent evidence/withdrawal, active-version, request-state, idempotency,
  and work-lease races;
- atomic rollback when mandatory audit or a same-database mutation fails;
- multi-processor request and retention work with injected failures; and
- forward correction and safe restore rehearsal preserving unrelated
  sentinel data and post-snapshot unrelated writes.

### Processor and orchestration tests

- repository-derived expected inventory versus composed fake processors;
- table/record-family-complete governance inventory with exact lifecycle
  capability or independently approved exception and no keep-everything
  fallback;
- bounded inventory cursors and cross-subject/item-handle rejection;
- access/export manifests parsed through strict contracts;
- deletion outcomes, absent approved exception, retryable/permanent failures,
  and exact request completion rules;
- retention preview versus execution separation and proof that production mode
  rejects synthetic policy/authority;
- bounded/idempotent governance lifecycle batches, timeout reconciliation,
  partial dependency branches, retry without duplicate deletion/proof, and
  recovery evidence; and
- timeout-after-side-effect ambiguity resolved by adapter idempotency and
  reconciliation without duplicate destructive work.

### Repository and review gates

- pinned Node.js/pnpm formatting, lint, typecheck, unit/integration tests,
  production build, repository check, dependency and secret scan;
- static boundary checks proving no public route, web import, runtime policy
  value, real fixture, or provider selection was introduced;
- exact candidate inventory review and synthetic-data scan;
- migration drift/replay/concurrency/recovery evidence when migrations enter
  scope; and
- independent Agent 90 plus QA/security review of the exact integrated head,
  with zero open `BLOCKER` and zero open `HIGH` before merge.

Green synthetic tests prove the bounded mechanics only. They cannot be cited as
approval of policy, legal compliance, production processing, or PRD completion.

## Recovery and rollback

### Policy and evidence

- Before production activation, synthetic stores may be discarded and rebuilt.
- Policy versions and activation transitions are append-only to ordinary
  application mutation. Rollback means an explicitly approved compatible
  transition to another version, never editing history or silently downgrading.
- Evidence and withdrawal history are never restored to a logically earlier
  grant state. Failed transitions preserve the last committed state and retry
  idempotently.
- These records are protected from ordinary mutation, not promised permanent
  retention. An approved governance lifecycle may later delete or irreversibly
  transform them in dependency order; recovery preserves the authorized
  lifecycle result and minimal proof rather than recreating a prior grant.

### Requests and processor work

- Request recovery reads the pinned plan and completed steps immutable to
  ordinary application mutation, then retries only typed retryable work with
  the same step idempotency key.
- A timeout does not imply success or failure. The adapter reconciles by its
  operation key before a retry.
- Export recovery never logs or exposes an artifact location/token. Expired or
  corrupt synthetic artifacts are regenerated only under the pinned policy and
  manifest contract.
- A processor removed from code remains represented in incomplete historical
  work until a reviewed compatibility/recovery adapter or explicit approved
  disposition exists.

### Retention and deletion

- A preview may be abandoned safely because it has no destructive effect.
- A failed batch preserves per-item results and stops. Safe retry or roll-
  forward is preferred; the system never repeats already reconciled work.
- Governance-record recovery reconciles the restricted operation ledger,
  dependent rows, result, minimal proof, and audit generation before retry.
  Parents remain protected while any child branch is unresolved.
- An approved legal hold or exception preserves only its exact scope and
  records a typed terminal result. Missing or expired authority leaves the
  batch blocked; it never becomes a keep-everything fallback.
- No automatic restoration of deleted or irreversibly transformed data is
  promised. Backup purge, restore filtering, re-deletion, relational-history
  treatment, and proof retention require human/legal approval and exercised
  production evidence.
- Production execution remains disabled while that evidence or policy is
  missing.

### Migrations

- Applied migrations are immutable and corrected forward with a new additive
  migration.
- Application rollback targets a schema-compatible version; it does not drop
  governance tables, erase audit/evidence, or restore an entire shared database.
- Before apply, record exact code/migration SHAs, journal, schema/row counts,
  unrelated sentinel digest, and verified recovery boundary.
- A last-resort restore must preserve unrelated newer writes or replay them
  explicitly. Exact recovery evidence is independently reviewed before
  traffic or lifecycle execution resumes.

## Rollout and delivery waves

1. **Technical Design review** — Agent 90 challenges the stop boundary,
   inventory completeness model, contracts, state machines, destructive-work
   isolation, audit minimization, migration plan, and recovery.
2. **Inventory and threat model** — create the exact repository-derived
   metadata artifact and independently review every store, log, replica,
   backup, export, and provider boundary present on that candidate.
3. **Contract freeze** — API/Domain owns the isolated privacy schema module and
   tests; the Orchestrator serializes schema barrels and `docs/contracts`.
4. **Policy-agnostic domain** — implement evaluator, evidence/withdrawal,
   request, retention-preview, restricted governance-record lifecycle, audit,
   and readiness state machines against synthetic fakes. No HTTP or production
   policy activation.
5. **Disposable persistence** — after all earlier migrations are integrated,
   one global Data/Infrastructure owner adds the governance migration,
   ordinary-role denial, restricted lifecycle operations, constraints, and
   PostgreSQL tests with synthetic data only.
6. **Processor simulation** — compose provider-neutral fakes, exact inventory
   and governance-table coverage, export manifests, holds/exceptions,
   child-before-parent lifecycle, minimal proof/audit generations, partial
   failures, idempotency, reconciliation, and recovery drills.
7. **Integration and Gate A** — run clean exact-head gates, migration/recovery,
   QA/security, independent review, and durable findings/evidence.
8. **Mandatory stop before activation** — record
   `LEGAL_PRIVACY_DECISION_REQUIRED`. Do not add real policy, real data,
   production lifecycle identity/execution (including governance records),
   public UX, production readiness, or PRD completion until attributable
   decisions and all affected reviews exist.

Parallel work is permitted only after contracts freeze and only across
non-overlapping paths. The Orchestrator owns all shared barrels, lockfile,
registry, contract registry, execution records, and integration composition.
Exactly one global migration owner works at a time.

## Human/legal decision packet

Before any affected production path activates, authorized humans must provide
an attributable decision record covering every applicable item below:

| Decision family                    | Minimum technical input needed                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jurisdiction and accountable roles | Applicable actor/processing locations, governing assumptions, controller/processor roles, representatives, and accountable approvers                                |
| Eligibility and minors             | Whether minors are permitted, age thresholds, guardian/agent authority, grant and withdrawal rules                                                                  |
| Data classification and purposes   | Approved classification, bounded required/optional purpose per category/operation, and prohibited secondary use                                                     |
| Authority and evidence             | Lawful basis or authority per purpose, required evidence, notice/consent wording, locales, presentation, version transition, and withdrawal consequences            |
| Sharing and automation             | Student–coach access, provider/affiliate recipients, analytics/research/model use, and consequential automated-decision/human-review rules                          |
| Retention and deletion             | Trigger, exact period/event, action, exceptions, legal hold, transformation standard, relational-history treatment, and proof retained                              |
| Requests                           | Eligibility, identity assurance, agent authority, scope, export format, delivery, timing, denial/appeal, and communication responsibility                           |
| Residency and providers            | Approved regions, transfers/safeguards, subprocessors, key management, credentials, contractual authority, and paid commitments                                     |
| Replicas and recovery              | Cache/queue invalidation bound, backup/replica purge or restore-filter behavior, re-deletion, and recovery acceptance                                               |
| Audit and disclosure               | Minimum locator, authorized viewers, retention/deletion, incident and compelled-disclosure path, and evidence requirements                                          |
| Governance metadata lifecycle      | Per-record-family retention/deletion/transformation, FK/dependency precedence, legal holds/exceptions, minimum proof fields/lifetime, and recursive audit treatment |
| Policy transitions                 | Effective time, grandfathering/re-consent, existing-data handling, rollback authority, and emergency transition rules                                               |

The decision record must identify approver authority, exact version, effective
scope, date, and affected policy package. Agent-generated prose, roadmap
placement, silence, a synthetic test, or a green build is not approval.

If activation later requires a protected signing key, provider role,
certificate, or environment grant, the affected path also stops under
`EXTERNAL_CREDENTIAL_REQUIRED`. Selecting a paid provider or accepting a paid
commitment requires `FINANCIAL_COMMITMENT_REQUIRED`. Neither condition permits
bypassing the legal/privacy decision.

## Alternatives considered

- **Boolean authorization result:** rejected because it loses denial reason,
  evaluated version, exact scope, and exhaustive handling.
- **Consent as the universal basis:** rejected because engineering cannot
  choose lawful basis and withdrawal consequences vary by approved policy.
- **Runtime self-registration as inventory:** rejected because an omitted store
  could incorrectly report complete coverage.
- **One generic processor interface with arbitrary payloads:** rejected because
  it creates an unbounded exfiltration/deletion surface and defeats strict
  contracts.
- **Unbounded database cascade for deletion:** rejected because it cannot prove
  processor coverage, exceptions, partial failure, backups, or recovery.
- **Retention execution during evaluation:** rejected because a query or policy
  mistake would become immediately destructive.
- **Best-effort audit:** rejected for governed allows and destructive work
  because missing evidence could conceal a consequential action.
- **Generic audit metadata:** rejected because it becomes a second sensitive-
  payload store.
- **Treating append-only governance history as permanent retention:** rejected
  because ordinary immutability cannot override an approved retention,
  deletion, or irreversible-transformation rule for linkable metadata.
- **Ordinary application role deleting governance records:** rejected because
  it bypasses policy, legal holds, dependency order, minimal proof, audit, and
  recovery. Only the restricted lifecycle processor may perform that work.
- **Production cache in the first slice:** deferred because immediate
  withdrawal authority is simpler without cache and no invalidation bound is
  approved.
- **Public privacy endpoints now:** rejected because PRD 07 identity and
  principal-to-domain mapping are not available.
- **Microservice, workflow engine, message bus, or external policy engine:**
  rejected as unearned complexity. Typed domain state machines and PostgreSQL
  are sufficient for the authorized synthetic slice.
- **Hard-coded production policy:** rejected because it would turn engineering
  assumptions into unattributed legal/privacy decisions.

## Known limitations

- This design specifies a technical control plane, not legal compliance or
  legal advice.
- The current inventory baseline is a design-time observation and must be
  regenerated and independently reviewed on the exact implementation candidate.
- No production policy value, legal approver, jurisdiction, retention period,
  deletion scope, provider, region, key, or credential is available.
- No public privacy UX or authenticated request workflow exists until PRD 07
  and approved legal wording/behavior are composed through Fastify.
- Synthetic actor and subject contexts prove state-machine behavior but not
  real identity assurance or authorization.
- Provider-neutral fakes do not prove a future external provider's deletion,
  export, timeout, backup, or residency behavior.
- Audit minimization reduces copied sensitive data but audit metadata remains
  potentially linkable and subject to its own approved lifecycle.
- The governance lifecycle path is exercised only with synthetic authority and
  disposable data; it remains absent/hard-disabled in production until exact
  rules, holds/exceptions, proof semantics, role provisioning, backup behavior,
  and recovery evidence are approved.
- Destructive synthetic recovery cannot prove recovery for real production
  data or establish that deleted data can be restored.
- A passing policy-agnostic Gate A does not satisfy production readiness or the
  PRD 21 completion criteria while `LEGAL_PRIVACY_DECISION_REQUIRED` remains.

## Gate A evidence required

- Exact candidate SHA and clean diff against the intended base.
- Independent approval of this Technical Design before contract freeze.
- Frozen executable contracts with consistent schemas, domain ports,
  persistence adapters, tests, and human contract registry.
- Exact repository-derived processor inventory, independent coverage review,
  table/record-family-complete governance lifecycle mapping, and proof that
  missing/extra/mismatched processors, handlers, or approved exceptions fail
  readiness.
- TDD evidence for exhaustive denial, evidence immutable to ordinary mutation,
  withdrawal races, request partial failure/resume, preview/execution
  separation, minimized audit, restricted governance lifecycle dependency
  order, holds, exceptions, minimal proof/audit recursion, reconciliation, and
  synthetic policy/authority production rejection.
- Green pinned formatting, lint, typecheck, unit/integration tests, build,
  repository check, dependency/secret scan, and exact-head CI.
- PostgreSQL migration, constraint, concurrency, drift, forward-correction, and
  recovery evidence preserving unrelated data when migrations are applicable,
  including ordinary/ad hoc mutation denial and authorized synthetic lifecycle
  only through the restricted disposable-data path.
- Static architecture evidence for modular-monolith, dist-first, Fastify,
  web/domain/database, provider-adapter, no-public-route, and single-migration-
  owner boundaries.
- Security/privacy pass proving no real data, policy text, legal assertion,
  secret, arbitrary audit payload, permissive fallback, or destructive
  production capability entered the bounded slice.
- Scope pass proving no PRD 07 identity/onboarding, PRD 08/09/11/14 body
  workflow, PRD 18 coach workspace, PRD 23 telemetry policy, provider/vendor,
  public UX, or production activation was added.
- Durable stop record stating `LEGAL_PRIVACY_DECISION_REQUIRED`, the exact
  missing decision packet, and the paths that remain disabled.
- Independent Agent 90 and QA/security reports for the exact integrated head,
  zero known `BLOCKER`, zero known `HIGH`, and every deferral visible.

Gate A for a policy-agnostic foundation passes only when every applicable check
passes or has a justified `NOT_APPLICABLE` disposition. It does not authorize
real-data processing, production privacy readiness, or PRD 21 completion.

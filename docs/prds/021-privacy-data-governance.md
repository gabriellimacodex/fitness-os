# PRD 21 — Privacy & Data Governance

- Status: `APPROVED`
- Approval basis: Inherited from approved parent PRD under Autonomous Pilot V1 authorization
- Parent registry outcome: Enforced consent, access, retention, deletion, audit, and data-use controls
- Dependencies: PRD 02 — `COMPLETED`
- Release gate: Gate A
- Pre-flight: Independent privacy/security and architecture review required before executable contract freeze
- Stop boundary: Policy-agnostic design and synthetic-data implementation may proceed; material legal or privacy policy choices require `LEGAL_PRIVACY_DECISION_REQUIRED`

## Context

PRD 02 established minimal opaque student, coach, and historical student–coach
link records. It deliberately did not define consent, sharing, retention,
deletion, residency, data-subject rights, or authorization policy. Later Fitness
OS capabilities will handle training history, measurements, body photos, body
models, progress media, and coach-visible student information. Privacy cannot be
added after those capabilities begin collecting data.

PRD 21 is therefore a dependency of body capture, progress photos, pilot
observability, and the Pilot Release Candidate. It provides a governed,
fail-closed control plane for data use and lifecycle decisions. It does not
create the legal or privacy policy that the control plane enforces.

## Problem

Fitness OS has no shared mechanism to answer, prove, or enforce:

- why a datum may be collected or used;
- whether the required permission or other approved authority is current;
- which actor may use a student's private data for which purpose;
- what data is held for a subject and where it is processed;
- how an access, export, or deletion request progresses;
- when an approved retention rule becomes due and how it is applied safely; or
- which privacy-relevant decision occurred without logging the sensitive payload.

If each later PRD invents these rules locally, withdrawal may not propagate,
data use may exceed its declared purpose, deletion may be partial or unsafe,
and audit logs may become a second sensitive-data store.

## Users

- Students managing the permitted uses and lifecycle of their private data.
- Coaches whose access must be limited to an authenticated, authorized purpose
  and must not be inferred from possession of an ID or a relationship row alone.
- Authorized support/privacy operators processing governed data-subject
  requests without receiving blanket access to product data.
- Engineers and security reviewers integrating later capabilities with one
  privacy enforcement boundary.

No public student, coach, or operator workflow is introduced until a separately
approved identity/onboarding capability provides an authenticated principal,
principal-to-domain mapping, and appropriate authorization context.

## Outcome

Fitness OS has explicit, versioned, and testable privacy-governance contracts
and backend mechanisms that:

- minimize collected and derived data and bind each allowed use to an active,
  approved purpose;
- preserve consent or other authorization evidence as immutable history while
  enforcing withdrawal prospectively;
- deny use when required policy inputs are absent, inactive, expired, or
  inconsistent;
- inventory subject data across registered in-scope stores;
- coordinate access, export, deletion, and retention work through idempotent,
  auditable state machines;
- keep audit evidence useful without copying sensitive business payloads; and
- expose missing legal/privacy policy as an explicit deployment blocker rather
  than a permissive default.

## Scope

- Define an engineering data inventory and purpose registry with stable,
  versioned identifiers and activation state.
- Define policy-agnostic executable contracts for purpose-bound data-use
  decisions, permission evidence, withdrawal, data-subject requests, retention
  rules, lifecycle execution, and privacy-safe audit events.
- Implement a domain-owned privacy decision service that evaluates explicit
  actor, subject, operation, data category, purpose, policy version, and
  evidence inputs and returns a typed allow or deny outcome.
- Implement append-only permission/consent evidence and a one-way withdrawal
  transition without rewriting the text or version originally accepted.
- Implement a registry of in-scope data processors/stores. Each registered
  component declares inventory, export, deletion, and retention capabilities;
  unregistered stores cannot claim privacy-readiness.
- Implement access/export/deletion request orchestration with idempotency,
  explicit partial-failure states, resumable steps, and immutable transition
  history.
- Implement retention evaluation, preview, and execution against active,
  human-authorized policy parameters, with destructive actions separated from
  evaluation and protected by recovery controls.
- Implement privacy-safe audit events for policy decisions and lifecycle
  transitions without copying body media, health/training values, free text,
  credentials, tokens, or exported data.
- Provide readiness checks that fail closed when required policy packages,
  processor registrations, handler coverage, or version integrity are missing.
- Validate all mechanisms with synthetic data and disposable infrastructure.
- Document the policy package and decision record that an authorized human or
  legal reviewer must supply before affected production paths can activate.

## Non-scope

- Selecting a jurisdiction, lawful basis, legal classification, controller or
  processor role, representative, data protection officer, or regulatory regime.
- Authoring or approving privacy notices, consent language, terms, disclosures,
  age gates, parental permission language, or data-subject communications.
- Choosing exact retention, grace, backup purge, legal-hold, export expiry, or
  request-response periods.
- Deciding whether minors may use the product or how age-dependent authority is established.
- Authorizing secondary use, advertising, sale, affiliate sharing, research,
  analytics beyond an approved purpose, or model training.
- Selecting vendors, subprocessors, cloud regions, residency, cross-border
  transfer mechanisms, credentials, certificates, paid services, or contractual terms.
- Implementing authentication, account recovery, onboarding, invitations, or
  principal-to-student/coach identity mapping from PRD 07.
- Defining body capture, body model, Body Intelligence, Digital Twin, progress
  photo, or downstream body-image experiences from PRDs 08, 09, 11, or 14.
- Defining coach workspace workflows or broad coach-sharing policy from PRD 18.
- Defining pilot telemetry content or observability retention from PRD 23.
- Providing legal advice or treating generated text, tests, or an agent review
  as legal approval.
- Deleting or transforming real data during implementation or validation.

## UX

The eventual student experience is mobile-first and uses plain language. It
must show each activated purpose separately, identify the current notice or
permission version, distinguish required product processing from optional uses
when an approved policy makes that distinction, and make withdrawal and request
status as discoverable as granting permission. It must not use preselected
optional choices, bundled choices that obscure materially different purposes,
or dark patterns.

The eventual coach experience is desktop- and tablet-friendly. It shows only
student data allowed by the evaluated policy for the current purpose. It does
not imply that an active student–coach link alone grants access, and it must
surface loss of access after withdrawal, link termination, or policy change
without exposing private reasons.

An authorized operator view, when later composed with identity and
authorization, shows request identifiers, step status, processor coverage,
deadlines supplied by approved policy, and redacted failure information. It
does not provide a generic data browser or reveal export contents.

This PRD may define and test view-model contracts with synthetic data. It does
not expose these views publicly or choose final legal wording before the
required human/legal determinations are recorded.

## Business rules

### Data minimization and purpose limitation

- Every governed collection or use declares a stable purpose identifier, an
  engineering data category, the requested operation, the actor context, and
  the subject scope before data access.
- A purpose definition is immutable once activated. A change creates a new
  version and does not silently rewrite prior evidence.
- Only an explicitly approved and activated policy version can produce an
  allow decision. Missing, unknown, inactive, superseded-without-transition,
  or integrity-invalid policy input denies the operation.
- A broad label such as `product improvement`, `analytics`, or `AI` is not a
  technical substitute for an approved, bounded purpose definition.
- Data collected for one purpose is not reused for another purpose merely
  because the same service can access it.
- New stores and processors register their data category, purpose bindings,
  subject lookup strategy, export/delete/retention handlers, and responsible
  code owner before readiness may pass.

### Permission, versioning, and withdrawal

- The mechanism supports versioned evidence for permission or consent when an
  approved policy requires it. It does not assume that consent is the lawful
  basis for every purpose.
- Evidence records the subject, purpose version, notice/content digest,
  evidence source, decision, server-controlled timestamp, and provenance needed
  to verify what occurred. Raw notice text is versioned outside the event and
  referenced by digest; it is not copied into every audit record.
- Withdrawal is a one-way, timestamped event associated with the original
  evidence. It never deletes or edits the historical evidence.
- Withdrawal takes effect for future evaluations as soon as the authoritative
  backend transition succeeds. Caches and asynchronous consumers must use a
  bounded invalidation mechanism defined before production activation.
- Withdrawal does not silently choose whether previously processed data must
  be erased, retained, or restricted. That consequence comes from an approved
  policy and, while unresolved, activates `LEGAL_PRIVACY_DECISION_REQUIRED`.
- Re-consent or permission renewal creates new evidence against an approved
  version; it never reopens or overwrites a withdrawn record.

### Access, export, and deletion requests

- Requests use opaque IDs, a server-controlled clock, idempotency protection,
  and an append-only transition history.
- Request types are access, portable/export representation, and deletion. A
  type does not imply a legal entitlement, scope, format, or deadline until an
  approved policy supplies those parameters.
- Identity/authority verification is required before a real request can reveal
  or destroy data. Failure or absence of verification denies fulfillment
  without leaking whether a subject exists.
- Inventory is assembled only from registered processors. Missing required
  processor coverage leaves the request incomplete and visible; it cannot be
  represented as fully fulfilled.
- Export packages contain only authorized subject data, a machine-readable
  manifest, source/version metadata, and per-file integrity digests. Delivery
  uses a protected, expiring mechanism selected later; logs never contain the
  package or delivery secret.
- Deletion is an orchestrated lifecycle, not an unbounded database cascade. A
  processor reports deleted, irreversibly transformed under an approved rule,
  retained under an approved exception, not found, retryable failure, or
  permanent failure.
- A retained exception must cite an active approved rule. `Keep everything`,
  an absent handler, or an operational error is not a retained exception.
- The minimal proof that a request and processor action occurred is separate
  from the sensitive payload. Whether and how long that proof may remain is an
  explicit policy parameter.

### Retention enforcement

- Retention rules are versioned inputs that bind a data category and purpose to
  a start trigger, duration or event condition, action, exception handling, and
  policy provenance.
- No exact period or legal-hold rule is inferred by engineering. An unconfigured
  rule cannot default to indefinite retention or immediate deletion.
- Evaluation and destructive execution are separate operations. Evaluation
  produces a deterministic preview with counts and opaque work identifiers,
  not sensitive record payloads.
- Production execution requires an active approved policy version, exact
  environment binding, idempotency, bounded batches, concurrency controls,
  audit evidence, and an exercised recovery plan.
- Historical facts remain immutable until an approved deletion or
  transformation rule applies. Code history immutability does not override an
  authorized data-rights decision, and a deletion right does not authorize
  engineering to erase evidence or relational integrity indiscriminately.
- Backups and replicas are included in lifecycle coverage. Their purge,
  restore-filter, or re-deletion behavior must be explicitly approved and
  validated before production readiness.

### Access control and coach data

- IDs and student–coach links are policy inputs, never credentials or complete authorization.
- Every data-use decision requires an authenticated actor context supplied by a
  separately approved identity boundary. No actor context means deny.
- Student data is private by default. Coach access requires an active applicable
  relationship plus an explicit approved purpose and authorization policy;
  either input alone is insufficient.
- Access is least privilege by operation, purpose, subject, and data category.
  Support/privacy operations use distinct permissions from coach access.
- Body photos, body models, measurements, and derived physical data remain
  private by default. This PRD supplies only governance hooks; downstream PRDs
  must define their own scoped data contracts and may not bypass these checks.

### Audit and observability

- Privacy audit is append-only and records policy/evidence version, operation,
  outcome, stable reason code, correlation ID, trusted timestamp, and the
  minimum protected actor/subject reference needed for investigation.
- Audit events exclude request/response bodies, media, measurements, training
  values, free text, notice text, export contents, database errors, credentials,
  secrets, and signed delivery URLs.
- Routine application logs use operation, outcome, duration, correlation, and
  redacted error classification. They do not duplicate the privacy audit ledger.
- Audit access is separately authorized and audited. Audit data remains subject
  to its own approved retention and deletion policy.
- A failure to write mandatory audit evidence causes the governed mutation or
  destructive step to fail atomically when feasible. Any approved exception
  must be explicit, narrow, and tested; no best-effort default is assumed.

## Data

The detailed executable shapes are frozen later in `packages/schemas`, but the
contract groups are bounded here:

- Purpose and policy definition: stable purpose/policy/version identifiers,
  status, content digest, allowed engineering categories and operations,
  effective window supplied by approved policy, and policy provenance.
- Permission evidence: stable evidence ID, subject scope, purpose/policy
  version, decision, evidence source, notice/content digest, trusted timestamp,
  and immutable provenance.
- Withdrawal evidence: stable withdrawal ID, referenced evidence ID, trusted
  timestamp, provenance, and explicit processing outcome.
- Data-use evaluation: actor context, subject scope, purpose, data category,
  operation, policy version, and required evidence references; result is
  `allowed` or a typed deny reason with the evaluated version.
- Processor registration: stable processor ID, code owner, declared categories
  and purposes, subject lookup capability, supported lifecycle handlers, and
  registration version/digest.
- Data-subject request: stable request ID, subject scope, request type,
  verification state reference, policy version, lifecycle state, trusted
  timestamps, and processor step summaries.
- Retention rule and work item: stable rule/version, category, purpose,
  approved trigger/action parameters, provenance, evaluation watermark, opaque
  item ID, result, and retry state.
- Privacy audit event: stable event ID, operation, outcome, reason code,
  policy/evidence version references, minimum protected actor/subject locator,
  correlation ID, and trusted timestamp.

These are governance records, not permission to collect new profile, contact,
body, health, training, or behavioral data. Subject locators and opaque IDs may
still be personal data when linked to a person and are protected accordingly.
Strict schemas reject unknown keys, raw payload fields, credentials, free text,
and caller-controlled trusted timestamps.

Engineering categories are routing and minimization controls, not legal
classifications. The initial taxonomy must be reviewed against the real data
inventory and may not be represented as a regulatory classification without
authorized human/legal determination.

## Contracts

`packages/schemas` remains the executable Source of Truth and `docs/contracts`
the human freeze registry. Contract freeze follows independent pre-flight
review and may include:

- branded IDs and strict schemas for purpose, policy version, permission
  evidence, withdrawal, processor registration, data-subject request,
  retention work, and privacy audit events;
- typed data-use decision inputs and deny reasons;
- typed lifecycle states and processor step outcomes;
- domain-owned ports for the policy repository, permission ledger, processor
  registry, request coordinator, retention evaluator/executor, and audit sink;
  and
- readiness diagnostics that expose safe classifications and versions, never
  policy text, subject identifiers, or sensitive payloads.

Public HTTP contracts are not authorized by this PRD because an authenticated
principal and principal-to-domain mapping belong to PRD 07. A future approved
consumer may expose these services only through Fastify with separately frozen
request/response schemas and explicit authorization. Web code never imports
domain or database packages and never accesses PostgreSQL directly.

Policy content is a protected, versioned deployment input, not hard-coded legal
truth. The loader verifies strict shape, digest, activation state, environment,
and rollback-safe version monotonicity before any policy can become active.
Synthetic test policies are clearly marked and rejected by production
readiness.

## Security and privacy

- Deny by default on absent actor, subject scope, purpose, policy, evidence,
  processor registration, handler coverage, or integrity verification.
- Separate policy administration, request processing, audit inspection, and
  ordinary product access. No administrative super-role is inferred.
- Validate all boundary inputs and use parameterized persistence operations.
- Encrypt protected data in transit and at rest using the approved platform
  controls available at implementation time; key provider, rotation, and
  residency choices are not selected here.
- Keep protected policy administration and destructive lifecycle commands out
  of public product routes and ordinary application credentials.
- Require idempotency and transactional or compensating behavior for permission
  transitions, request steps, and retention/deletion work.
- Redact database, provider, policy-document, subject, and secret detail from
  public errors and routine logs.
- Use synthetic fixtures only. No production data, body media, health/fitness
  data, exported account data, or real legal notice enters tests or migrations.
- Scan committed history and build artifacts for secrets and sensitive fixture leakage.
- Apply least privilege to database roles, storage access, audit reads, policy
  activation, export generation, and deletion execution.
- Treat caches, queues, replicas, backups, exports, logs, and audit stores as
  explicit data locations in lifecycle coverage, not invisible implementation details.
- Keep future storage, identity, notification, analytics, and body providers
  behind adapters and subject them to processor registration before use.

## Legal/privacy decision matrix and stop boundary

The following parameters cannot be supplied by an agent or inferred from the
roadmap. When one becomes necessary for contract activation, implementation
behavior, a migration over real data, production deployment, or completion
evidence, the affected path stops under `LEGAL_PRIVACY_DECISION_REQUIRED`.

| Decision or parameter                               | Minimum determination required before activation                                                                         | Affected rights or paths                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Applicable jurisdictions and regulatory assumptions | Where relevant actors and processing are located and which approved rules govern                                         | All policy packages, notices, rights workflows, residency   |
| Product legal roles                                 | Authorized controller/processor and other accountable roles; any required representative or DPO determination            | Policy ownership, requests, vendor relationships, audit     |
| User eligibility and minors                         | Whether minors are permitted, applicable age thresholds, and who may grant/withdraw authority                            | Onboarding dependency, consent, access, deletion, body data |
| Data inventory legal classification                 | Approved classification of identity, relationship, training, body, media/model, derived, governance, and telemetry data  | Safeguards, notices, retention, sharing, rights scope       |
| Purpose specification                               | A bounded purpose for each collection/use and whether it is required or optional                                         | Collection, evaluation, UX, downstream processing           |
| Lawful basis or authority by purpose                | Approved basis and evidence requirements for each purpose/category; consent must not be assumed universally              | Policy evaluation, evidence, withdrawal consequences        |
| Notice and consent content                          | Approved wording, locale/version, presentation requirements, and effective transition                                    | Student UX, evidence digest, re-consent                     |
| Withdrawal consequences                             | When future use stops and whether existing data is deleted, restricted, retained, or re-evaluated                        | Runtime authorization, caches/queues, lifecycle requests    |
| Student–coach sharing                               | Which categories/operations a coach may access, for which purpose, and what happens on withdrawal or link end            | Coach access and PRD 18 integration                         |
| Third-party and affiliate sharing                   | Approved recipients, roles, purposes, disclosures, contractual protections, and termination behavior                     | Provider registration and adapters                          |
| Secondary use                                       | Whether analytics, research, personalization, model training, or other reuse is allowed per category/purpose             | PRD 23 and any AI/data pipeline; default remains denied     |
| Automated decision-making                           | Which processing is considered consequential and what explanation, objection, or human review is required                | Training/body downstream decisions; Product Principle PP-04 |
| Retention schedule                                  | Trigger, exact duration/event, action, exceptions, and evidence for every category/purpose                               | Retention evaluator/executor, audit, exports, backups       |
| Deletion semantics                                  | Scope, verification, exceptions, irreversible transformation rules, relational-history treatment, and proof retained     | All processors and PRD 02 identifiers/links                 |
| Legal hold or preservation                          | Who may authorize a hold, affected scope, precedence, review, expiry, and release                                        | Retention and deletion execution                            |
| Access/export right parameters                      | Eligibility, identity assurance, scope, format obligations, delivery method, response timing, and denial/appeal handling | Request orchestration and eventual student UX               |
| Request-agent authority                             | Whether and how guardians, representatives, or other agents may act for a subject                                        | Verification and request fulfillment                        |
| Residency and cross-border transfer                 | Approved regions, transfer basis/safeguards, and prohibited locations                                                    | Database, storage, providers, backups, logs                 |
| Backup and replica lifecycle                        | Approved purge or restore-filter behavior and timing after deletion/retention actions                                    | Recovery and deletion completion claims                     |
| Privacy audit lifecycle                             | Authorized viewers, minimum subject/actor locator, exact retention, deletion/exception behavior, and disclosure rules    | Audit store and investigations                              |
| Incident or legally compelled disclosure policy     | Authorized decision path, minimum disclosure, preservation, notification responsibility, and evidence                    | Exceptional access and audit; no agent-selected procedure   |
| De-identification standard                          | Approved transformation, residual re-identification threshold, permitted use, and re-identification prohibition          | Any retained analytics/research data or deletion outcome    |
| Policy transition                                   | Effective time, grandfathering or re-consent requirements, handling of prior data/evidence, and rollback authority       | Deployment, existing users, all evaluators                  |

Until a listed determination is approved, the system may implement its strict
parameter shape, state machine, deny reason, synthetic tests, and readiness
failure. It may not activate a guessed value, process real data under it, write
legal copy, or claim the affected acceptance criterion complete.

The same path must also stop under `EXTERNAL_CREDENTIAL_REQUIRED` if a currently
required protected key, provider role, certificate, or environment grant is
missing, and under `FINANCIAL_COMMITMENT_REQUIRED` before an unapproved paid
service or contract is accepted. Those conditions do not permit bypassing the
legal/privacy determination.

## Safe work that may proceed before policy determination

- Data-flow and store inventory from repository code and synthetic fixtures.
- Threat modeling, data-minimization review, and processor coverage analysis.
- Strict schema and domain-port design for parameterized policy inputs and typed deny outcomes.
- Synthetic Red → Green tests for versioning, withdrawal, request states,
  retention preview, idempotency, audit minimization, and fail-closed readiness.
- Disposable-database migrations for governance records when they store no real
  user data and encode no guessed legal parameter.
- Adapter interfaces, local fakes, and provider-neutral lifecycle orchestration.
- Destructive-operation simulation and dry-run recovery exercises against
  synthetic disposable data.
- Documentation of the exact human/legal decision packet needed for activation.

## Work that must stop pending policy determination

- Freezing or activating contract values that assert a lawful basis, legal
  classification, jurisdiction, age rule, policy role, or legal deadline.
- Publishing notice/consent text or presenting it to real users.
- Enabling collection or use of real data for an unresolved purpose.
- Granting coach, support, affiliate, provider, analytics, research, or model-training access.
- Executing retention or deletion against real data without approved scope,
  timing, exceptions, backup behavior, and recovery evidence.
- Fulfilling a real access/export/deletion request without approved identity
  assurance, scope, delivery, and response rules.
- Choosing a production region, cross-border flow, subprocessor, or disclosure behavior.
- Marking privacy readiness, PRD completion, or a downstream gate `PASS` where
  a required policy input remains synthetic, missing, or unapproved.

## Failure modes

| Failure or ambiguity                                  | Required behavior                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Missing or invalid policy package                     | Readiness fails; governed use denies; no fallback policy                                     |
| Synthetic policy reaches production configuration     | Startup/readiness fails before governed processing                                           |
| Unknown purpose/category/operation                    | Typed deny before protected data access                                                      |
| Actor or subject mapping absent                       | Deny without confirming whether the target subject exists                                    |
| Evidence version or digest mismatch                   | Deny and emit redacted integrity audit event                                                 |
| Permission already withdrawn                          | Deterministic deny; original evidence remains immutable                                      |
| Concurrent grant/withdrawal                           | Serialize per evidence/purpose subject scope; withdrawal cannot be lost                      |
| Processor is unregistered or lacks a required handler | Readiness/request remains incomplete; no false completion                                    |
| Request replay                                        | Return the same request/result state under idempotency contract                              |
| Partial export/access failure                         | Preserve completed steps, expose safe incomplete state, resume idempotently                  |
| Export delivery expires or is accessed incorrectly    | Deny; do not log or disclose package location/token                                          |
| Partial deletion/retention failure                    | Stop affected batch, preserve step evidence, retry safely; never claim full deletion         |
| Retention rule missing or ambiguous                   | No destructive execution and no indefinite-retention assumption; activate legal/privacy stop |
| Audit write fails for mandatory event                 | Governed mutation/destructive step fails atomically where feasible; no silent success        |
| Audit payload contains prohibited field               | Reject before persistence and surface an internal safe error                                 |
| Policy version changes during work                    | Pin the request/job to one approved version; require explicit transition handling            |
| Database/provider unavailable                         | Typed internal dependency failure; no permissive allow and no data leakage                   |
| Migration fails                                       | Deployment stops; recover prior compatible state; do not edit applied migration              |
| Backup/replica coverage unknown                       | Deletion/retention completion remains blocked and visible                                    |
| Legal/privacy parameter is unresolved                 | `LEGAL_PRIVACY_DECISION_REQUIRED`; preserve privacy-by-default containment                   |

## TDD and verification plan

1. Freeze failing schema tests for strict policy/evidence/request/retention/audit
   shapes, nominal IDs, bounded fields, unknown keys, and prohibited payload data.
2. Add failing domain tests for deny-by-default evaluation, immutable versions,
   withdrawal races, exhaustive reason codes, request state transitions,
   idempotency, partial failures, and processor coverage.
3. Add failing privacy-minimization tests proving body/training values, free
   text, credentials, raw exports, and database/provider errors cannot enter
   routine logs or audit contracts.
4. Add failing migration tests against disposable PostgreSQL for append-only
   evidence, one-way transitions, referential integrity, active-version
   uniqueness, concurrency, and migration replay.
5. Add failing integration tests for multi-processor inventory, export,
   deletion, retention preview/execution, failure recovery, and readiness with
   missing/synthetic/invalid policy packages.
6. Implement only the policy-agnostic mechanics needed to pass those tests.
7. Run clean-worktree lint, formatting, typecheck, unit/integration tests,
   production build, repository check, migration drift/replay/recovery,
   dependency/secret scan, and independent review.

Tests use synthetic policies and data only. A green synthetic test proves the
mechanism, not the legality or approval of a production policy value.

## Acceptance criteria

1. The repository contains an independently reviewed inventory of every
   in-scope store/processor and its category, purpose binding, subject lookup,
   lifecycle handlers, and code owner; readiness fails for required gaps.
2. Frozen executable contracts are strict, versioned, bounded, reject unknown
   keys and prohibited payload fields, and remain consistent across schemas,
   domain ports, persistence adapters, and documentation.
3. Data-use evaluation denies before protected access when actor, subject,
   purpose, policy, required evidence, permission state, or processor integrity
   is absent or invalid; IDs/links alone never authorize access.
4. Purpose/policy definitions and permission evidence are immutable after
   activation/recording. Withdrawal is one-way, race-safe, immediately affects
   subsequent authoritative evaluations, and never rewrites history.
5. Access/export/deletion request orchestration is idempotent, pins an approved
   policy version, covers every registered required processor, resumes after
   partial failure, and cannot report full completion while a required step is
   missing, failed, or retained without an approved exception.
6. Export artifacts have a bounded manifest and integrity digests, contain only
   authorized synthetic test data in validation, and never expose delivery
   secrets or contents through logs/audit/public errors.
7. Retention evaluation is deterministic and separately previewable.
   Destructive execution requires an active approved rule, exact environment,
   bounded/idempotent work, mandatory audit, and validated recovery.
8. Privacy audit and routine observability contain the minimum decision and
   transition metadata and demonstrably reject sensitive payloads, free text,
   credentials, body/training values, exports, and raw dependency errors.
9. Synthetic policy packages are cryptographically/integrity distinguished
   from approved production packages and cause production readiness to fail.
10. The legal/privacy decision matrix is complete for every activated
    production path. Each required value is explicitly approved and
    attributable, or the affected path remains stopped under
    `LEGAL_PRIVACY_DECISION_REQUIRED` and is not represented as passing.
11. PostgreSQL migrations, when introduced, are additive, versioned, replay-safe,
    drift-free, independently owned, and validated with disposable data;
    applied migrations are never edited.
12. No real user data, body media, health/fitness data, legal notice, vendor,
    credential, paid commitment, public route, authentication behavior,
    onboarding workflow, body workflow, coach workspace, or PRD 23 telemetry
    content is introduced by the bounded implementation.
13. Pinned-tool lint, formatting, typecheck, unit/integration tests, build,
    repository check, applicable migration/recovery checks, and secret/dependency
    review pass on the exact candidate.
14. Agent 90 and independent QA/security report zero open `BLOCKER` or `HIGH`
    findings; architecture, scope, contracts, privacy, security, and applicable
    migrations are consistent.

## Completion criteria

PRD 21 may move to `COMPLETED` only when:

- all acceptance criteria are evidenced on the exact integrated candidate;
- every production policy parameter required by the delivered scope has an
  explicit attributable human/legal determination;
- no synthetic, missing, ambiguous, or agent-invented policy value is active;
- applicable migrations and destructive-operation recovery are validated;
- CI, architecture, QA, security, scope, contracts, documentation, and
  independent review pass with zero known `BLOCKER` and zero known `HIGH`;
- relevant PRs are merged and required documentation is current; and
- Gate A is recorded as passing without treating a stopped or unavailable
  legal/privacy determination as `NOT_APPLICABLE`.

Mechanism completion alone is not PRD completion if a required production
policy cannot be activated safely. A legal/privacy stop may leave reviewed,
mergeable policy-agnostic foundations complete while the PRD remains
`IN_PROGRESS` or `BLOCKED` according to the control-plane evidence.

## Metrics

- 100% of governed access paths tested to deny on every missing required policy input.
- 100% of in-scope processors registered with inventory plus applicable
  access/export/deletion/retention handler coverage.
- 100% of request steps represented by immutable transition evidence and a typed outcome.
- 100% of destructive test jobs previewed and idempotently recoverable against disposable data.
- 0 prohibited sensitive-payload fields accepted by audit or routine-log contracts.
- 0 production-ready policy packages containing synthetic or unattributed decision values.
- 0 known `BLOCKER` and 0 known `HIGH` findings at merge and completion gates.

These measure implementation and review evidence, not legal compliance,
absence of privacy risk, or perfect security.

## Technical constraints

- Preserve the modular monolith, Node.js 24.18.0, pnpm 10.24.0, strict
  TypeScript, Zod, PostgreSQL, Drizzle, Vitest, and dist-first package lifecycle.
- Shared executable contracts live in `packages/schemas`; domain-owned ports do
  not depend on Drizzle, PostgreSQL, Fastify, React, Next.js, or provider SDKs.
- Fastify remains the only future client-facing backend. Next.js remains a
  client and never imports domain/database packages or accesses storage directly.
- Prefer deterministic policy evaluation and state machines. Generative AI
  does not decide permission, retention, deletion, request entitlement, or legal wording.
- Provider-specific identity, storage, key, notification, analytics, and body
  behavior remains behind adapters and processor registration.
- Use one global migration owner. Applied migrations are immutable and
  corrections use a later migration.
- Destructive operations are bounded, idempotent, observable, environment-
  bound, and recoverable. Code rollback alone is not data recovery.
- No new production dependency, provider, secret, or infrastructure commitment
  is introduced without the applicable review and stop-condition handling.

## Dependencies and downstream boundaries

- PRD 02 — Student & Coach Domain: `COMPLETED`, including frozen opaque IDs,
  immutable relationship history, PostgreSQL migration evidence, and the rule
  that identifiers/links do not grant authorization.
- Product Principles PP-04 through PP-12, especially privacy by default,
  immutable history, deterministic behavior, provider adapters, explicit
  contracts, and earned complexity.
- Accepted ADRs 001–006 and Autonomous Delivery Control Plane governance.

PRD 21 does not depend on PRD 07 and must not absorb its identity/onboarding
scope. Policy-agnostic backend mechanisms can complete against synthetic actor
contexts. Public self-service composition waits for PRD 07's authenticated
principal and mapping contracts.

PRDs 08 and 14 may not begin body-image runtime work until PRD 21 completes.
They must add their exact data categories, purposes, processor registrations,
and lifecycle handlers under approved policy. PRD 23 must use privacy-safe
telemetry purposes and retention rules without importing sensitive payloads.
PRD 24 requires PRD 21 complete and evaluates the integrated privacy behavior
under Gate D. These relationships do not authorize PRD 21 to design their
product workflows.

## Recovery and rollback

- Before merge, discard/revert policy-agnostic code and recreate disposable
  stores; no real data is touched.
- A policy package activation is versioned and append-only. Rollback activates
  an explicitly approved compatible version; it never edits or deletes the
  evidence of the superseded version. Whether rollback is legally permitted
  for existing data is part of policy-transition approval.
- Failed permission or request transitions preserve the last committed state
  and retry idempotently. They do not infer success from a timeout.
- Retention/deletion execution records a preflight preview and per-processor
  result. A failure stops the affected bounded batch and preserves evidence for
  safe retry or roll-forward.
- No automatic restoration of data deleted under an approved rule is promised.
  Backups, restore filtering, and re-deletion behavior must be approved and
  exercised before production execution.
- After an applied migration, do not edit migration history. Roll back
  application code to a compatible version and roll forward through a new
  additive/corrective migration. Destructive schema rollback requires proven
  emptiness or explicit authorized data recovery handling.
- Recovery evidence records exact code/policy/migration versions, environment,
  synthetic or approved data classification, commands/actions, result, and
  independent reviewer.

## Gate A

Gate A applies to every PR produced by PRD 21. Gate B and Gate C are not added
by this registry outcome. Downstream capabilities and the Release Candidate
retain their own applicable gates.

Gate A requires exact-head CI, meaningful tests, architecture, scope,
contracts, privacy/security, documentation, applicable migration/recovery
validation, and genuinely independent review. No builder may self-approve.
Open `BLOCKER` or `HIGH` findings prohibit merge. A policy-agnostic foundation
may pass its own Gate A while an accurately recorded legal/privacy stop keeps
production activation and PRD completion pending; the gate record must make
that boundary explicit.

## Known limitations

- This PRD defines technical governance and stop boundaries, not legal compliance or legal advice.
- Exact production policy parameters remain unavailable until attributable
  human/legal determinations are supplied.
- Public privacy controls require later authenticated identity composition from PRD 07.
- Body, coach-workspace, and observability integrations remain owned by their downstream PRDs.
- Audit minimization reduces copied sensitive data but does not make audit
  metadata anonymous or exempt from lifecycle governance.
- Passing tests and gates establishes bounded evidence and zero known serious
  findings; it cannot prove perfect privacy, security, or regulatory compliance.

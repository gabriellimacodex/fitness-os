# PRD 03 — Exercise Knowledge Base

- Status: `APPROVED`
- Approval basis: Inherited from approved parent PRD under Autonomous Pilot V1 authorization
- Parent registry outcome: Governed exercise knowledge and evidence-ready taxonomy
- Dependencies: PRD 01 — `COMPLETED`
- Release gate: Gate A

## Context

PRD 01 established schema-backed HTTP contracts, safe platform errors, request
correlation, readiness, and the Fastify client/API boundary. Training Core and
the later Training Evidence Engine need a stable way to identify exercises and
refer to the exact catalog revision they used. Without a governed catalog,
teams would encode exercise names, aliases, classifications, and source
references independently and silently change their meaning over time.

PRD 03 is dependency-ready on PRD 01 alone. PRD 02 and PRD 04 may proceed in
parallel and are not prerequisites for this capability.

## Problem

Fitness OS has no canonical exercise identity, immutable revision history,
governed classification vocabulary, persistence model, or safe read contract.
It also lacks a neutral place to record source locators for later evidence
review without presenting an unassessed locator as scientific support.

## User

- API and domain engineers who need stable exercise identifiers and revisions.
- Data and catalog maintainers who need reversible publication and archive
  operations.
- Future Training Core consumers that will reference a precise exercise
  revision.
- Future Training Evidence Engine consumers that may assess explicitly
  unassessed reference candidates.

This PRD creates no student or coach workflow and no catalog-authoring UI.

## Outcome

A minimal, persisted exercise catalog provides stable exercise identity,
immutable published revisions, a version-safe taxonomy, explicit provenance,
and read-only Fastify APIs. Catalog curation remains an internal transactional
boundary until a later PRD authorizes authenticated authoring. Optional source
locators are clearly labeled unassessed and cannot drive recommendations.

## Scope

- Define and freeze strict executable contracts for exercise identifiers,
  published revisions, catalog summaries/details, taxonomy terms, neutral
  reference candidates, pagination, and read queries.
- Add stable exercise records whose published content changes only by creating
  a new immutable revision.
- Add governed taxonomy dimensions and terms with stable keys, archive and
  replacement semantics, and revision-pinned exercise assignments.
- Establish the initial taxonomy dimensions `modality` and `equipment` without
  defining movement instruction, biomechanics, or training behavior.
- Record required revision provenance and optional DOI or HTTPS source locators
  as `unassessed` references.
- Add an internal transactional curation service for create/publish,
  archive/reactivate, taxonomy maintenance, and idempotent retry behavior.
- Add read-only Fastify endpoints for catalog listing, current exercise detail,
  immutable revision retrieval, and taxonomy discovery.
- Add PostgreSQL/Drizzle persistence, one owned forward migration, validation,
  recovery evidence, and database-backed readiness.
- Document contract ownership, lifecycle rules, operational recovery, tests,
  and known limitations.

## Non-scope

- Exercise instructions, technique cues, animation, video, images, progression,
  regression, contraindication, pain, injury, or safety guidance; those belong
  to PRD 04 or a later explicitly authorized capability.
- Workout construction, sets, repetitions, load, intensity, prescription,
  scheduling, adaptation, or recommendation behavior; those belong to PRD 05
  and later training PRDs.
- Evidence appraisal, claim extraction, study quality, confidence, grading,
  synthesis, recommendation traceability, or a versioned Evidence Base; those
  belong to PRD 15.
- Student, coach, tenant, ownership, permissions, authentication,
  authorization, or personalized data.
- Public or browser-accessible catalog mutation, an admin UI, bulk-edit UI, or
  user-generated exercises.
- Selecting, purchasing, scraping, or integrating a paid exercise, movement,
  academic, or citation provider.
- Fetching remote URLs, copying licensed source content, storing abstracts or
  quotations, or claiming that a syntactically valid locator is accurate.
- Product UI, search ranking, localization, offline catalog caching, analytics,
  AI generation, native clients, or deployment-provider selection.

## UX

No UI is added. Read contracts are suitable for later mobile-first and
desktop-friendly consumers, but this PRD does not decide how exercises are
presented. Responses use stable identifiers, bounded pagination, explicit
lifecycle state, and plain text only. An unassessed reference must never be
rendered as an endorsement, recommendation, or verified scientific citation.

## Business rules

- An exercise has a server-generated opaque identifier and an immutable,
  unique canonical key. Names and aliases are revisioned content, not identity.
- A published revision is immutable. A correction or classification change
  creates the next revision; it never updates an older revision in place.
- Publication is atomic. The catalog's current revision changes only after the
  new revision, taxonomy assignments, provenance, and reference associations
  all validate and commit.
- The same publication operation identifier and content hash is idempotent. A
  repeated identifier with different content fails without mutation.
- Concurrent publication uses an expected current revision and row-level
  serialization. A stale writer fails rather than overwriting newer content.
- Public catalog listing includes active exercises only. Direct lookup may
  return an archived exercise and any previously published revision so future
  historical consumers do not lose referential meaning.
- Archive is reversible through an explicit reactivate operation. Neither
  archive nor reactivate deletes or rewrites revisions or lifecycle events.
- Canonical exercise keys and taxonomy keys are never reused for different
  meanings, including after archive.
- Taxonomy term semantics are immutable. Corrections create a replacement term
  and archive the old term; published revisions keep their original term IDs.
- Initial dimensions are `modality` and `equipment`. Movement-pattern,
  muscle-target, body-region, technique, and safety vocabularies are not
  silently added by this PRD.
- Each published exercise revision has exactly one active modality term at
  publication time and zero or more equipment terms. Historical assignments
  remain valid if a term is later archived.
- Revision provenance identifies whether content was internally curated or
  derived from a recorded public locator and includes a change reason and
  timestamp. It does not claim scientific validity.
- DOI and HTTPS locators are syntax-validated but never fetched automatically.
  Every PRD 03 reference carries the literal assessment state `unassessed`.
- PRD 03 reference candidates cannot be used to calculate evidence strength,
  safety, exercise selection, or training recommendations. PRD 15 must create
  and version its own assessed evidence records before such use.
- The public HTTP surface is read-only. Internal curation is not a bypass
  around future authentication or authorization; exposing it requires later
  approved scope and security review.
- All clients use Fastify. Web code never imports the database package.

## Data

PRD 03 introduces non-personal catalog data only:

- stable exercise identity and lifecycle state;
- immutable published exercise revisions containing display name, aliases,
  neutral catalog description, provenance, and content hash;
- stable taxonomy dimensions and terms;
- revision-to-term assignments;
- neutral source-reference candidates containing only a kind, canonical
  locator, purpose, and literal `unassessed` state;
- revision-to-reference associations; and
- append-only lifecycle events and publication operation identifiers.

No student, coach, body, health, biometric-like, credential, or behavioral data
is stored. Production seed content, if supplied, must be version-controlled,
plain, provenance-labeled, independently reviewed, and free of technique,
safety, medical, or evidence claims. Synthetic fixtures are never represented
as production knowledge.

## Contracts

The executable Source of Truth will be added to `packages/schemas` and frozen
before provider or consumer implementation. Proposed contract responsibilities
include:

- branded exercise, revision, taxonomy-dimension, taxonomy-term, and reference
  identifiers;
- lifecycle, taxonomy, provenance, and unassessed-reference value schemas;
- exercise summary, detail, immutable revision, taxonomy-catalog, and paginated
  list response schemas;
- strict route-parameter and bounded cursor-query schemas; and
- inferred TypeScript types for every shared shape.

Exact symbols and fields are frozen in executable schemas during the contract
wave, then referenced from `docs/contracts/README.md`; prose does not become a
second runtime definition. PRD 03 reuses the frozen platform error envelope and
existing codes. It does not broaden or reinterpret PRD 01 error semantics.

## Security/privacy

- All public mutation methods are absent; unsupported methods return the safe
  platform not-found contract.
- Identifiers are opaque and carry no user identity or secrets.
- Route parameters, cursors, filters, keys, names, aliases, descriptions,
  reasons, and locators have strict type, count, and length limits.
- Catalog text is plain data. APIs never return stored HTML, executable markup,
  database exceptions, SQL, source credentials, or internal stack traces.
- Reference URLs are not fetched, followed, previewed, or used for server-side
  requests, preventing this capability from becoming an SSRF or scraping path.
- Logs contain request and stable entity identifiers where useful, but not raw
  descriptions, locators, database credentials, or exception details in public
  responses.
- Database credentials remain environment-managed and are never committed.
- Readiness reports only ready/not-ready and never database host, schema,
  migration, or connection details.
- No personal or sensitive data is introduced. A later addition of private
  catalog ownership or user-generated content requires separate privacy and
  authorization scope.

## Failure modes

- Invalid IDs, cursors, filters, limits, or unsupported taxonomy combinations
  return the safe `BAD_REQUEST` envelope.
- Unknown exercises, unpublished records, or unknown revisions return the safe
  `NOT_FOUND` envelope without revealing internal lifecycle state.
- Archived exercises disappear from default lists but remain directly
  retrievable with their explicit archived state.
- Database unavailability makes readiness not-ready and catalog reads return a
  generic `SERVICE_UNAVAILABLE` envelope without connection details.
- Corrupt stored data or response-schema mismatch fails closed, is logged with
  request correlation, and returns the generic internal-error envelope.
- An invalid, duplicate, archived, or wrong-dimension taxonomy term prevents
  publication atomically.
- A stale expected revision, reused operation identifier with different
  content, or canonical-key collision rejects the internal operation without
  partial writes.
- A same-operation retry with identical content returns the original result and
  creates no duplicate revision, association, or lifecycle event.
- A malformed or unsupported locator is rejected. Network availability never
  affects publication because PRD 03 does not fetch the locator.
- Archive/reactivate retries are idempotent, and a failed transaction leaves
  lifecycle state and events unchanged.
- Migration failure stops startup or deployment before catalog traffic. Applied
  migrations are never rewritten; recovery follows the approved forward-fix or
  restore procedure.

## Acceptance criteria

1. Proposed shared identifiers, queries, taxonomy, exercise responses,
   provenance, and unassessed-reference shapes are frozen as strict Zod schemas
   before dependent implementation, with provider/consumer tests and registry
   ownership updated together.
2. PostgreSQL migrations create the catalog, revision, taxonomy, reference,
   association, lifecycle, uniqueness, and index constraints from a clean
   database and are validated against the exact migration metadata.
3. The internal curation service transactionally publishes a first revision,
   publishes a later immutable revision, detects stale concurrent publication,
   and provides content-safe idempotent retries.
4. Published revision content and taxonomy assignments cannot be updated or
   hard-deleted through the domain/repository API. Archive and reactivate retain
   all prior revisions and append lifecycle evidence.
5. Taxonomy terms have stable non-reusable keys and immutable semantics;
   replacement/archive behavior preserves historical revision assignments.
6. Every published revision has valid required provenance, exactly one modality
   term, valid equipment assignments, and only syntactically valid references
   whose assessment is explicitly `unassessed`.
7. `GET /exercises`, `GET /exercises/:exerciseId`,
   `GET /exercises/:exerciseId/revisions/:revision`, and
   `GET /exercise-taxonomy` return only schema-valid payloads with bounded,
   deterministic pagination where applicable.
8. Public APIs expose no mutation path, and method, validation, not-found,
   unavailable-storage, corrupt-data, and unexpected-error tests preserve the
   PRD 01 error envelope and server-generated request correlation.
9. Database readiness returns not-ready without details when the catalog
   dependency is unavailable and returns ready only after required migrations
   and a minimal dependency check succeed.
10. Migration verification covers clean apply, exact schema constraints,
    idempotent deployment behavior, failure interruption, backup/restore or
    forward-fix recovery, and protection against destructive rollback after
    catalog data exists.
11. No implementation, seed, contract, or documentation adds movement guidance,
    training behavior, evidence appraisal, a paid provider, user data, public
    authoring, product UI, or a dependency on PRD 02 or PRD 04.
12. TDD evidence, lint, formatting, typecheck, unit/integration tests,
    production build, repository check, security/architecture/scope review,
    migration validation, independent Agent 90 review, and exact-head CI all
    pass with zero known `BLOCKER` or `HIGH` findings.

## Metrics

- 100% of shared PRD 03 request/response variants have executable schemas and
  automated contract tests.
- 100% of published exercise revisions have immutable identity, required
  provenance, a content hash, and one modality assignment.
- 100% of stored PRD 03 source locators are syntax-valid and labeled
  `unassessed`; 0 are presented as evidence grades or recommendations.
- 0 supported operations hard-delete or rewrite published revisions,
  historical taxonomy assignments, or lifecycle events.
- 0 duplicate revisions or lifecycle events are produced by tested identical
  operation retries.
- 0 known `BLOCKER` and 0 known `HIGH` findings at merge.

## Technical constraints

- Preserve Node.js 24.18.0, pnpm 10.24.0, TypeScript strict mode, Fastify, Zod,
  PostgreSQL, Drizzle, Vitest, and the dist-first workspace lifecycle.
- Remain one modular monolith. Domain code cannot import Fastify or Drizzle;
  persistence implements domain-owned ports.
- Browser and Next.js code cannot import domain or database internals.
- Use the existing PRD 01 request-ID, validation provenance, safe error, CORS,
  and readiness boundaries rather than adding a parallel platform layer.
- Add no external provider, crawler, queue, search engine, cache, object store,
  AI dependency, or generic repository framework.
- New dependencies require narrow justification and exact pins. Prefer the
  existing stack.
- Exactly one assigned data task owns the migration. Concurrent migration
  generation and rewriting an applied migration are prohibited.

## Dependencies

- PRD 01 — Platform Foundation: `COMPLETED`.
- Product Principles, accepted ADRs 001–006, frozen platform contracts, and the
  Autonomous Delivery Control Plane.
- PostgreSQL and Drizzle already selected by ADR 001; no provider or financial
  decision is introduced.

PRD 03 has no dependency on PRD 02 or PRD 04. PRDs 03 and 04 may proceed in
parallel with non-overlapping contracts. PRD 05 may later consume stable
exercise and revision identifiers only after its own dependencies and gate are
satisfied. PRD 15 may later assess reference candidates and build a versioned
Evidence Base; PRD 03 does not pre-authorize that work.

No current stop condition applies. Production credentials are not required for
contract, domain, migration, or injected integration validation. If a later
mandatory deployment gate requires unavailable database access, the applicable
credential stop is evaluated at that time rather than guessed here.

## Release gate

Gate A applies. The registry requires no Gate B or Gate C milestone for PRD 03.
Completion requires every acceptance criterion, validated migration and
recovery evidence, green exact-head CI, independent Agent 90 and QA/security
passes, architecture/security/scope passes, consistent frozen contracts,
updated documentation, merged relevant PRs, and zero known `BLOCKER` or `HIGH`
findings. Passing PRD 03 does not authorize PRD 05 or PRD 15 and does not waive
PRD 04 for capabilities that actually depend on movement guidance.

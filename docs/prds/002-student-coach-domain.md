# PRD 02 — Student & Coach Domain

- Status: `APPROVED`
- Approval basis: Inherited from approved parent PRD under Autonomous Pilot V1 authorization
- Parent registry outcome: Explicit student and coach domain contracts and authorized persistence model
- Dependencies: PRD 01 — `COMPLETED`
- Release gate: Gate A
- Pre-flight: Independent review required before executable contract freeze

## Context

PRD 01 established explicit HTTP platform contracts and a client-independent
Fastify boundary. Fitness OS now needs the smallest persistent vocabulary for a
student, a coach, and the historical fact that the two records were linked.
Later capabilities depend on those identifiers without yet having authority to
invent authentication, onboarding, profiles, training behavior, or data-sharing
policy.

## Problem

There is no product-domain contract or authorized product persistence. If later
PRDs create their own student and coach shapes, identifiers, or relationship
semantics, contracts will drift and authorization logic may accidentally treat
an identifier or database row as permission.

## User

- API and domain engineers building later student and coach capabilities.
- Data engineers implementing the first product migration and repository adapter.
- Security reviewers establishing future authorization and privacy boundaries.

This PRD creates no user-facing workflow.

## Outcome

Fitness OS has frozen, runtime-validated data contracts for minimal student,
coach, and student–coach link records; persistence ports independent of Drizzle;
and a versioned PostgreSQL migration and adapter that preserve those records
without collecting profile or credential data.

## Scope

- Define distinct opaque student, coach, and link identifiers.
- Define minimal student and coach records containing only an identifier and
  server-controlled creation timestamp.
- Define a temporal student–coach link with a start timestamp and an optional
  end timestamp so prior links are not silently overwritten or deleted.
- Freeze the executable data contracts in `packages/schemas` before parallel
  domain and persistence implementation.
- Add domain-owned persistence ports and explicit conflict/not-found outcomes.
- Add PostgreSQL/Drizzle tables, indexes, constraints, a versioned migration,
  and a narrowly scoped database adapter.
- Validate the migration and repository behavior against a disposable
  PostgreSQL database without production credentials or data.
- Document that domain identifiers and link records do not establish caller
  identity or grant authorization.

## Non-scope

- Authentication, sessions, credentials, identity-provider mapping, or account recovery.
- Role claims, permissions, authorization policy, row-level security policy, or an authorization engine.
- Student or coach onboarding, invitations, approvals, or self-service creation.
- Names, email addresses, phone numbers, dates of birth, age, gender, locale,
  contact details, avatars, biographies, or other profile attributes.
- Consent wording, lawful basis, retention periods, deletion policy, data export,
  data-subject workflows, or coach data-sharing policy; these require PRD 21
  and any applicable legal/privacy determination.
- Training, exercises, movements, plans, workouts, body data, health data,
  measurements, photos, notifications, billing, or analytics.
- Public student or coach HTTP routes, client UI, search, lists, pagination, or filtering.
- A production database, deployment topology, credentials, seed data, or real users.
- Enforcing a one-coach-per-student, one-student-per-coach, or other product
  cardinality rule not authorized by the roadmap outcome.

## UX

No product UI or public API is introduced. PRD 07 and later workflow PRDs must
define mobile-first student and desktop-friendly coach experiences against
separately frozen HTTP contracts.

## Business rules

- Student, coach, and link identifiers are random opaque UUIDv4 values. They encode no
  email, provider, role claim, sequence, or other personal meaning.
- Student and coach records are distinct domain resources. This PRD makes no
  claim about whether one future authenticated person may map to either or both.
- Creation and relationship timestamps are supplied by a trusted backend clock,
  normalized to UTC, and never accepted from a browser in this PRD.
- A link records an association, not permission. Neither possession of an ID
  nor the presence of an active link authorizes access to any resource.
- Link start time is immutable. Ending a link sets its end time once; it does
  not delete or rewrite the historical interval.
- An end time must be strictly later than the start time.
- The same student and coach pair may have only one active link at a time.
  A later link may start after the prior link has ended.
- No broader coach/student cardinality is promised or enforced.
- No delete operation is provided. Retention and deletion behavior remains
  explicitly deferred to PRD 21 rather than silently chosen here.

## Data

The executable contracts define:

- `studentIdSchema` and `StudentId`;
- `coachIdSchema` and `CoachId`;
- `studentCoachLinkIdSchema` and `StudentCoachLinkId`;
- `studentRecordSchema` and `StudentRecord` with `id` and `createdAt`;
- `coachRecordSchema` and `CoachRecord` with `id` and `createdAt`; and
- `studentCoachLinkSchema` and `StudentCoachLink` with `id`, `studentId`,
  `coachId`, `startedAt`, and nullable `endedAt`.

Contract timestamps are canonical RFC 3339 UTC strings. Persistence may use
native timestamp values internally, but adapters must normalize values at the
domain boundary. IDs and timestamps can become personal data when connected to
a real identity; they remain private by default even though this PRD stores no
direct identifiers.

## Contracts

`packages/schemas` is the executable Source of Truth. `docs/contracts` records
the frozen names, owners, and consumers without independently restating their
fields.

The domain package owns repository ports for:

- creating and retrieving a student record;
- creating and retrieving a coach record;
- creating, retrieving, and ending a student–coach link; and
- checking the active link for an exact student/coach pair.

Writes return explicit success, conflict, missing-reference, not-found, or
already-ended outcomes where applicable. Database exceptions and constraint
names are never shared contracts. No HTTP request, response, route, or new
public API error code is authorized by this PRD.

## Ownership

- Orchestrator: PRD, Technical Design, contract freeze coordination, human
  contract registry, integration, and Gate A evidence.
- API/Domain: `packages/schemas/**`, `packages/domain/**`, and colocated tests.
- Data/Infrastructure: `packages/database/**`, the single migration lane, and
  colocated migration/repository tests.
- QA/Security: independent privacy, authorization-boundary, migration, failure,
  and scope review without taking over implementer-owned tests.
- Agent 90: independent pre-flight and integrated-candidate review.

## Security and privacy

- Deny by default: no product route is exposed until a future approved PRD
  defines authenticated principal and authorization policy contracts.
- Resource IDs are locators, not credentials or proof of access.
- An active link is necessary domain context for some future coach workflows,
  but is not by itself sufficient authorization.
- Web and Next.js code never import the database or domain packages and never
  access PostgreSQL directly.
- The persistence adapter uses parameterized Drizzle queries; raw caller-built
  SQL and mass-assignment objects are prohibited.
- Database URLs and errors are redacted. Routine logs contain operation and
  correlation metadata, not complete domain records or database payloads.
- Tests use synthetic records only. No production data, account data, health
  data, or secret may enter fixtures or migrations.
- This PRD does not choose consent, sharing, retention, or deletion policy.
  Work must stop under `LEGAL_PRIVACY_DECISION_REQUIRED` if implementation
  cannot remain inside that boundary.

## Failure modes

- A malformed UUID or timestamp fails executable contract validation.
- A timestamp that is not in the frozen canonical UTC representation is rejected;
  it is never stored ambiguously.
- Duplicate resource or link IDs produce a typed conflict outcome.
- A link referencing a missing student or coach fails atomically.
- Concurrent attempts to create the same active student/coach pair result in
  one success and one typed conflict.
- Ending a missing link returns not found; ending an ended link returns
  already ended; neither mutates history.
- An end time at or before the start time is rejected by domain validation and
  a database constraint.
- Database unavailability or unexpected SQL failures remain internal errors;
  no driver message, query, database URL, or constraint name crosses a public boundary.
- A migration failure stops deployment and leaves the prior application/schema
  compatibility path intact; it is not reported as a successful migration.

## TDD plan

Implementation follows observable Red → Green → Refactor evidence:

1. Freeze failing schema tests for valid and invalid identifiers, UTC
   timestamps, record shapes, unknown keys, and link intervals.
2. Add failing domain tests for repository outcomes and link invariants without
   importing Drizzle or database code.
3. Add failing migration tests that start from an empty disposable PostgreSQL
   database, apply the migration, and inspect required tables, constraints, and indexes.
4. Add failing repository integration tests for create/read, missing foreign
   keys, duplicate IDs, concurrent active-link creation, ending behavior, and SQL error containment.
5. Implement only enough schema, domain, and adapter code to pass each test,
   then refactor without changing frozen contracts.
6. Run clean-worktree lint, formatting, typecheck, unit/integration tests,
   production build, repository check, migration validation, and independent review.

No test is added solely to inflate coverage. PostgreSQL-specific behavior must
be proven against PostgreSQL, not replaced by an in-memory database or mocked SQL.

## Acceptance criteria

1. The executable contracts listed in Data are frozen before dependent domain
   and database work proceeds in parallel, and the human registry references them accurately.
2. Contract tests reject malformed IDs, non-canonical or invalid timestamps,
   unknown fields, and invalid link intervals.
3. Domain code exposes explicit persistence ports and outcomes without importing
   Drizzle, PostgreSQL drivers, Fastify, React, Next.js, or `@fitness-os/database`.
4. A versioned additive migration creates only the three authorized tables,
   their foreign keys, the temporal check, and the indexes needed for exact-ID
   and active-pair access. It creates no profile, credential, body, training, billing, or audit columns.
5. Migration validation passes from an empty disposable PostgreSQL database,
   generated schema and committed migration show no drift, and recovery steps are exercised or dry-run with evidence.
6. Repository integration tests prove deterministic create/read behavior,
   referential integrity, typed conflicts, concurrent active-link protection,
   one-way link ending, and internal SQL-error containment.
7. No public product route, UI, authentication mechanism, identity mapping,
   production connection, real data, or seed account is introduced.
8. No direct identifier or unnecessary PII is stored; logs and public errors do
   not disclose domain records, SQL details, credentials, or connection strings.
9. New behavior has observable Red → Green evidence and all existing tests remain green.
10. Pinned-tool lint, formatting, typecheck, unit/integration tests, build,
    repository check, and migration validation pass on the exact candidate.
11. Agent 90 and independent QA/security report zero open `BLOCKER` or `HIGH`
    findings; architecture, scope, contracts, security, and migrations are consistent.

## Metrics

- 100% of the six frozen contract schemas have provider-level valid and invalid tests.
- 100% of authorized database constraints have a PostgreSQL integration test
  that demonstrates the protected failure mode.
- 0 direct-identifier or profile columns in the PRD 02 migration.
- 0 public product routes introduced by PRD 02.
- 0 known `BLOCKER` and 0 known `HIGH` findings at merge.

These are completion measurements from test and review evidence, not estimates
of production reliability or security.

## Technical constraints

- Node.js 24.18.0, pnpm 10.24.0, strict TypeScript, Zod, PostgreSQL, Drizzle ORM,
  Drizzle Kit, the modular monolith, and dist-first package lifecycle remain fixed.
- Shared contracts are executable Zod schemas; domain and database code do not
  independently redefine boundary shapes.
- The API remains the only future client-facing persistence path. Next.js is
  not a backend-for-frontend and receives no database import exception.
- The database adapter implements domain-owned ports; domain code never depends
  on persistence implementation details.
- New dependencies must be minimal, exactly pinned, and independently reviewed.
- Applied migrations are immutable. Corrections use a new versioned migration.

## Dependencies

- PRD 01 — Platform Foundation: `COMPLETED` with Gate A passed.
- Product Principles and accepted ADRs 001–006.
- Frozen platform health, readiness, and error contracts remain unchanged.
- A disposable PostgreSQL test environment is required for migration and adapter validation.

No production credential, paid provider, founder decision, human-perception
validation, or legal/privacy policy choice is required for this bounded design.

## Gate A and completion

Gate A applies; Gate B and Gate C do not apply to this non-user-facing
foundation. Migration validation is required, not `NOT_APPLICABLE`.

PRD 02 may move to `COMPLETED` only when all acceptance criteria are evidenced
on the exact reviewed head, CI is green, contracts and documentation are
current, the migration is validated, all relevant PRs are merged, Agent 90 and
QA/security pass independently, architecture/security/scope gates pass, and
there are zero open `BLOCKER` and `HIGH` findings. Completion does not authorize
PRD 05, 07, 18, or 21 unless each is independently dependency-ready under the registry.

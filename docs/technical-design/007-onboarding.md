# Technical Design 007 — Onboarding

## Status and authority

- Status: Draft — independent Agent 90 review is required before executable
  contract freeze
- PRD: [PRD 07 — Onboarding](../prds/007-onboarding.md)
- Registry dependency: PRD 02 — `COMPLETED`
- Release gate: Gate A
- Design pre-flight: `PASS` at the integrated base; this Technical Design has
  not been independently reviewed
- Active production stop: `LEGAL_PRIVACY_DECISION_REQUIRED`
- Independently stopped product path: real dual-role acquisition and self-coach
  linking remain hard-disabled under `FOUNDER_DECISION_REQUIRED` and, where
  applicable, `LEGAL_PRIVACY_DECISION_REQUIRED`

This document authorizes no contract freeze, implementation, migration,
provider selection, legal content, real-user activation, PRD state change, or
Gate A result by itself. PRD 02 remains the only registry dependency. PRD 21
and its Technical Design are informative integration context for a future
policy gateway; they are not added to the PRD 07 dependency graph.

## Design summary

PRD 07 adds one bounded onboarding capability to the existing modular
monolith. Fastify authenticates a backend session through a provider-neutral
adapter, derives a protected pre-binding `PrincipalReference`, and supplies a
trusted context that browser input cannot construct. The onboarding domain
uses that context to inspect an invitation without mutation or, on the first
authorized mutating command, atomically establish one principal and external
binding before continuing the command.

```text
Next.js PWA
  browser-held invitation secret in memory only
  opaque API session cookie + per-session CSRF proof
             │
             ▼
Fastify API
  session verification → trusted principal context
  boundary schemas      → safe public results/errors
             │
             ▼
packages/domain/onboarding
  identity + invitation + attempt + operation state machines
  policy-neutral ports; no provider, HTTP, or persistence types
       │                 │                    │
       ▼                 ▼                    ▼
packages/database   IdentitySessionPort   OnboardingPolicyGateway
  PostgreSQL        provider adapter      separately authorized interaction
  + PRD 02 rows     (synthetic first)     (synthetic mechanics first)
```

The initial deliverable is provider- and policy-neutral. It may use visibly
synthetic identity and policy adapters with disposable PostgreSQL. Production
composition rejects synthetic adapters and remains unavailable until the
identity/session architecture, provider, credentials, applicable legal/privacy
decisions, and production evidence interaction are independently cleared.

## Hard boundaries and invariants

- Only the API-side identity adapter constructs authenticated principal
  context. A browser-supplied principal, issuer, provider subject, student,
  coach, link, role, or domain ID is never authority.
- `PrincipalReference` is a backend-only protected reference derived from a
  verified issuer, stable opaque subject, environment, and derivation version.
  It is never accepted from or returned to a client and grants no role.
- Reference rotation resolves every approved lookup version as one logical
  identity before any first binding. Exactly one version may emit new primary
  references, and a cutover cannot activate it until alias coverage is
  complete and readiness proves every replica uses the same keyring epoch.
- Reads and invitation inspection create no Fitness OS identity state. The
  first principal and external binding are created only inside the first
  authorized retry-token-bearing onboarding mutation.
- External bindings and role mappings are history-preserving. Ordinary
  onboarding operations never rebind, merge, or delete them.
- Invitation secrets have at least 128 bits of entropy, are returned once,
  remain body-held, and are never persisted in plaintext, placed in a path or
  query, or emitted to logs, telemetry, screenshots, browser storage, or a
  service-worker cache.
- The attempt cap is exactly four nonterminal attempts per principal and
  proposed role across distinct invitations. It is hard-coded in the domain
  invariant and database constraint, not caller input or environment
  configuration.
- At most one nonterminal attempt exists for an exact principal, invitation,
  purpose, and proposed-role scope.
- Every mutation uses a bounded caller `RetryToken` only for retry correlation.
  The server owns `OperationId`, operation namespace, canonicalization version,
  semantic digest, lease, fencing value, trusted time, and stored result.
- A successful claim is one PostgreSQL transaction containing the invitation
  terminal transition, attempt completion and slot release, PRD 02 record,
  role mapping, completion, mandatory transition evidence, and—only for a
  student invitation—the initial PRD 02 student–coach link.
- A student–coach link is a domain association, never complete authorization.
- Real second-role acquisition and self-coach claims are denied before any
  mutation in every composition. No feature flag, environment value, adapter
  result, operator command, retry, race, or synthetic fixture can enable them.
- The onboarding policy boundary carries only closed status and opaque,
  integrity-bound package, interaction, and evidence references. PRD 07 owns
  no legal copy, participant response, consent answer, signature, raw evidence,
  or evidence-submission route.
- Production readiness is conjunctive and false while any applicable stop is
  active. Synthetic mechanism readiness is never named production readiness.

## Scope and stop matrix

| Path                                   | Synthetic/disposable mechanism                         | Real-user/production disposition                                                                             |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Existing single-role principal claim   | Authorized for strict mechanics                        | Blocked until identity, policy, legal/privacy, credential, and readiness requirements pass                   |
| First principal/binding establishment  | Authorized with synthetic identity                     | Same production stops as the enclosing claim or command                                                      |
| Student invitation issuance/revocation | Authorized with synthetic mapped coach                 | Blocked until production identity and applicable policy decisions pass                                       |
| Policy interaction start/poll/consume  | Authorized against a synthetic reference-only gateway  | `LEGAL_PRIVACY_DECISION_REQUIRED` plus separate authorization of the governance interaction                  |
| Second-role acquisition                | Representation and repository invariants may be tested | Hard-disabled under `FOUNDER_DECISION_REQUIRED`; applicable legal/privacy approval is independently required |
| Self-coach link                        | Representation and denial races may be tested          | Hard-disabled under both applicable founder and legal/privacy decisions; either one alone is insufficient    |
| Provider callback/session composition  | Contract and synthetic adapter tests only              | Provider/session review and credentials required; no provider is selected here                               |
| Legal notice or response capture       | Not part of PRD 07                                     | Prohibited; remains owned by a separately authorized governance interaction                                  |

The design does not resolve a jurisdiction, eligibility or minors policy,
lawful basis, notice wording, evidence sufficiency, identity-assurance level,
sharing rule, withdrawal consequence, retention, deletion, residency, provider
processing, or recovery policy. If an affected real-user path needs one of
those decisions, `LEGAL_PRIVACY_DECISION_REQUIRED` remains active. Generated
prose, a synthetic test, or a green build cannot clear it.

## Trust boundaries and session topology

### Browser/API session protocol

The application session is backend-owned and independent of a provider SDK.
The selected production identity adapter must establish an opaque, random
server session handle only after it verifies its protocol-specific assertion.
Fastify receives that handle in a host-only cookie with these minimum
properties:

- `HttpOnly`, `Secure` outside explicitly disposable local testing,
  `SameSite=Lax`, `Path=/`, no `Domain`, and a `__Host-` name in production;
- bounded absolute and idle expiry controlled by the backend;
- rotation after authentication and any assurance-changing event;
- no raw provider token, subject, profile, role, or claim in the cookie; and
- no persistence in local storage, IndexedDB, analytics, or service-worker
  caches.

The production identity protocol profile is OpenID Connect Authorization Code
Flow with PKCE, handled entirely by Fastify: the API creates the authorization
transaction, stores state/nonce/PKCE verifier behind a short-lived opaque
browser handle, receives the callback, validates the code exchange and ID-token
assertion through the adapter, rotates the application session, and discards
provider tokens outside the adapter/session store. The PWA never receives an
ID token, access token, refresh token, provider subject, or PKCE verifier. A
provider that cannot satisfy this profile, backend-only token handling, and the
required replay/recovery tests cannot be composed without a new reviewed
architecture decision. This chooses the protocol shape, not a vendor, tenant,
assurance policy, recovery policy, or credential.

The PWA calls Fastify directly with credentials. Production Web and API origins
must remain same-site under an explicit CORS allowlist. A future cross-site
cookie topology is a material session-architecture change requiring independent
review; this design does not silently relax `SameSite`.

Every credentialed mutation also requires a per-session CSRF proof in a fixed
header plus an allowed `Origin`. Fastify obtains the proof through a bounded
session bootstrap response, the browser retains it in memory only, and the
server compares it to session-bound integrity state. GET reads remain
side-effect free. CORS permits credentials only for exact configured origins,
body limits apply before domain work, and authentication/rate controls run
before invitation verification.

Short-lived authorization transactions and application sessions live behind
an `IdentitySessionStore` adapter. The store persists only keyed digests of
opaque handles, bounded protocol state, approved issuer/adapter version,
protected subject material needed to reconstruct trusted context, expiry,
rotation/revocation state, and trusted times. It stores no provider token or
profile. The provider selection determines its concrete protected storage and
lifecycle, so the synthetic onboarding migration does not invent a production
session table. Production readiness requires restart/replay/revocation tests
against the selected store and an approved migration/provider lifecycle if
that adapter adds persistence.

The identity/session adapter verifies all protocol properties required by its
selected implementation—issuer, audience, signature, expiry, nonce/state,
redirect binding, callback replay, and session integrity—before producing a
trusted context. No production adapter, provider route, SDK, credential, or
protocol-specific recovery path is selected by this document. Synthetic tests
inject the trusted context directly behind the Fastify adapter boundary; they
do not add a public synthetic-login route.

### Trusted authenticated context

The provider-neutral context contains only bounded backend values needed by
onboarding: environment, approved issuer key, stable opaque subject input for
protected derivation, session reference, authentication time, expiry, adapter
contract version, integrity classification, and a synthetic marker. Provider
SDK types do not cross the adapter. The context contains no provider profile,
contact data, arbitrary claims, legal authority, or product role.

Fastify resolves this context before parsing protected resource locators or
touching invitation/domain persistence. Missing, expired, integrity-invalid,
synthetic-in-production, or unapproved-issuer context returns the shared safe
unauthenticated/forbidden envelope and performs no protected lookup.

### Protected `PrincipalReference`

The adapter derives `PrincipalReference` with a versioned keyed digest over a
length-prefixed canonical tuple:

```text
environment || issuer_key || stable_opaque_subject
```

The initial mechanism is HMAC-SHA-256 through a `PrincipalReferenceDeriver`
port. The HMAC key is supplied only by composition, never stored in product
tables, and production use requires approved secret management. Length-prefixing
and fixed UTF-8 normalization prevent tuple ambiguity. The persisted binding
stores no raw subject; immutable reference aliases store derivation version and
digest. The reference is stable only within its environment and approved
issuer.

The composition exposes a closed, environment-bound derivation keyring with
one `active_write_version`, zero or more `lookup_only_versions`, and a stored
rotation epoch. For each verified context, the adapter derives candidates for
every approved version and asks `PrincipalBindingRepository` to resolve them in
one transaction. Zero logical matches may enter first binding only under the
active write version. One logical binding match wins even when several of its
immutable aliases match. References that resolve to more than one distinct
binding or principal are corrupt state: the transaction performs no identity
or command mutation, returns `internal_corrupt_state`, and fails readiness.

Rotation is prepare, cover, then cut over; it is never a version fallback:

1. install the new key as `lookup_only` on every replica while the prior
   version remains the sole writer;
2. in the prepared epoch, require every newly established binding to receive
   aliases for both the current writer and candidate atomically, so the future
   coverage set cannot regress;
3. atomically mark the candidate `covering`, which makes readiness false and
   disables new identity mutation; then derive old and new references only from
   the same verified adapter context, lock each logical binding in stable
   order, and atomically insert its immutable candidate alias plus provenance;
4. prove that every active binding has exactly one alias for the candidate
   version, no candidate alias conflicts, operation-authority aliases remain
   resolvable, and every deployment replica reports the same keyring epoch; and
5. only then flip the database rotation control row in one transaction so the
   candidate becomes `active_write` and the prior version becomes
   `lookup_only`.

Coverage input must come from the same verified subject context or from a
separately reviewed adapter migration capability that can prove equivalent
subject ownership. Product-table digests cannot be reverse-migrated. If the
selected adapter cannot provide complete attributable coverage, the candidate
remains lookup-only and cutover does not occur.

An incomplete migration or a replica/config epoch mismatch makes onboarding
not ready and disables new identity mutation; it cannot emit the new version.
A lookup-only version can resolve an existing binding but can never create a
binding, become preferred after a no-match, or overwrite a newer alias. The
client supplies neither version nor digest. Retiring a lookup version requires
separate reviewed evidence that no binding, retained operation authority,
retry, or recovery window depends on it. Ordinary onboarding never rewrites a
binding, and subject-changing recovery remains a future authorized workflow.
Hashing does not make a reference anonymous; every alias remains protected
identity data.

## Contract plan

### Source of truth and freeze order

All names below are proposed contract responsibilities. The later coordinated
freeze implements strict Zod schemas in `packages/schemas` and records only
ownership/provider/consumer metadata in `docs/contracts`. This prose is not a
second runtime definition.

1. Agent 90 independently reviews this exact Technical Design.
2. API/Domain adds one isolated onboarding schema module and failing provider/
   consumer contract tests.
3. The Orchestrator coordinates the public schema barrel, shared API error
   additions, and human contract registry in one freeze commit.
4. Web, API/Domain, and Data branches rebase on that exact commit.
5. Any later shape change repeats coordinated contract review.

The freeze must preserve nominal incompatibility with PRD 02 `StudentId`,
`CoachId`, and `StudentCoachLinkId`. Unknown keys, unbounded strings or arrays,
arbitrary metadata, hidden identifiers, legal content, raw evidence, trusted
timestamps, and caller-owned operation fields are rejected.

### Contract groups

| Group              | Required executable responsibility                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Nominal `PrincipalId`, binding ID, role-mapping ID, session-safe context classification, and protected principal-reference type that is backend-only                                                     |
| Invitations        | Nominal invitation ID; purpose `coach_bootstrap` or `student_onboarding`; issued/claimed/revoked/expired states; one-time issuance output; body-held claim proof input; safe inspection result           |
| Attempts           | Nominal attempt ID, immutable scope and ordinal, proposed role, lifecycle, safe terminal reason, predecessor, bounded summaries, opaque cursor, selection/cardinality results                            |
| Policy handoff     | Nominal interaction/evidence/package references and strict `interaction_pending`, `ready`, or `blocked` results with exact binding/integrity/version metadata                                            |
| Operation protocol | Nominal server `OperationId`, bounded `RetryToken`, closed command namespace, canonicalization version/digest, pending/reconciling/committed/replayed/mismatch variants, stored command result reference |
| Commands           | Strict create/resume/abandon/policy-refresh/claim/issue/revoke requests and closed command results; browser variants omit all server-owned IDs, digests, scopes, and times                               |
| Completion         | Exact role mapping, PRD 02 record, optional student link, invitation, attempt, operation, and trusted completion references                                                                              |
| Readiness          | Internal component result with closed diagnostics plus unchanged public ready/not-ready projection                                                                                                       |
| Errors             | Coordinated `UNAUTHENTICATED`, `FORBIDDEN`, and `CONFLICT` additions required by the authenticated boundary; existing platform validation and service errors remain canonical                            |

Every public request and response has an independent strict schema. An
operation envelope wraps the stored command result; it does not collapse a
committed `selection_required`, `active_attempt_limit_reached`,
`already_terminal`, or `mapping_conflict` into a generic operation state.

### Closed result taxonomy

The freeze preserves these exact semantic families from the PRD:

- operation: `operation_pending`, `operation_reconciling`,
  `operation_committed`, `operation_replayed`, `operation_input_mismatch`;
- selection/cardinality: `attempt_selected`, `selection_required`,
  `no_active_attempt`, `active_attempt_limit_reached`;
- gateway: `interaction_pending`, `ready`, `blocked`;
- command: `command_succeeded`, `completed`, `current_state`,
  `already_terminal`, `invalid_or_unavailable`, `mapping_conflict`; and
- boundary: `unauthenticated`, `forbidden`, `dependency_unavailable`,
  `internal_corrupt_state`.

Command-specific contracts expose only applicable members without renaming or
merging them. Public invitation failures deliberately map unknown, malformed,
expired, revoked, inaccessible, and competing-principal cases to the same safe
shape. Internal reason codes remain closed engineering classifications and are
not legal conclusions.

The coordinated freeze maps missing/invalid authentication to HTTP 401 plus
`UNAUTHENTICATED`; an authenticated capability denial that is not
existence-sensitive to HTTP 403 plus `FORBIDDEN`; canonical input mismatch or
another safely disclosable operation conflict to HTTP 409 plus `CONFLICT`;
dependency unavailability to HTTP 503; and corrupt internal state to a redacted
HTTP 500. Invitation existence, ownership, competing-principal, dual-role, and
self-coach distinctions remain inside the generic unavailable result and are
not exposed through a more specific status. `operation_pending` and
`operation_reconciling` use HTTP 202, while committed and replayed envelopes
retain their exact command discriminator. Validation and platform errors keep
the already frozen PRD 01 meanings.

### Canonical semantic input

The operation contract pins `utf8-json-sha256.v1`: NFC-normalized strings and
keys, UTF-8 bytewise key ordering, explicit sorting/deduplication only for
documented set-like arrays, and preserved order for every other array. It
rejects non-JSON values, duplicate normalized keys, sparse arrays, non-finite
numbers, and unknown fields. The digest includes authority scope, command
namespace, immutable owned target or verified invitation reference, attempt
and package versions, and every bounded behavior-affecting field. It excludes
plaintext secrets, raw policy responses, transport metadata, and generated
outputs; a stable verifier/reference contributes when proof affects semantics.

Equivalent semantic input must produce the same digest across Node processes,
database row order, and object insertion order. A canonicalization change
creates a new explicit version and never changes an existing operation.

## Public and restricted surfaces

Route paths are proposed for the coordinated executable freeze. Fastify remains
the only public backend and every response uses the shared request correlation
and safe error envelope.

| Method and path                                                | Responsibility                                                                    | Mutation/secret rules                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /v1/onboarding/current`                                   | Bounded current attempts and authorized role-mapping state with opaque cursor     | Read-only; creates no principal or binding                                               |
| `POST /v1/onboarding/invitations/inspect`                      | Authenticated generic inspection using a body-held claim secret                   | Read-only; secret never echoed; creates no identity/attempt                              |
| `POST /v1/onboarding/attempts`                                 | Create or converge on the exact scoped attempt                                    | Requires retry token and body-held claim secret; may perform atomic first binding        |
| `GET /v1/onboarding/attempts/:attemptId`                       | Read one stored attempt selected by locator and authenticated scope               | Read-only; locator is not authority                                                      |
| `POST /v1/onboarding/attempts/:attemptId/resume`               | Record an explicit idempotent resume/activity transition and return current state | Requires retry token and CSRF; cannot change role, invitation, or policy scope           |
| `POST /v1/onboarding/attempts/:attemptId/abandon`              | Server-reasoned abandonment and exact slot release                                | Requires retry token and CSRF; caller supplies no reason/time                            |
| `POST /v1/onboarding/attempts/:attemptId/policy-refresh`       | Start/resume/poll and consume only reference-bound policy status                  | Requires retry token; accepts no legal content, response, signature, or evidence payload |
| `POST /v1/onboarding/attempts/:attemptId/claim`                | Re-verify claim proof and atomically complete onboarding                          | Requires retry token and body-held secret; all IDs/times are server-owned                |
| `GET /v1/onboarding/student-invitations`                       | Bounded list of the authenticated coach's own invitation metadata                 | No secret/verifier, principal/student ID, or total count                                 |
| `POST /v1/onboarding/student-invitations`                      | Issue one coach-owned student invitation                                          | Requires mapped coach, retry token, CSRF; returns secret exactly once                    |
| `POST /v1/onboarding/student-invitations/:invitationId/revoke` | Revoke that coach's own unclaimed invitation                                      | Requires retry token and CSRF; safe terminal result                                      |

The attempt ID and invitation ID are locators checked against stored
authenticated scope, never bearer credentials. Claim bodies accept no
principal, issuer, provider subject, student, coach, target coach, link,
operation ID, namespace, digest, canonicalization version, policy answer, raw
evidence, or trusted timestamp. A request with multiple active attempts and no
locator returns `selection_required`; the server never silently chooses the
latest.

Coach-bootstrap issuance is a separately composed non-public command using an
attributable restricted operator context, exact environment binding, and the
same retry/operation protocol. It is absent from Fastify route registration,
OpenAPI/public schemas, Web imports, and browser bundles. No generic admin or
support route is introduced.

Provider start/callback/session routes remain outside the initial synthetic
slice. They may be registered only after the provider and exact protocol are
reviewed. A callback may establish the backend session but can never create a
Fitness OS principal, binding, role mapping, attempt, or domain row.

## Module boundaries and ownership

### Planned modules

```text
packages/schemas/src/onboarding.ts
  strict shared identifiers, inputs, outputs, states, and readiness contracts

packages/domain/src/onboarding/
  identity.ts       protected-reference and binding invariants
  invitation.ts     invitation lifecycle and verifier-neutral rules
  attempt.ts        state machine, selection, fixed cap, slot release
  operation.ts      canonical digest, replay, lease, reconciliation rules
  policy.ts         reference-only policy gateway coordination
  claim.ts          coach/student completion planning and dual-role denial
  readiness.ts      mechanism/production composition checks
  ports.ts          narrow side-effect interfaces

packages/database/src/onboarding/
  PostgreSQL repositories, transaction adapters, reconciliation queries
packages/database/src/schema.ts
  Data-owned Drizzle table declarations
packages/database/drizzle/
  one new forward-only migration and metadata from the integrated head

apps/api/src/onboarding/
  Fastify plugin, authentication/CSRF pre-handlers, route handlers, safe mapping
apps/web/app/onboarding/ and apps/web/lib/
  mobile student and desktop/tablet coach flows through Fastify only
```

File splitting may change during implementation without changing dependency
direction. Domain imports schemas and no Fastify, Next.js, React, Drizzle,
PostgreSQL driver, provider SDK, filesystem, environment, or database package.
Database implements domain-owned ports. Web imports neither domain nor
database and has no direct persistence/provider access.

### Ownership and sequencing

- Orchestrator coordinates this Technical Design review, contract freeze,
  shared schema barrel, error-schema change, `docs/contracts`, API composition,
  integration, and Gate A record.
- API/Domain owns `packages/schemas/**`, `packages/domain/**`, `apps/api/**`,
  and colocated tests, subject to coordinated shared-contract changes.
- Data/Infrastructure exclusively owns `packages/database/**`, the migration,
  Drizzle metadata, database roles/constraints, and colocated PostgreSQL tests.
- Web/PWA owns `apps/web/**`, `packages/ui/**`, and colocated accessibility and
  client tests.
- QA/Security and Agent 90 inspect the actual candidate independently and do
  not take over implementer-owned tests.

Contracts freeze before dependent work. The migration begins only after the
latest integrated migration head is fixed, with exactly one global migration
owner. API registration and any shared readiness/error composition are
serialized during integration.

## Domain model and ports

The domain uses immutable plain records and small deterministic functions.
There is no generic workflow engine, repository base, event bus, account model,
authorization engine, or unit-of-work abstraction.

### Core records

- `Principal`: opaque identity, lifecycle, environment, trusted creation time.
- `ExternalPrincipalBinding`: one logical principal binding, approved issuer
  key, adapter contract version, immutable provenance and lifecycle. It stores
  no raw provider subject.
- `PrincipalReferenceAlias`: immutable binding, derivation version/digest,
  rotation epoch and provenance; uniqueness prevents one protected reference
  from naming two bindings.
- `PrincipalReferenceRotation`: environment, closed keyring epoch, one active
  write version, approved lookup versions, coverage state, and trusted cutover
  provenance; it stores no key material.
- `PrincipalRoleMapping`: principal, exact `student` or `coach` role, nominal
  PRD 02 record ID, immutable provenance and lifecycle. Roles are independent
  mappings and never inferred.
- `OnboardingInvitation`: purpose, issuer principal when applicable, target
  coach for student invitations, verifier version/digest, lifecycle, expiry,
  operation provenance, and trusted times.
- `OnboardingAttempt`: immutable scope/ordinal, state/version, policy reference
  bindings, safe terminal reason, predecessor, expiry/activity bounds, and
  trusted times.
- `AttemptCardinalityGuard`: principal, proposed role, active count from zero
  through four, next ordinal, version, and trusted update time.
- `OnboardingCompletion`: attempt, invitation, mapping, PRD 02 record, optional
  link, operation, and trusted completion time.
- `OnboardingOperation`: server identity/namespace, canonical authority scope,
  retry-token digest, canonical input digest/version, lease/fence, state,
  typed result locator, retention bound, and trusted times.
- `OnboardingTransition`: aggregate, previous/next state/version, operation,
  closed reason, and trusted time. Ordinary application roles append but do
  not rewrite or delete it.

No record adds name, email, phone, profile, password, provider token, raw
subject, contact, legal content, participant answer, raw evidence, arbitrary
metadata, IP address, user agent, or client-controlled trusted timestamp.

### Domain-owned ports

| Port                             | Responsibility                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `IdentitySessionPort`            | Convert a verified backend session into trusted provider-neutral context or a closed denial; never expose provider claims |
| `IdentitySessionStore`           | Persist/rotate only protected opaque authorization/session state behind the adapter; expose no provider token or profile  |
| `PrincipalReferenceDeriver`      | Produce the complete approved-version candidate set from verified issuer/subject/environment using protected key material |
| `PrincipalBindingRepository`     | Resolve candidates to one logical binding, atomically establish aliases, enforce rotation epoch, and fail on ambiguity    |
| `PrincipalRoleMappingRepository` | Read exact role mappings and enforce role/domain uniqueness without inferring authorization                               |
| `InvitationSecretVerifier`       | Generate/verify versioned high-entropy claim material; return only verifier-safe classifications                          |
| `OnboardingInvitationRepository` | Issue, inspect, lock, expire, revoke, and claim invitations through closed outcomes                                       |
| `OnboardingAttemptRepository`    | Create/select/read/transition attempts under the exact-scope and fixed-cap guard                                          |
| `OnboardingOperationRepository`  | Bind scoped retry tokens, lease/reconcile operations, store typed results, and resolve pre-/post-binding aliases          |
| `OnboardingPolicyGateway`        | Start/resume/poll/validate reference-only governance interactions and immutable evidence bindings                         |
| `OnboardingClaimRepository`      | Commit one narrow coach or student aggregate transaction including required PRD 02 effects                                |
| `OnboardingTransitionSink`       | Persist mandatory append-only transition evidence in the same transaction as state change                                 |
| `TrustedClock`                   | Supply canonical server UTC instants and expiry decisions                                                                 |
| `OnboardingIdFactory`            | Generate nominal cryptographically random IDs by entity kind                                                              |
| `OnboardingSecretFactory`        | Generate claim secrets and other bounded random material from a cryptographic source                                      |
| `OnboardingReadinessProbe`       | Return safe mechanism and production component evidence without dependency secrets                                        |

`OnboardingClaimRepository` is a claim-specific transaction port rather than a
generic unit of work. Its implementation operates on the existing PRD 02
tables under the same transaction and preserves PRD 02 schemas, foreign keys,
temporal link rules, and student-before-coach lock order. It does not reinterpret
the PRD 02 repositories as authorization.

## State machines

### Invitation lifecycle

```text
issued ──claim──────→ claimed
   ├────revoke─────→ revoked
   └────trusted time→ expired
```

All three target states are terminal. Claim, revoke, and materialized expiry
lock the invitation row and compare state plus version. A claim operation that
finds trusted-time expiry may atomically record `expired` and the corresponding
safe attempt transition, but it cannot extend expiry. Terminal invitations are
never reactivated. An identical authorized replay returns the stored result;
a competing principal receives only `invalid_or_unavailable`.

Student invitations require an issuing principal with an active coach mapping
and store that exact coach record. Bootstrap invitations have no coach issuer
and can be issued only through the restricted operator port. Database checks
make these shapes mutually exclusive.

Claim material is 32 cryptographically random bytes encoded as unpadded
base64url. Persistence stores only `hmac-sha256.v1` and an HMAC-SHA-256 verifier
computed with a separately provisioned environment-bound pepper. Verification
decodes the fixed format, recomputes the verifier, and compares fixed-length
bytes in constant time. Pepper rotation introduces a new verifier version;
existing issued invitations retain their version until terminal. The pepper is
not a database value, log field, fixture, or browser value.

### Attempt lifecycle

```text
policy_pending ──approved reference──→ ready_to_claim ──claim──→ completed
       │                                      │
       └──────── closed terminal rule ────────┴───────────────→ terminal
```

`completed` and `terminal` are terminal and never reopen. Closed terminal
reasons include trusted expiry, inactivity abandonment, invitation unavailable,
policy-blocked terminal disposition, mapping conflict, and hard-disabled
dual-role/self-coach paths. Public mapping may intentionally collapse reasons
to prevent disclosure.

Only an integrity-checked `ready` gateway result bound to the exact principal,
attempt, proposed role, invitation purpose, requirement package/version, and
validity window can enter `ready_to_claim`. Claim revalidates that binding and
current gateway status under the operation; a stale browser view has no effect.
There is no `ready_to_claim → policy_pending` edge. Package replacement never
rewrites the attempt's immutable package/evidence binding and never reopens any
state. Under the same principal/role guard, it terminalizes the current
nonterminal attempt with a closed internal superseded reason, releases that
slot exactly once, and may create a successor with a new attempt ID, ordinal,
`policy_pending` state, predecessor link, and new package binding only when the
same invitation is still claimable. The terminalization and successor
allocation are one idempotent operation; if claimability or integrity fails,
the predecessor remains terminal and no successor is created. Completed
history is never changed.

Every transition uses optimistic aggregate version checks plus the material
row locks described below, writes transition evidence, and releases an active
slot exactly once when leaving the nonterminal set.

### Exact-scope uniqueness and fixed cap four

The fixed constant is:

```text
MAX_NONTERMINAL_ATTEMPTS_PER_PRINCIPAL_ROLE = 4
```

It appears as a domain invariant and a PostgreSQL check/guard invariant. No
request schema, environment variable, deployment value, or operator input can
alter it.

Attempt creation follows this order in one transaction:

1. lock or create the principal/proposed-role cardinality guard;
2. materialize trusted-time expiry and inactivity abandonment for eligible
   attempts in stable `(expires_at, created_at, attempt_id)` order;
3. release each newly terminal slot once;
4. resolve the exact principal/invitation/purpose/role active scope and return
   its authoritative attempt if one exists;
5. if the reconciled count is four, commit the idempotent
   `active_attempt_limit_reached` result with no attempt/domain mutation;
6. otherwise allocate the guard's next ordinal, insert one attempt, increment
   the count, write the transition, and commit the stored result.

A partial unique index prevents two nonterminal rows for the exact scope. A
deferred database invariant verifies at commit that guard count equals the
number of nonterminal attempts and remains between zero and four. Direct SQL
that bypasses service checks cannot overfill, underflow, or drift the guard.

Current-state reads return bounded pages ordered by `(created_at, attempt_id)`
and an opaque integrity-protected cursor. They return no total count. Summaries
contain attempt ID, proposed role, safe state, creation time, and expiry only.
They disclose no invitation, coach, issuer, principal, package, interaction,
or evidence reference. When more than one attempt exists, explicit selection
is required.

### Competing role attempts

Claims for the same principal/role serialize on the same guard. The first
valid completion creates the unique mapping. Other nonterminal attempts for
that role transition to a generic terminal mapping conflict and release their
slots exactly once. No result identifies the winning invitation, coach,
principal, or domain record.

Before claim mutation, the service reads both role mappings and the invitation
coach's principal mapping under lock. Any second-role acquisition or same-
principal coach/student endpoint is denied in all environments that model a
real-user path. Synthetic repository fixtures may represent both roles solely
to prove storage and denial behavior; claim composition has no enabling switch.

## Policy-neutral governance handoff

`OnboardingPolicyGateway` is an internal provider-neutral port. Its request is
limited to authenticated internal principal, attempt, operation/correlation,
proposed role, invitation purpose, optional approved immutable requirement
package reference, and exact environment. It accepts no legal content,
participant answer, choice, consent flag, signature, document, or raw evidence.

The result is exactly one of:

- `interaction_pending`: protected opaque interaction reference plus immutable
  package/version binding and safe validity metadata;
- `ready`: immutable evidence reference plus integrity/version binding to the
  exact principal, attempt, role/purpose, package, and validity window; or
- `blocked`: one closed safe engineering reason with no provider/legal detail.

At most one current interaction exists per attempt and requirement-package
version. Start uses the onboarding operation key as the downstream idempotency
reference. Poll is read-only. Consumption is a separate onboarding mutation
that validates the immutable reference and records only reference, digest,
version, status, and trusted times. Concurrent start/poll/consume converges on
one interaction and one accepted evidence binding.

The separately authorized governance interaction owns approved content
presentation, response capture, evidence construction, and its own public
submission API. PRD 07 neither proxies nor mirrors those endpoints. The PWA may
transfer control using the protected reference and a separately frozen
governance client route; onboarding itself returns no arbitrary URL or content.
If the interaction is absent, pending, expired, replaced, mismatched, blocked,
unavailable, or synthetic in production, claim remains incomplete or reaches a
closed terminal rule. No fallback policy or generated text is permitted.

A package replacement is not consumed into an existing attempt. It invokes the
forward-only terminalization/successor rule above, and the successor starts a
distinct interaction under its new operation and immutable package binding.
Neither polling nor a gateway response can move an attempt backward or edit a
stored package version.

PRD 21 remains informative context only. Composing a future PRD 21 or equivalent
adapter does not change PRD 07's PRD 02-only registry dependency and does not
move governance records or legal responsibilities into onboarding.

## Operation protocol, concurrency, and reconciliation

### Namespaces and authority

The closed initial namespaces are:

- `onboarding.coach_bootstrap_issue`;
- `onboarding.student_invitation_issue`;
- `onboarding.student_invitation_revoke`;
- `onboarding.attempt_create`;
- `onboarding.attempt_resume`;
- `onboarding.attempt_abandon`;
- `onboarding.policy_interaction_start`;
- `onboarding.policy_evidence_consume`;
- `onboarding.invitation_claim`; and
- `onboarding.attempt_terminalize` for deterministic server-scheduled expiry
  or abandonment work and package-supersession terminalization/successor work.

The persisted operation key is
`onboarding.<command_kind>:<OperationId>`. Its UUID suffix must equal the stored
server `OperationId`; namespaces and IDs are never caller-controlled.
Product-command authority is the authenticated principal. Before first binding,
it is the protected `PrincipalReference`. Bootstrap authority is the
attributable restricted operator plus environment. Scheduler operations use a
deterministic server trigger reference rather than a fabricated client token.

The caller supplies one strictly formatted bounded retry token for externally
initiated mutations. Persistence stores a versioned keyed digest of that token,
not the plaintext. Uniqueness covers authority alias, command namespace, and
retry-token digest. Authorization and ownership are rechecked on every retry,
including a replay; knowing a token or operation locator is never sufficient.

### Acceptance and replay algorithm

1. Authenticate, check CSRF/Origin/rate/body limits, parse the strict request,
   and verify ownership or invitation proof without revealing detail.
2. Derive the canonical authority candidates read-only: existing principal,
   protected pre-binding references, or restricted operator. This preliminary
   resolution acquires no material binding/principal lock; the command
   transaction re-resolves and locks them only after its operation row.
3. Canonicalize the complete semantic command input and compute its versioned
   digest.
4. Look up the scoped retry-token binding across every immutable authority
   alias. If namespace/version/digest differs, return
   `operation_input_mismatch` with zero command mutation.
5. If a committed operation matches, return `operation_replayed` containing
   the exact stored command result. If a valid worker lease exists, return
   `operation_pending`. If the lease expired or effect is ambiguous, atomically
   enter `operation_reconciling` with a new fencing value.
6. If no operation exists, allocate `OperationId`, persist the namespace,
   authority, retry-token digest, semantic digest/version, lease and fence, then
   execute the command under that identity.
7. Persist the command effect, mandatory transition evidence, typed result,
   and committed operation state atomically when all effects share PostgreSQL.
   Return `operation_committed` only after commit.

An intentionally repeated command with a new retry token receives a new
operation and is evaluated against current state. It may issue another
invitation, while a repeated revoke, transition, or claim may commit an
`already_terminal` or current-state result. It is never silently replayed from
semantic equality alone.

### Lease and fencing

Operation rows contain `lease_owner`, `lease_expires_at`, and a monotonic
fencing value. Lease duration is bounded server configuration, but it does not
alter operation identity or command semantics. A worker may mutate only while
its stored fence is current. Lease expiry never means failure or permission to
repeat the effect; it moves the operation to reconciliation.

Same-database commands keep effect and result in one transaction, so a
post-commit response loss replays the committed row. A future external adapter
must support a stable downstream idempotency reference and an inspect/reconcile
operation before it can register. An adapter that cannot distinguish timeout
from side effect is not production-ready.

Each namespace has a reconciler that checks only authoritative stored state:

- issuance: invitation, verifier metadata, owner, and operation provenance;
- revocation: invitation terminal transition and event;
- attempt work: guard count, exact-scope attempt, transition, and operation;
- policy work: current interaction/package/evidence reference and gateway
  lookup by operation reference;
- claim: invitation, attempt, completion, mapping, PRD 02 record/link,
  transitions, and operation result; and
- first binding: protected reference, unique binding, principal, authority
  aliases, and enclosing command effects.

Reconciliation never infers success merely from an absent row and never creates
a replacement retry token. A corrupt or contradictory state returns
`internal_corrupt_state`, fails readiness, and requires protected recovery.

### Atomic first binding and authority aliases

The canonical authority for a first-binding command remains its protected
pre-binding reference forever. The operation stores that reference alias before
principal creation. The boundary may verify invitation proof read-only before
the transaction to avoid unauthorized work, but that read grants no authority
and acquires no material lock. In the same transaction, the binding adapter:

1. locks the reference-rotation control row, derives and resolves the complete
   approved-version candidate set, and fails closed on more than one logical
   binding match;
2. for zero matches, acquires the transaction-scoped reference arbiter for the
   active write version and re-reads every candidate; if a concurrent
   transaction won, it locks and uses that one logical binding, otherwise it
   inserts one provisional principal, binding, and all aliases required by the
   current rotation phase, then inserts the immutable principal authority alias
   and continuous retry-token uniqueness binding while still in the
   principal/binding stage;
3. locks the principal/role guard and affected attempts when the enclosing
   command requires them, then locks the invitation/effect scope in the global
   order below and re-verifies proof, lifecycle, expiry, and ownership;
4. rolls back the complete transaction—including the provisional principal,
   binding, aliases, authority alias, and operation effect—if that locked
   authorization check fails, so invalid or racing invitation state creates no
   identity row; and
5. continues the enclosing command against the one authoritative principal.

The deterministic reference arbiter makes a competitor wait before insertion;
the unique alias constraint remains defense in depth, and the loser re-reads
the winner instead of depending on a driver exception or rewriting a binding.
A retry after session resolution yields the principal alias, finds the original
operation, and cannot allocate a new principal-scoped operation for the same
token. Concurrent different tokens may create distinct operation rows, but
they converge on one binding and then on command-specific uniqueness. No
ordinary repository exposes provisional-principal deletion or rebinding.

### Stable lock order

Every onboarding mutation uses PostgreSQL `SERIALIZABLE` isolation and acquires
only the stages it needs, always in this one global relative order:

1. operation/retry-token row or deterministic server-trigger row;
2. reference-rotation control and reference arbiters, immutable reference
   aliases, external bindings and principal rows, then operation-authority
   aliases;
3. principal/proposed-role cardinality guard;
4. attempts in `(created_at, attempt_id)` order;
5. invitations;
6. existing role mappings in fixed `student`, then `coach` order;
7. policy interaction/evidence rows, then completion and onboarding transition
   aggregates; and
8. PRD 02 student row, then coach row, then exact student–coach pair, preserving
   TD02's lock order.

Every command—including first binding, attempt create/resume/abandon,
terminalization/successor, policy start/consume, issue/revoke, and claim—uses
this relative order when it touches more than one stage. It may skip an
irrelevant stage but may never acquire an earlier stage after a later one.
First binding therefore resolves/locks principal and binding identity before
guard, attempts, and invitation; read-only proof checking before the transaction
does not change that order. Rows within a stage sort version/digest or IDs
bytewise as applicable. A not-yet-existing row uses its stage's deterministic
advisory/unique arbiter and re-reads any winner under lock at that stage. Its
physical insert may follow later-stage validation only while that earlier
arbiter remains held and the insert cannot wait on another earlier-stage
contender. No route or reconciler implements a local alternative order.

Expected uniqueness conflicts map to typed outcomes. The executor may retry
only PostgreSQL `40001` serialization failures and `40P01` deadlocks, with a
small bounded attempt count and full-jitter backoff. Each retry keeps the same
`OperationId`, authority, semantic digest, retry-token binding, and current
fence, restarts the whole serializable transaction, and reacquires locks from
stage 1; it never allocates a replacement operation or repeats a known
committed effect. After exhaustion or an ambiguous commit, a fresh fenced
serializable transaction first re-reads the same operation: a visible committed
result is replayed unchanged; otherwise the matching pending operation moves to
`operation_reconciling` and returns HTTP 202. The namespace reconciler inspects
authoritative effect/provenance first and may resume only the same operation
when absence of an effect is proven. It never blindly retries, changes the lock
order, or converts ambiguity into success.

### Claim transaction

Claim performs these checks and effects in one database transaction:

1. resolve/reconcile the operation and first binding if needed;
2. lock principal/binding identity, the principal/role guard, attempts,
   invitation, mappings, and target coach context in the global order;
3. re-verify the body-held secret, claimability, trusted expiry, stored attempt
   scope, current policy/evidence binding, and operation input;
4. deny second-role and self-coach paths before creating a domain row;
5. create one server-owned PRD 02 coach or student record;
6. create its unique principal role mapping;
7. for a student, create the PRD 02 link to the invitation coach under existing
   interval and FK invariants;
8. claim the invitation, complete the attempt, release exactly one guard slot,
   terminalize competing same-role attempts safely, and create completion plus
   mandatory transition evidence; and
9. store the typed result and commit the operation.

Injected failure at any point rolls back every item above. The transaction
does not call a separately committed PRD 02 repository method. Database
constraints remain defense in depth for duplicate mappings, active links,
terminal transitions, guard drift, and eventless state change.

## Persistence and migration design

One additive PostgreSQL/Drizzle migration is created only after contract freeze
and all earlier migrations are integrated. No existing migration or PRD 02
table is edited. Exact SQL names may be refined by the Data owner, but the
following record families and constraints are mandatory.

| Planned table family                 | Minimum database responsibility                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onboarding_principals`              | Opaque principal and trusted lifecycle; no profile/contact/provider fields                                                                       |
| `onboarding_external_bindings`       | One logical issuer/environment-to-principal binding with immutable provenance and no raw subject                                                 |
| `onboarding_principal_ref_aliases`   | Immutable version/digest aliases to one binding; global protected-reference uniqueness and rotation provenance                                   |
| `onboarding_principal_ref_rotation`  | One environment keyring epoch, active-write/lookup-only versions, coverage/cutover state and no key material                                     |
| `onboarding_principal_role_mappings` | Exact role plus nominal PRD 02 record FK; unique active principal/role and unique active domain-record ownership                                 |
| `onboarding_invitations`             | Purpose-specific issuer/coach checks, unique verifier digest/version, state/version, expiry, one terminal result, operation provenance           |
| `onboarding_attempt_guards`          | One principal/role row; active count check `0 <= count AND count <= 4`, next ordinal, lock version                                               |
| `onboarding_attempts`                | Immutable scope/ordinal, lifecycle/version, policy references, predecessor, activity/expiry; one active exact scope and deterministic read index |
| `onboarding_policy_interactions`     | One current attempt/package version, protected interaction/evidence references, integrity state and trusted times; no raw payload                |
| `onboarding_completions`             | One completion per attempt/invitation/mapping with exact PRD 02 result references and optional-link shape check                                  |
| `onboarding_operations`              | Server operation key/namespace/ID equality, canonical digest/version, state, lease/fence, typed result locator, retention bound                  |
| `onboarding_operation_authorities`   | Immutable protected-reference/principal/operator aliases and scoped retry-token digest uniqueness across first binding                           |
| `onboarding_operation_results`       | Closed result discriminator and checked typed references/fields; no unchecked arbitrary JSON payload                                             |
| `onboarding_transitions`             | Append-only aggregate state/version transition, operation, safe reason, trusted time; mandatory uniqueness and chain continuity                  |

Foreign keys use `ON DELETE RESTRICT`. Ordinary application roles have no
hard-delete or history-rewrite path. Nullable fields are controlled by purpose,
role, state, and result check constraints rather than permissive sparse rows.
The migration includes only indexes required for exact binding, verifier,
ownership, retry operation, exact attempt scope, guarded selection, current
interaction, coach invitation listing, and reconciliation. It adds no person
search, profile lookup, arbitrary JSON, legal content, seed user, production
policy, credential, or real data.

Reference aliases are additive history, not replacement bindings. Database
constraints prevent one `(environment, derivation_version, digest)` from
naming multiple logical bindings and permit only one rotation-control row and
active write version per environment. Coverage completeness and replica
keyring equality require readiness evidence because key material and replica
configuration are deliberately absent from product tables.

### Database-enforced attempt and transition integrity

A deferred constraint trigger or equivalently reviewed PostgreSQL routine
verifies at commit:

- the guard count exactly equals nonterminal attempts for its principal/role;
- count never exceeds four or falls below zero;
- every attempt leaving the nonterminal set releases one slot exactly once;
- one active exact scope and monotonic ordinal/version hold;
- allowed per-attempt edges are exactly `policy_pending → ready_to_claim →
completed` or either nonterminal state to `terminal`; no edge returns to
  `policy_pending`;
- terminal attempts never reopen and completed attempts retain completion;
- invitation and attempt terminal transitions have one matching append-only
  event and operation; and
- completion shape matches role: coach has no link, student has one exact
  student–coach link to the invitation coach.

Database bypass tests exercise these constraints with direct SQL. Service code
still validates first to return safe typed results; constraint names and driver
messages never cross the API.

### Migration order

1. Create principals, logical external bindings, reference aliases, rotation
   control, and protected uniqueness.
2. Create role mappings referencing existing PRD 02 student/coach tables.
3. Create operation ledger, authority aliases, and closed result storage.
4. Create invitations.
5. Create attempt guards, attempts, policy interactions, and indexes.
6. Create completions and append-only transitions.
7. Add deferred cross-table/guard/transition constraints and least-privilege
   grants.

No seed or backfill is expected. Migration validation starts from zero and from
the exact prior integrated head, checks schema/journal/metadata, reruns without
replay, injects interruption, applies a new forward correction in rehearsal,
and preserves unrelated sentinel rows and digests.

### Migration and data rollback

Applied migrations are immutable. Before apply, record code/migration SHAs,
journal, schema, row counts, and unrelated sentinel digest. Application rollback
uses a schema-compatible version and never drops committed identity or PRD 02
history. Before production activation, empty disposable tables may be removed
only by a new explicit corrective migration. Otherwise preserve data and roll
forward. A last-resort restore must preserve or explicitly replay unrelated
newer writes; full-database rollback is not the default recovery mechanism.

## Readiness and operational behavior

The internal onboarding readiness model is conjunctive and projects only
`ready` or `not_ready` through the existing public `/ready` contract.

`mechanism_ready` requires exact schema/migration markers; trusted clock, ID and
secret generators; canonicalizer; verifier; operation ledger; mandatory event
sink; synthetic identity/policy ports explicitly bound to a disposable
environment; closed result coverage; exact first-binding alias reconciliation;
one active-write reference version; equality between the database rotation
epoch and every serving replica's complete keyring epoch; full active-binding
alias coverage for any covering or active candidate version; zero ambiguous
multi-binding candidate matches; fixed-cap and guard integrity; deterministic
selection; policy reference-only enforcement; and current synthetic recovery
evidence.

Production onboarding readiness additionally requires a reviewed non-synthetic
identity/session adapter, approved issuer configuration, least-privilege
credentials, completed threat model, production-representative session tests,
non-synthetic separately authorized policy interaction, attributable policy
package, approved lifecycle/recovery behavior, all applicable legal/privacy
decisions, and no active stop. It also proves that dual-role and self-coach
claims remain unreachable unless both their independent decisions explicitly
permit the exact path. This design supplies no such permission, so those paths
remain hard-disabled.

Safe internal diagnostics are closed classifications: migration missing,
schema mismatch, identity adapter missing/synthetic/integrity invalid, policy
gateway missing/synthetic/blocked, credential unavailable, operation
reconciliation incomplete, orphan-principal evidence, attempt-guard drift or
overflow, reference-keyring epoch mismatch, reference-alias coverage incomplete,
reference multiple-match, result coverage incomplete, dual-role/self-coach
bypass, recovery unverified, configuration mismatch, or active stop. Public
readiness exposes none of the issuer, subject, tenant, host, package,
credential, derivation version, or raw error.

Structured operational events contain request/correlation ID, namespaced
operation ID, closed stage/outcome/reason, duration, adapter class/version, and
trusted time. They exclude secret/verifier, cookie/token, issuer payload,
provider subject, principal/student/coach/link ID, attempt/invitation locator,
policy/legal content, evidence payload, request body, SQL, dependency error,
stack trace, IP, user agent, and credential. Low-volume metric dimensions are
coarsened. No third-party analytics or session replay is added.

## Threat model and failure behavior

| Threat or failure                        | Required containment                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caller supplies identity/domain fields   | Strict schema rejects; trusted adapter context is the only authority                                                                                 |
| Missing/invalid/expired session          | Deny before invitation, mapping, or domain lookup                                                                                                    |
| Session fixation or callback replay      | Rotate session after verified authentication; adapter enforces state/nonce/replay protections                                                        |
| CSRF or unapproved origin                | Reject before command acceptance; no retry/operation row or protected lookup                                                                         |
| Claim-secret theft/forwarding            | Authentication, principal scope, single-use state, expiry, rate controls, and generic errors; possession alone is insufficient                       |
| Brute force or enumeration               | High entropy, keyed/versioned verifier, constant-time comparison where applicable, bounded body/rate controls, and indistinguishable public failures |
| Partial/stale reference-key rotation     | Multi-version lookup; no cutover or identity mutation until alias coverage and replica epoch readiness are complete                                  |
| Reference downgrade or multiple match    | Legacy versions are lookup-only; distinct binding matches fail closed, perform no mutation, and fail readiness                                       |
| Concurrent first binding                 | Protected-reference uniqueness converges on one principal; provisional loser never commits; aliases preserve replay identity                         |
| Lost first-binding response              | Reconcile binding, principal, aliases, operation, and enclosing effect; never create or rebind again                                                 |
| Same token, changed input/command        | `operation_input_mismatch`; zero command mutation                                                                                                    |
| New token, identical input               | New operation evaluated under current invariants; not a replay                                                                                       |
| Fifth active attempt                     | Stored `active_attempt_limit_reached`; no attempt/domain mutation or count disclosure                                                                |
| Guard drift/overflow bypass              | Deferred database invariant rejects commit and readiness fails                                                                                       |
| Multiple attempts with no locator        | Bounded `selection_required`; never choose latest                                                                                                    |
| Expiry/abandon/create race               | Serialize on principal/role guard; terminalize/release once before admission decision                                                                |
| Concurrent claim/claim                   | One terminal claim; matching authorized retry replays; competitor receives generic unavailable                                                       |
| Concurrent claim/revoke                  | Invitation lock selects one terminal transition; losing command has no partial effect                                                                |
| Existing role/domain mapping conflict    | Preserve current mapping; generic conflict with no owner or winning invitation disclosure                                                            |
| Dual-role or self-coach attempt          | Deny before mutation in claim and readiness; keep both applicable stop conditions visible                                                            |
| Invalid invitation coach/link context    | Roll back whole student claim; no student, mapping, event, or link survives                                                                          |
| Gateway missing/stale/mismatched/blocked | Remain policy pending or follow a closed terminal rule; no fallback legal/policy behavior                                                            |
| Synthetic identity/policy in production  | Startup and readiness fail before onboarding access                                                                                                  |
| Provider/database unavailable            | Preserve authoritative state; safe dependency-unavailable result; no local authentication fallback                                                   |
| Mandatory transition event fails         | Roll back corresponding state mutation and operation success                                                                                         |
| Stored contract/integrity mismatch       | Fail closed as `internal_corrupt_state`; never repair from browser input                                                                             |
| Subject changes during recovery          | No automatic rebind; require a separately authorized verified recovery design                                                                        |
| Shutdown during work                     | Bound transaction commits or rolls back; operation ledger reconciliation precedes retry                                                              |

The security review covers token leakage, invitation forwarding, account
takeover, session fixation, CSRF, callback replay, subject collision, mapping
takeover, claim/revoke races, secret timing, enumeration, synthetic activation,
operator misuse, log leakage, cursor tampering, attempt-cap bypass, alias
collision, stale operation fences, and corrupt-state recovery.

## Recovery procedures

- A browser refresh or new device reauthenticates and reads authoritative
  current state. Browser state never advances the server state machine.
- A completed matching operation replays its stored result. Pending or
  ambiguous work enters its namespace-specific reconciler before any retry.
- Multiple attempts are recovered through bounded selection; terminal attempts
  stay terminal. A successor receives a new ID and ordinal only if the same
  invitation remains claimable and the guard admits it.
- Gateway return resumes the existing attempt and polls by protected reference.
  Missing or ambiguous evidence remains pending; onboarding never reconstructs
  or asks the user to resubmit a raw response.
- Provider outage preserves invitation and attempt state. Session loss requires
  authentication again. Subject replacement, issuer migration, account merge,
  and disputed ownership remain outside scope.
- Reference-key rotation preserves every immutable alias. An interrupted
  coverage pass resumes at the stored rotation epoch; cutover remains disabled
  until coverage is complete, and rollback means retaining the prior writer,
  never deleting aliases or accepting a legacy-only new binding.
- Restricted operators may revoke an unclaimed invitation but cannot read its
  secret, force claim, map a principal, rewrite completion, override the cap,
  or bypass policy/dual-role checks.
- Disabling onboarding prevents new issuance, attempt creation, policy starts,
  and claims while preserving identities, mappings, invitations, attempts,
  completions, events, and PRD 02 history.
- Recovery evidence uses synthetic accounts and disposable infrastructure
  until production credentials, policy, and data handling are authorized.

Operation-ledger retention must cover the maximum approved invitation,
attempt, client retry, and recovery windows. This is a reviewed lifecycle input,
not caller configuration; choosing its real-data value remains subject to the
applicable legal/privacy decision.

## TDD and verification plan

Every behavior uses observable Red → minimal Green → refactor evidence. Tests
use only unmistakably synthetic identities, invitations, policy references,
and disposable infrastructure.

### Contract tests

- accept every nominal identifier, lifecycle, operation, command result,
  selection/cardinality result, gateway result, completion, readiness, request,
  response, cursor, and safe error variant;
- reject unknown keys, cross-branded PRD 02/PRD 07 IDs, malformed canonical
  times/digests, unbounded strings/collections, and caller-owned principal,
  issuer, provider subject, domain ID, operation identity, namespace, digest,
  authority scope, or timestamp;
- reject path/query claim-secret fields, legal copy, consent/authorization
  answers, signatures, raw evidence, provider payload, profile/contact data,
  and arbitrary metadata;
- prove provider and Web fixtures parse the same frozen schemas and exhaust
  every closed discriminator; and
- prove deterministic canonicalization/digest equivalence, order-sensitive
  array distinction, declared set-like ordering/deduplication, and rejection of
  unsupported values.

### Domain unit tests

- protected reference separation by issuer/environment/version, complete
  multi-version candidate lookup, one logical same-binding match, zero-match
  active-version creation, legacy no-match anti-downgrade, distinct-binding
  multiple-match fail-closed behavior, and no raw subject in output/state;
- rotation prepare/coverage/cutover, atomic old/new alias creation for new and
  existing bindings, interrupted coverage resume, incomplete-coverage and
  replica-epoch readiness denial, legacy retirement retention checks, and no
  duplicate principal across rotation races;
- principal/binding uniqueness, same-token replay, different-token concurrency,
  pre-/post-binding alias lookup, provisional rollback, mismatch, lost response,
  and one authoritative principal with no orphan;
- invitation issue/inspect/revoke/expire/claim transitions and one-time-secret
  behavior;
- exact-scope attempt convergence, four distinct active attempts, fifth denial,
  cap isolation by principal/role, deterministic selection, slot release,
  expiry/abandon/create races, direct rejection of
  `ready_to_claim → policy_pending`, completed resume, terminal non-reopen, and
  valid successor behavior;
- coach/student claim plans and exact PRD 02 effects, including all injected
  failure rollback points and mapping/invitation races;
- real-user second-role and self-coach denial under missing founder decision,
  missing legal/privacy decision, either decision alone, adapter spoof,
  configuration attempt, retry, and concurrency;
- operation replay/mismatch/new-token behavior, lease/fence expiry, pending
  reconciliation, and each namespace-specific reconciler;
- policy interaction start/poll/consume convergence, package replacement,
  forward-only predecessor terminalization/successor creation, binding
  mismatch/expiry denial, and absence of content/responses/payloads;
- production rejection of synthetic identity/policy ports; and
- source-boundary tests excluding framework, provider, and persistence imports
  from domain.

### API and session tests

- missing, invalid, expired, unapproved, or synthetic-in-production context
  denies before protected lookup;
- cookie flags, rotation, absolute/idle expiry, exact credentialed CORS,
  Origin/CSRF checks, body limits, rate limits, request correlation, and error
  redaction;
- callback/session retries create no Fitness OS identity state;
- public payloads cannot inject authority, operation fields, reasons, cap,
  trusted times, provider data, or governance response fields;
- invitation failures remain enumeration-resistant and secret values never
  appear in logs, snapshots, paths, queries, or responses;
- route registration proves no public bootstrap, legal-copy, response,
  evidence-submission, generic admin, profile, or recovery endpoint; and
- all success and error payloads parse through shared schemas.

### PostgreSQL integration and migration tests

- clean migration apply from zero and prior integrated head, exact schema,
  constraints, indexes, triggers, grants, journal, replay, and drift;
- database rejection of duplicate protected binding, active mapping ownership,
  verifier, terminal claim, exact-scope attempt, fifth attempt, guard
  overflow/underflow/drift, interaction, operation alias/token, and eventless
  transition when service validation is bypassed;
- real races for first binding, alias insertion, same/different retry tokens,
  attempt create/release, claim/claim, claim/revoke, competing invitations,
  package-supersede/claim, mapping, policy consumption, and stale fences;
- serializable lock-order races across first binding, guard, attempts, and
  invitation; bounded `40001`/`40P01` retry under the same operation/fence;
  exhaustion and ambiguous commit entering reconciliation without duplicate
  effects;
- failure injection at every material claim write with zero partial principal,
  binding, PRD 02 record/link, mapping, completion, event, or result;
- deterministic lock order and typed expected constraint mapping with raw
  database errors remaining internal; and
- interrupted migration, new forward correction, and recovery rehearsal
  preserving unrelated sentinel rows and post-snapshot writes.

### Web/PWA and accessibility tests

- student narrow viewport, touch, keyboard, screen reader, 200% text zoom,
  focus, live region, contrast, and reduced-motion behavior;
- coach desktop/tablet issue, one-time secret display, list redaction, and revoke;
- refresh, new-device resume, ambiguous reply, dependency outage, expiry,
  abandonment, selection required, cap denial, pending/reconciling operation,
  gateway return, and generic terminal states;
- dual-role/self-coach states reveal neither existing role nor same-principal
  relationship;
- browser/network assertions prove policy answers and evidence payloads go only
  to the separately authorized governance interaction; and
- no secret in URL path/query, browser persistence, service-worker cache,
  analytics, logs, screenshots, or rendered history after terminal outcome.

### Security, privacy, architecture, and repository gates

- threat tests for every misuse case listed above plus secret/fixture scans of
  commits, build outputs, logs, snapshots, and browser artifacts;
- static checks for Fastify-only persistence access, no Web domain/database
  imports, no provider SDK in domain, no public restricted command, and no
  service-worker credential behavior;
- exact-head formatting, lint, strict typecheck, unit/integration/E2E tests,
  production build, repository check, dependency/secret scan, migration drift/
  replay/recovery, accessibility, and shutdown/reconciliation evidence;
- explicit `LEGAL_PRIVACY_DECISION_REQUIRED` production stop evidence and
  separate `FOUNDER_DECISION_REQUIRED` dual-role/self-coach evidence; and
- independent Agent 90 plus QA/security review of the actual candidate, with
  zero open `BLOCKER` and zero open `HIGH` before merge.

Green synthetic tests prove only the bounded mechanism. They do not prove a
provider secure, a policy legally sufficient, a real-user path ready, or PRD 07
complete.

## Delivery waves

1. **Technical Design review** — independently challenge identity/session
   topology, first binding, operation reconciliation, cap enforcement, policy
   isolation, migration, recovery, and stop boundaries.
2. **Contract freeze** — add strict executable schemas and coordinated registry
   metadata; freeze before dependent work.
3. **Provider-neutral domain** — implement deterministic identity, invitation,
   attempt, operation, policy-reference, claim, and readiness mechanics against
   fakes.
4. **Disposable persistence** — one migration owner adds constraints,
   transactional adapters, races, replay, and recovery using synthetic data.
5. **API and Web synthetic slice** — register bounded onboarding routes and UI
   states without provider callback, legal content, or real-user activation.
6. **Integration and Gate A** — exact-head gates, migration/recovery,
   accessibility, QA/security, independent review, and correction rounds.
7. **Mandatory production stop** — retain
   `LEGAL_PRIVACY_DECISION_REQUIRED`; retain separate
   `FOUNDER_DECISION_REQUIRED` for dual-role/self-coach. Provider, credential,
   financial, architecture, and human-perception conditions remain independently
   governed when they become current.

No wave in this document authorizes PRD 25, edits the PRD registry/DAG, changes
frozen contracts, starts implementation before contract freeze, or marks a gate
as passed.

## Alternatives considered

- **Browser/provider tokens as principal context:** rejected because it lets
  client material cross the trust boundary and leaks provider coupling.
- **Provider subject stored directly:** rejected in favor of a versioned
  protected reference with adapter-owned derivation.
- **Principal creation at callback or current-state read:** rejected because it
  bypasses invitation authorization and the common operation protocol.
- **Retry token as operation ID:** rejected because caller correlation is not
  persisted authority or server operation identity.
- **Semantic digest alone for replay:** rejected because intentional repetition
  under a new retry token must be evaluated normally.
- **Configurable attempt cap:** rejected because Pilot V1 fixes the cap at four
  and replica/config drift would weaken concurrency guarantees.
- **Choose latest attempt automatically:** rejected because it is ambiguous and
  can disclose or mutate the wrong invitation scope.
- **One account row with a role enum:** rejected because PRD 02 resources and
  role mappings are distinct, history-preserving contracts.
- **Enable dual-role because storage supports it:** rejected because
  representability is not product or legal/privacy authorization.
- **Onboarding-owned policy boolean or consent route:** rejected because it
  invents policy, collapses evidence binding, and transfers governance scope.
- **Generic JSON operation result or audit metadata:** rejected because it
  creates unchecked contract and sensitive-payload escape hatches.
- **Generic unit of work or workflow engine:** rejected as unearned complexity;
  narrow state machines and a claim-specific transaction port suffice.
- **Automatic destructive migration rollback:** rejected because code reversal
  cannot safely erase or restore identity and PRD 02 history.

## Known limitations

- No production identity provider, provider protocol adapter, tenant, key,
  credential, recovery mechanism, identity assurance level, or paid service is
  selected or validated.
- No legal/privacy policy, notice, consent behavior, eligibility/minors rule,
  sharing rule, retention/deletion rule, residency choice, or proof of legal
  compliance is supplied.
- The policy gateway specifies reference mechanics only. PRD 07 implements no
  governance evidence interaction and stores no raw response/evidence payload.
- The data model can represent separate roles, but real second-role acquisition
  and self-coach linking remain hard-disabled until independently attributable
  founder and applicable legal/privacy decisions clear the exact paths.
- Invitation-only onboarding is the bounded mechanism. Public self-sign-up,
  profile setup, account merge/rebinding, support console, broad coach
  workspace, notification scheduling, and offline claim are excluded.
- Opaque identity/onboarding metadata may still be personal data. Its
  production lifecycle remains blocked pending approved policy.
- Synthetic adapters, disposable migration tests, and Gate A component evidence
  cannot establish production onboarding readiness or PRD completion.
- Passing this design's future gates establishes bounded evidence and zero
  known serious findings under tested conditions, not perfect security,
  availability, privacy, legal compliance, or absence of future defects.

## Gate A evidence required

- exact candidate SHA, clean diff, and independent approval of this Technical
  Design before contract freeze;
- frozen schemas and human registry consistency, with exhaustive closed result
  and nominal-ID provider/consumer tests;
- Red → Green evidence for protected reference derivation, first-binding alias
  replay, fixed cap four, guarded slot release, operation reconciliation,
  atomic claim, dual-role/self-coach denial, and policy-reference isolation;
- PostgreSQL apply/replay/drift, direct-bypass constraints, concurrency,
  interruption, forward correction, and recovery preserving unrelated data;
- Web/API accessibility, session, CSRF/CORS, redaction, secret handling,
  interruption, and enumeration tests;
- pinned exact-head formatting, lint, typecheck, tests, production build,
  repository check, dependency/secret scan, and architecture/scope evidence;
- durable stop evidence that real-user production remains under
  `LEGAL_PRIVACY_DECISION_REQUIRED` and dual-role/self-coach remains separately
  under `FOUNDER_DECISION_REQUIRED` plus applicable legal/privacy clearance;
- no implementation of PRD 21 governance, no legal content/response API, no
  PRD 25 work, and no registry/DAG expansion; and
- independent Agent 90 and QA/security reports for the exact integrated head,
  with zero known `BLOCKER` and zero known `HIGH`.

Gate A applies to each PR. It does not itself authorize real-user activation or
PRD 07 completion while an applicable stop remains active.

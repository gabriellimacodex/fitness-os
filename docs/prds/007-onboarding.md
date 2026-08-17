# PRD 07 — Onboarding

- Status: `APPROVED`
- Approval basis: Inherited from approved parent PRD under Autonomous Pilot V1 authorization
- Parent registry outcome: Student and coach onboarding within approved identity and consent scope
- Dependencies: PRD 02 — `COMPLETED`
- Release gate: Gate A
- External milestone gate: none
- Pre-flight: Independent product, architecture, security, and privacy review required before executable contract freeze
- Stop boundary: Provider- and policy-neutral work with synthetic identities and synthetic policy decisions may proceed; real-user activation remains subject to the explicit stop conditions in this PRD

## Context

PRD 02 established minimal opaque student and coach records and immutable
student–coach relationship history. It deliberately did not establish caller
identity, authorization, profiles, invitations, consent, or onboarding. Fitness
OS now needs the smallest trustworthy path from an authenticated principal to
one of those opaque domain records so a student or coach can enter the PWA
without treating a browser-supplied identifier, an email address, or a
student–coach link as proof of identity or permission.

PRD 21 is separately building policy-neutral privacy-governance mechanics. Its
detailed design is informative integration context, not a new PRD 07 registry
dependency and not authority for PRD 07 to invent legal policy. PRD 07 owns the
authenticated-principal and onboarding boundary that later privacy, body,
notification, and coach-workspace capabilities may consume. It exposes a
narrow policy/notice handoff but does not absorb PRD 21's policy engine,
retention, deletion, audit, or data-subject-request scope.

## Problem

Fitness OS currently cannot safely answer:

- whether a request came from an authenticated principal rather than a caller
  presenting an opaque domain ID;
- whether that principal is mapped to a student record, a coach record, both,
  or neither;
- whether an invitation is authentic, current, intended for the requested
  onboarding role, and still claimable;
- whether a partially completed onboarding attempt can resume without
  duplicate identities, domain records, links, or policy evidence;
- whether two concurrent claims produce one authoritative result;
- whether required policy/notice conditions were satisfied by an approved
  external authority rather than guessed by the onboarding service; or
- how to recover from expired invitations, provider outages, abandoned flows,
  and ambiguous retries without leaking account or relationship existence.

Ad hoc answers would create account takeover risk, duplicate student or coach
records, link possession masquerading as authorization, hidden personal data,
and legal or privacy policy encoded by engineers.

## Users

- A student joining Fitness OS from a coach-issued invitation, primarily on a
  smartphone.
- A coach claiming a controlled bootstrap invitation and establishing the
  coach identity needed for later onboarding-only invitation issuance,
  primarily on desktop or tablet.
- A coach issuing, viewing, or revoking only their own unclaimed student
  onboarding invitations. This is not the broader PRD 18 coach workspace.
- An authorized deployment or support operator issuing the first coach
  bootstrap invitation through a non-public, least-privileged boundary.
- Engineers and security/privacy reviewers integrating future identity and
  governance providers through explicit adapters.

No anonymous visitor, domain identifier holder, active-link holder, or
repository user is implicitly an authenticated or authorized product actor.

## Outcome

Fitness OS has a mobile-first student and desktop-friendly coach onboarding
workflow that:

- accepts only authenticated principal context from a trusted backend identity
  adapter;
- maps that principal to stable opaque PRD 02 student and/or coach records
  without storing profile data;
- uses opaque, single-use, revocable invitations with bounded lifetime and no
  direct contact identifier in the onboarding store;
- completes each claim atomically and idempotently, including the initial
  student–coach link when a student invitation is claimed;
- resumes safely after refresh, provider interruption, or ambiguous response;
- delegates required policy, notice, or authorization evidence to a strict,
  deny-by-default handoff instead of deciding legal policy;
- exposes explicit API, domain, persistence, readiness, and failure contracts;
  and
- remains unavailable to real users until required identity-provider,
  legal/privacy, security, and production-readiness decisions have cleared.

## Scope

### Identity and principal mapping

- Define an internal opaque `PrincipalId`, separate from PRD 02 student,
  coach, and link identifiers.
- Define a trusted `AuthenticatedPrincipalContext` produced only by an API-side
  identity adapter after provider credential/session verification.
- Define an immutable external-principal binding from an approved issuer and a
  stable provider-supplied opaque subject reference to one internal principal.
- Define explicit principal-to-student and principal-to-coach mappings. A
  principal may hold both roles only by successfully claiming a separate valid
  invitation for each role; one role is never inferred from the other.
- Preserve mapping and binding history. Supported application operations do not
  silently reassign a domain record to another principal.
- Keep external identity details behind the adapter. Web code receives neither
  issuer internals nor provider subject identifiers.

### Invitations and claim

- Define two invitation purposes: controlled coach bootstrap and
  coach-issued student onboarding.
- Create high-entropy single-use claim secrets. Persist only a versioned
  verifier/digest and token metadata; never persist or log the plaintext
  secret.
- Keep claim secrets out of URL paths, query strings, telemetry, and server
  logs. A delivery adapter may place the secret in a client-side URL fragment
  or another reviewed non-server-log transport, and the PWA submits it in a
  bounded request body after authentication.
- Allow an authenticated mapped coach to issue and revoke their own unclaimed
  student invitations. A coach bootstrap invitation is issued only through a
  non-public, least-privileged operator/deployment port.
- Bind each student invitation to the issuing coach's opaque coach record so a
  successful student claim atomically creates the PRD 02 student–coach link.
- Derive invitation expiry from server-controlled configuration and trusted
  time. The browser cannot set or extend it. The exact production lifetime is
  a reviewed security configuration, not legal text and not caller input.
- Support explicit issued, claimed, revoked, and expired outcomes without
  deleting historical claim evidence.

### Onboarding workflow

- Authenticate before revealing role, issuer, coach, or claimability details.
- Resolve or create the internal principal binding from trusted identity
  context; never accept principal, student, coach, or provider-subject IDs in a
  claim body.
- Persist a resumable, server-owned onboarding attempt after authentication
  and invitation verification.
- Represent the minimum states `policy_pending`, `ready_to_claim`,
  `completed`, and `terminal`. Provider authentication is a prerequisite, not a
  caller-set state. Terminal reason is a closed internal code.
- Request a policy/notice readiness decision through the handoff defined below.
  Only an approved `ready` result can move an attempt to `ready_to_claim`.
- Complete the invitation claim, PRD 02 domain-record creation, principal-domain
  mapping, onboarding completion event, and—only for a student invitation—the
  initial student–coach link in one transactional command.
- Return the same completed result for an identical operation replay. A
  mismatched reuse or competing principal cannot mutate the completed claim.
- Expose a current-onboarding-state read so a refresh or new device can resume
  from authoritative backend state rather than browser storage.

### Policy and notice handoff

- Define a provider-neutral `OnboardingPolicyGateway` input containing only the
  authenticated internal principal, proposed role, invitation purpose,
  approved policy/package reference when available, and correlation metadata.
- Define a strict result: `ready` with immutable approved requirement/evidence
  references, or `blocked` with a closed safe reason. It is not a generic
  boolean and contains no raw legal copy.
- Define a separate approved-content adapter for notice presentation. The
  onboarding domain stores only version/digest references required by the
  approved policy; it does not author, translate, or persist legal prose.
- Treat consent as one possible evidence mechanism only when an attributable
  approved policy requires it. The software does not assume consent is the
  universal lawful basis.
- Keep synthetic policies, notice fixtures, and evidence visibly synthetic and
  fail production startup/readiness if they are configured there.
- Permit later PRD 21 composition through these ports without making PRD 21 a
  PRD 07 registry dependency or duplicating its governance records.

### Product surfaces

- Add a student mobile-first onboarding flow in the existing Next.js PWA.
- Add a narrow coach desktop/tablet onboarding and student-invitation surface.
- Add Fastify endpoints for current onboarding state, invitation inspection
  after authentication, claim, coach-owned student-invitation issuance, and
  revocation.
- Add a non-public coach-bootstrap issuance command. It is not registered as a
  public Fastify route and is not available to the browser bundle.
- Compose backend identity and policy ports through the API. The web application
  never imports domain or database packages and never accesses PostgreSQL.

### Persistence and operations

- Add the minimum additive PostgreSQL/Drizzle persistence for principals,
  external bindings, role mappings, invitations, onboarding attempts,
  idempotency results, and append-only onboarding transition evidence.
- Extend readiness with safe onboarding dependency checks.
- Add privacy-minimized structured operational events and bounded aggregate
  metrics for onboarding outcomes and dependency health.
- Document forward-only migration, rollback, replay, recovery, provider
  disablement, and invitation-revocation procedures.

## Non-scope

- Selecting or contracting with a production identity provider, identity
  proofing vendor, email/SMS provider, or notification provider.
- Committing production tenant IDs, client secrets, signing keys, API keys,
  certificates, redirect secrets, provider credentials, or real account data.
- Implementing passwords, password reset, multi-factor-authentication policy,
  passkeys, social login policy, account linking policy, session duration,
  provider-specific recovery, or identity assurance levels without a reviewed
  provider/architecture decision.
- Names, email addresses, phone numbers, dates of birth, age, gender, locale,
  avatar, biography, address, emergency contact, or profile completion.
- Deciding eligibility, whether minors may use the product, guardian authority,
  jurisdiction, lawful basis, notice wording, consent language, withdrawal
  effect, retention, deletion, data-subject rights, sharing policy, residency,
  or cross-border transfer.
- Storing raw identity tokens, refresh tokens, passwords, OTPs, provider
  profiles, contact lists, IP addresses, user agents, or arbitrary identity
  claims in product tables or logs.
- Treating a domain ID, invitation ID, invitation secret, role mapping, or
  student–coach link as complete authorization for later product data.
- Coach roster management, student search, profile management, relationship
  ending, training workflows, messaging, support console, or the PRD 18 coach
  workspace.
- Notification scheduling/delivery behavior from PRD 20. A narrow invitation
  delivery adapter is only an onboarding transport boundary and may remain a
  synthetic/manual test adapter.
- PRD 21 policy administration, consent ledger, withdrawal, retention,
  deletion, privacy audit, data-subject requests, or legal decision content.
- Body capture, measurements, health/fitness intake, photos, Digital Twin,
  training prescription, movement guidance, analytics, or AI-generated content.
- Native iOS, Apple Watch, broad offline support, service-worker credential
  caching, or onboarding while offline.
- A new microservice, identity platform, generic workflow engine, message bus,
  cache, or event-sourcing framework.

## UX

### Student mobile flow

1. The invitation landing screen explains only that authentication is required;
   it does not reveal a coach identity or whether a claim secret is valid.
2. Authentication occurs through the configured identity boundary. Provider
   selection and final wording remain outside this PRD until approved.
3. After authentication, the PWA submits the claim secret in a protected body.
   A generic state is shown for invalid, expired, revoked, already-claimed-by-
   another-principal, or unauthorized invitations.
4. If the policy handoff is blocked, the student sees a safe unavailable state
   and recovery option; synthetic or invented legal copy is never substituted.
5. When approved content and evidence requirements are available, the student
   reviews each required item without preselected optional choices or bundled
   unrelated purposes. The final exact presentation remains subject to the
   required legal/privacy determination.
6. Claim completion shows a single clear success state. Refreshing or retrying
   reads the same server result and never creates another student or link.

The flow is designed for narrow smartphone viewports, touch input, unstable
connections, and interrupted navigation. Primary actions remain visible without
horizontal scrolling. Text zoom to 200%, screen readers, keyboard-only use,
high contrast, reduced motion, and platform autofill behavior must remain
usable. Focus moves to the first actionable error or status heading. Errors are
announced through an appropriate live region and never rely on color alone.

The invitation secret is not written to analytics, error reports, route logs,
local storage, or service-worker caches. If temporarily held in browser memory,
it is cleared on terminal outcome, sign-out, and abandonment timeout. Offline
claim is unavailable; the UI explains that a connection is required without
claiming that data was saved.

### Coach flow

The coach claim flow follows the same authentication, policy handoff,
idempotency, and recovery rules. After completion, the coach receives only a
narrow onboarding invitation view that works well on desktop and tablet:

- issue a student invitation;
- copy or hand off the one-time claim material through the configured delivery
  adapter;
- view only safe status, creation time, and expiry for invitations issued by
  that coach; and
- revoke an unclaimed invitation.

The view contains no student profile, email, phone, search, roster, training
data, body data, or broad relationship management. Secret material is shown at
most once at issuance and never appears again in lists or API reads.

### Recovery UX

- Refresh and sign-in on another device resume from authoritative state.
- Provider outage preserves the invitation and attempt when safe; retry does
  not advance state locally.
- Expired or revoked invitations direct the person to request a new invitation
  through the same onboarding channel without confirming a domain record.
- A completed identical claim returns success, including after an ambiguous
  network failure.
- A changed provider subject, suspected account takeover, or provider-specific
  recovery requirement is not handled by manually changing domain mappings.
  It routes to a separately authorized recovery process and remains unavailable
  until that process is defined and verified.
- Public support messages never expose whether a particular student, coach,
  principal, invitation, or relationship exists.

## Business rules

### Identity boundary

- Authentication proves only the identity-adapter assertion represented by the
  trusted principal context. It does not by itself grant access to a student,
  coach, link, or later capability.
- The API constructs authenticated principal context. Browser fields, headers,
  cookies outside the selected verified session mechanism, JWT payloads not
  verified by the adapter, and domain IDs are untrusted.
- A provider binding is unique by approved issuer plus stable opaque subject
  reference. One binding resolves to exactly one internal principal.
- One internal principal has at most one active student mapping and at most one
  active coach mapping. A student or coach record has at most one active
  principal mapping. Mappings across roles are never inferred.
- A person may claim both roles only through distinct valid invitations and
  explicit completed mappings. This permits the PRD 02 model without making a
  global role or authorization claim.
- External subject references are protected identifiers. They are not returned
  by product APIs, included in routine logs, or used as domain record IDs.
- A provider account change does not rewrite a principal-domain mapping. Any
  future rebinding requires verified recovery authority, immutable transition
  evidence, concurrency protection, and independent security review.

### Invitation integrity

- Invitation and operation identifiers are separately branded server-generated
  UUIDv4 values. Claim secrets contain at least 128 bits of cryptographic
  entropy and are generated by a trusted backend source.
- Only a verifier derived with a versioned approved cryptographic mechanism is
  stored. Comparison is constant-time where applicable.
- A coach bootstrap invitation has no public issuance route. A student
  invitation records the authenticated issuing principal and mapped coach.
- Issuance returns plaintext claim material once. Read/list operations never
  return it.
- Expiry, revocation, and claim are server-controlled terminal transitions.
  Claimed or revoked invitations cannot be reactivated. Expiry does not delete
  transition history.
- Inspection and claim use equivalent safe failures for unknown, malformed,
  expired, revoked, unauthorized, or competing-principal secrets where a
  distinction would disclose existence or state.
- Rate limiting, request-size limits, and bounded failed-claim controls apply
  before expensive identity or database work. Exact thresholds are
  security-reviewed configuration and never weaken safe error behavior.

### State and atomic completion

- Onboarding state advances only forward:
  `policy_pending → ready_to_claim → completed`. A failure that cannot be
  retried safely transitions the attempt to `terminal`; a terminal attempt is
  never reopened in place.
- Policy readiness is authoritative at the time of claim. A stale browser view
  cannot bypass a new blocked decision or version requirement.
- Invitation claim locks the invitation, principal, affected role mapping, and
  target PRD 02 domain rows in deterministic order.
- Coach completion creates exactly one coach record and mapping.
- Student completion creates exactly one student record, mapping, and active
  link to the invitation's coach. Missing or no-longer-valid coach context
  rejects the whole claim.
- Domain IDs, link IDs, timestamps, operation keys, token material, and content
  digests are server-owned. The browser supplies none of them.
- No completed domain record, mapping, link, transition, or operation-ledger row
  survives a failed claim transaction.
- Historical invitation, attempt, binding, mapping, and transition facts are
  immutable to ordinary application operations. Future authorized privacy
  lifecycle work may apply separately approved deletion or transformation
  rules; PRD 07 does not choose them.

### Idempotency and concurrency

- Every mutating command uses a namespaced operation key and a digest over the
  complete server-canonicalized semantic input.
- Replaying the same key and digest returns the committed typed result without
  another row or transition. Reusing the key with different input returns a
  typed conflict and makes no mutation.
- Two principals racing to claim one invitation produce at most one completed
  mapping. The loser receives the safe generic unavailable result.
- The same principal racing identical claims receives one committed result and
  one replay of that result.
- Concurrent role claims cannot create duplicate role mappings or map one
  domain record to two principals.
- Concurrent revoke and claim serialize on the invitation. Exactly one terminal
  transition wins; no intermediate domain rows survive the losing command.
- Concurrent student claims against the same coach reuse PRD 02's pair-history
  constraints and do not weaken its relationship invariants.

### Policy/notice boundary

- Missing, synthetic-in-production, stale, integrity-invalid, or blocked policy
  input denies claim completion.
- A ready decision is pinned to an immutable policy/requirements version and
  evidence references. A later version does not rewrite completed history.
- The onboarding service never interprets legal text, decides whether an item
  is legally required or optional, or infers withdrawal consequences.
- Notice rendering is plain content from an approved versioned source. No
  arbitrary HTML, script, remote embed, or provider response is rendered.
- Policy evidence and notice content remain minimized. Routine onboarding logs
  contain neither raw content nor evidence payload.

## Data

Executable schemas are frozen later in `packages/schemas`; this PRD bounds the
contract groups without creating a second runtime definition.

### Identity records

- Principal: opaque principal ID, lifecycle, and trusted creation timestamp.
- External binding: opaque binding ID, principal ID, approved issuer key,
  stable opaque subject reference or adapter-produced protected equivalent,
  lifecycle, provider-contract version, trusted timestamps, and immutable
  transition provenance.
- Role mapping: opaque mapping ID, principal ID, exact role, corresponding
  branded PRD 02 student or coach ID, lifecycle, trusted timestamps, and
  provenance.

No identity record contains name, email, phone, password, token, provider
profile, free-form metadata, or role permissions. Provider subject references
and all mappings are protected personal data even when opaque.

### Invitation and onboarding records

- Invitation: opaque invitation ID, purpose, issuer principal when applicable,
  target coach for student invitations, verifier version and digest, lifecycle,
  server expiry, operation provenance, and trusted timestamps.
- Attempt: opaque attempt ID, invitation ID, principal ID, current state,
  pinned policy/requirements reference, safe terminal reason when applicable,
  and trusted timestamps.
- Completion: role mapping ID, created PRD 02 record ID, optional created link
  ID, invitation ID, attempt ID, operation key, and completion timestamp.
- Transition evidence: opaque event ID, aggregate ID, closed event kind,
  previous/next state, operation key, safe reason code, and trusted timestamp.
- Operation result: namespaced key, canonicalization version, input digest,
  status, typed result kind/result, and trusted timestamps.

Plain claim secrets, raw identity assertions, legal copy, consent responses,
database errors, and arbitrary metadata are prohibited fields.

### Data minimization and lifecycle

- Invitation issuance does not create a student or coach record.
- Abandoned attempts contain no profile or contact information.
- Listing returns only the minimum coach-owned invitation status fields; no
  secret verifier, subject reference, principal ID, or student record is exposed.
- Routine application repositories provide no hard-delete or in-place history
  rewrite. Retention and deletion are not assumed to be indefinite; they remain
  governed by later approved PRD 21 policy and the legal/privacy stop.
- Synthetic fixtures use unmistakably fictitious values and cannot pass
  production readiness.

## Contracts

### Contract authority and freeze

`packages/schemas` remains the executable Source of Truth. `docs/contracts`
records symbol ownership, providers, consumers, and freeze status without
independently restating fields. Because onboarding changes public API behavior
and introduces authenticated boundaries, an independent pre-flight and one
coordinated contract freeze occur before Web, API/Domain, and Data work proceed.

The freeze may add or coordinate:

- branded principal, identity-binding, role-mapping, invitation, attempt,
  transition, operation, and completion identifiers;
- strict lifecycle and typed-result schemas;
- authenticated current-state, invitation-inspection, claim, coach issuance,
  and revocation request/response schemas;
- a safe onboarding readiness schema or closed readiness classifications;
- `UNAUTHENTICATED`, `FORBIDDEN`, and `CONFLICT` variants in the shared API
  error-code contract if pre-flight confirms they are required; all existing
  providers and consumers must update in the same coordinated freeze; and
- compile-time tests proving PRD 02 and PRD 07 identifier brands are not
  cross-assignable.

Unknown fields, hidden identity claims, caller IDs/timestamps, unbounded text,
and token-bearing URL fields are rejected.

### Domain ports

API/Domain owns narrow ports for:

- resolving trusted authenticated context to an internal principal;
- binding and reading external principal relationships;
- reading principal-to-student/coach mappings;
- issuing, inspecting, revoking, and claiming onboarding invitations;
- reading/resuming an onboarding attempt;
- evaluating policy/notice readiness;
- creating the required PRD 02 student, coach, and link records through the
  existing domain repositories; and
- resolving idempotent operation results.

Ports return exhaustive typed outcomes: success/replay, invalid or unavailable
invitation, unauthenticated, forbidden, policy blocked, mapping conflict,
operation-input mismatch, dependency unavailable, or internal corrupt state as
appropriate. Database constraint names, identity-provider errors, token
verification details, and raw policy/provider payloads are not domain or HTTP
contracts.

### HTTP surface

The final route names are fixed during executable contract freeze, but the
authorized responsibilities are:

- authenticated current onboarding state;
- authenticated invitation inspection using a bounded body-held claim secret;
- authenticated atomic invitation claim with an idempotency key;
- authenticated mapped-coach issuance of a student invitation;
- authenticated mapped-coach revocation of their own unclaimed invitation; and
- identity-provider start/callback/session composition only after the provider
  and session architecture are approved.

Fastify supplies authenticated context to handlers. No endpoint accepts a
principal ID, provider subject, student ID, coach ID, or target coach ID as an
authority claim. Public errors use the shared safe envelope and server-generated
request correlation. Missing authentication is distinct from a malformed
request, while resource and ownership distinctions are minimized to prevent
enumeration.

The non-public coach-bootstrap command uses a separate least-privileged
operational entry point, strict environment binding, idempotency, and generic
output. It is not registered in API routes or bundled into web assets.

## Persistence requirements

- Use one additive PostgreSQL/Drizzle migration generated only after all earlier
  migrations on main are integrated. Exactly one global migration owner works
  on it.
- Keep identity/onboarding tables separate from PRD 02 `students`, `coaches`,
  and `student_coach_links`; do not add contact/profile/auth columns to those
  frozen domain records.
- Enforce unique issuer/subject binding, one active mapping per principal/role,
  one active principal per domain record, unique invitation verifier, one
  terminal invitation result, positive/bounded timestamps, valid state
  transitions, and namespaced operation uniqueness at the database boundary.
- Use deferred constraints or constraint triggers where a claim must atomically
  create cross-table mapping, completion, transition, and PRD 02 link evidence.
- Keep history tables append-only to the ordinary application role. No
  application hard-delete repository is introduced.
- Use stable lock order and explicit transaction isolation for claim/revoke and
  concurrent mapping races.
- Use parameterized queries and strict adapters. Persistence output is parsed
  through executable schemas before crossing the domain boundary.
- Index only exact binding, current mapping, invitation verifier/status,
  operation key, current attempt, and coach-owned invitation queries required
  by the authorized flow. No generic people search is introduced.
- Migration validation must cover clean apply, exact schema/metadata, replay,
  deliberate interruption, forward correction, and recovery while preserving
  unrelated sentinel data.

Applied migrations are immutable. A correction is a new forward migration. A
code rollback never claims to remove committed onboarding identities or
relationships.

## Security and privacy

### Required controls

- Deny when authenticated context is absent, invalid, expired, integrity-
  invalid, issued by an unapproved issuer, or inconsistent with a binding.
- Use an identity adapter behind an interface. Provider SDK types and claims do
  not enter domain contracts.
- Validate issuer, audience, nonce/state, signature, expiry, redirect binding,
  and replay protections required by the selected provider protocol before
  constructing trusted context. Exact protocol details wait for Technical
  Design and provider selection.
- Use secure, HttpOnly, same-site session protections or an equivalently
  reviewed browser/API mechanism after the session architecture is approved.
  Do not store bearer credentials in local storage or service-worker caches.
- Apply CSRF protection to credentialed mutations, explicit CORS, bounded body
  limits, rate limiting, constant-time secret verification, and generic claim
  errors.
- Rotate invitation verifier mechanisms forward. Rotation does not reactivate
  expired/revoked/claimed invitations or invalidate historical evidence.
- Separate public application, coach-bootstrap issuance, and any future
  recovery/operator privileges. No generic admin or support super-role.
- Use least-privileged database roles and environment secrets. Never expose raw
  provider/database/policy errors to the PWA.
- Protect all principal mappings and invitation metadata as personal data.
  Student data remains private by default.
- Keep secrets out of commits, fixtures, snapshots, screenshots, URLs, logs,
  metrics, traces, analytics, and review artifacts.
- Build a threat model covering token theft, invitation forwarding, account
  takeover, session fixation, CSRF, callback replay, subject collision,
  mapping takeover, claim/revoke races, enumeration, brute force, log leakage,
  synthetic-policy activation, and operator misuse.

### Legal/privacy stop

`LEGAL_PRIVACY_DECISION_REQUIRED` is active before any real-user path depends
on an unresolved determination about:

- applicable jurisdictions or regulatory assumptions;
- product legal roles and accountable decision-makers;
- user eligibility, age thresholds, minors, guardian/agent authority, or
  age-dependent consent;
- collection purpose, lawful basis or other authority, required evidence,
  notice wording, consent language, locales, presentation, or version changes;
- withdrawal consequences, retention, deletion, legal holds, or the lifecycle
  of identity/onboarding evidence;
- student–coach sharing, provider/subprocessor use, secondary use, analytics,
  model training, or automated decisions;
- identity assurance required for onboarding or future data-subject requests;
  and
- residency, cross-border transfer, disclosure, or provider data handling.

While this stop is active, implementation may use strict parameter shapes,
closed deny reasons, synthetic adapters, synthetic notices visibly labeled as
non-production, disposable data, and fail-closed readiness. It may not present
agent-authored legal copy to real users, activate guessed policy, collect real
user data, or represent the affected path or PRD as production-ready or
complete.

The decision packet needed to clear the stop must identify the actors and data,
jurisdictions or explicit assumptions, data flow, eligibility/minors decision,
approved purpose and authority, notice/evidence requirements, withdrawal and
lifecycle consequences, provider roles, approver authority, effective version
and time, and affected production paths. Silence, roadmap placement, generated
prose, a synthetic test, or a green build is not approval.

### Provider, credential, architecture, and financial stops

- Provider-neutral interfaces, protocol-independent contracts, local fakes,
  and synthetic identity tests do not require production credentials and may
  proceed.
- Selecting a production identity provider requires a reviewed Technical
  Design covering protocol, browser/API session topology, assurance, recovery,
  tenant isolation, data handling, availability, migration/exit, and adapter
  boundaries. The provider is not selected in this PRD.
- If a material identity/session topology remains unresolved after three
  meaningful correction rounds, stop with exactly
  `ARCHITECTURE_DECISION_REQUIRED`; do not hide the conflict in an adapter.
- When current acceptance or a mandatory gate requires an unavailable provider
  tenant, `AUTH_PROVIDER_SECRET`, signing key, certificate, protected role, DNS
  grant, or production environment permission, stop under
  `EXTERNAL_CREDENTIAL_REQUIRED`. State the exact least-privilege access needed
  and never invent or commit it.
- Before accepting an unapproved paid provider, plan, contract, message fee, or
  resource reservation, stop under `FINANCIAL_COMMITMENT_REQUIRED`.
- Credential, architecture, or financial clearance does not clear the
  independent legal/privacy stop.

## Failure modes

| Failure or race                                                                        | Required behavior                                                                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Missing or invalid authenticated context                                               | Reject before invitation/domain lookup; safe unauthenticated response                                          |
| Unapproved issuer or invalid provider assertion                                        | Reject and emit redacted integrity classification; no binding mutation                                         |
| Identity provider unavailable                                                          | Preserve authoritative state; safe temporary-unavailable response; no local authentication fallback            |
| Unknown, malformed, expired, revoked, or inaccessible invitation                       | Generic unavailable/not-found result without state or role disclosure                                          |
| Claim secret brute force or rate breach                                                | Throttle/deny generically; do not reveal partial matches or account existence                                  |
| Invitation replay by completing principal                                              | Return the committed completed result with zero row changes                                                    |
| Invitation replay by another principal                                                 | Generic unavailable result; no mapping or domain detail                                                        |
| Operation key reused with different input                                              | Typed internal conflict and zero mutation                                                                      |
| Concurrent claim/claim                                                                 | One terminal result; identical authorized retry replays; competitor makes no mutation                          |
| Concurrent claim/revoke                                                                | One terminal result; loser observes safe terminal state; no partial rows                                       |
| Principal already mapped for requested role                                            | Typed mapping conflict; preserve existing mapping and invitation unless policy explicitly permits another path |
| Domain record already mapped to another principal                                      | Deny as conflict without disclosing the existing principal                                                     |
| Student invitation coach/link context invalid                                          | Reject entire claim; create no student, mapping, event, or link                                                |
| Policy/notice gateway missing, synthetic in production, blocked, stale, or unavailable | Claim remains incomplete; readiness/route fails closed; no guessed content/evidence                            |
| Policy version changes during claim                                                    | Re-evaluate and pin one approved version before commit; stale result cannot complete                           |
| Persistence unavailable                                                                | Safe service-unavailable response; no provider/database/host detail                                            |
| Snapshot or stored-state contract mismatch                                             | Fail closed as internal error; do not repair history from browser input                                        |
| Browser refresh or ambiguous response                                                  | Read authoritative state and replay idempotent command; never duplicate records                                |
| Provider subject changes during recovery                                               | Do not rebind automatically; route to separately authorized verified recovery                                  |
| Migration failure                                                                      | Stop deployment; preserve prior compatible schema and unrelated data; forward-fix only                         |
| Mandatory onboarding event cannot commit                                               | Roll back the corresponding mutation; no best-effort success                                                   |
| Close/shutdown during in-flight claim                                                  | Let the bounded transaction commit or roll back; reconcile operation ledger before retry                       |
| Legal/privacy parameter unresolved                                                     | `LEGAL_PRIVACY_DECISION_REQUIRED`; keep real-user path disabled                                                |
| Required production credential unavailable                                             | `EXTERNAL_CREDENTIAL_REQUIRED`; keep synthetic path distinct and disabled in production                        |

## Recovery and rollback

- The idempotency ledger is the first recovery source after timeout or process
  loss. A committed result is replayed; pending/ambiguous work is reconciled
  against invitation, mapping, PRD 02 record/link, and transition state before
  retry.
- Operator procedures may revoke unclaimed invitations by ID through the
  restricted port. They cannot read secrets, force-claim, map a principal,
  rewrite completion, or bypass policy readiness.
- Provider outage uses backoff and an unavailable state; it never creates a
  local password or accepts unverified claims.
- Session loss requires reauthentication. Server-side attempt and completion
  state remains authoritative.
- Provider-account recovery that preserves the verified provider subject may
  resume normally. Subject replacement, issuer migration, account merge, and
  disputed ownership require a separately designed, reviewed, immutable
  rebinding workflow and applicable stops.
- Database recovery is forward-fix-first. Restore is last resort, bounded to
  proven affected data, and must preserve unrelated writes. Committed identity
  or relationship history is never silently discarded to make a deployment
  easier.
- Disabling onboarding prevents new issuance/claim while preserving existing
  records. It does not delete domain records or end PRD 02 links.
- Recovery evidence uses synthetic accounts and disposable infrastructure
  until production credentials, policy, and data handling are approved.

## Readiness

Onboarding exposes a component readiness result that composes into the existing
API readiness boundary without disclosing dependency detail.

Mechanism readiness requires:

- exact required migration and schema markers;
- functioning trusted clock, random-ID source, invitation-secret generator,
  verifier version, and idempotency ledger;
- strict identity and policy port composition;
- exact expected issuer/session adapter configuration for the environment;
- operation/event integrity checks and current recovery evidence; and
- no synthetic adapter accidentally selected outside explicitly synthetic
  environments.

Production onboarding readiness additionally requires:

- an approved identity/session Technical Design and production adapter;
- attributable provider configuration and all required least-privilege
  credentials;
- completed threat model and production-representative provider/session tests;
- an attributable approved policy/notice package and non-synthetic policy
  gateway;
- all applicable legal/privacy decisions, including minors and jurisdiction;
- approved identity/onboarding data lifecycle and recovery behavior; and
- no active applicable stop condition.

Until those requirements are met, `production_onboarding_ready` is false. Safe
diagnostics use closed classifications such as migration missing, identity
adapter missing/synthetic/integrity-invalid, policy missing/synthetic/blocked,
credential unavailable, recovery unverified, configuration mismatch, or
active stop condition. Public readiness remains only ready/not-ready and never
returns issuer, tenant, host, policy text, subject IDs, secrets, or raw errors.

## Observability minimization

- Structured events include request/correlation ID, namespaced operation ID,
  closed workflow stage, safe outcome/reason, duration, adapter class/version,
  and trusted timestamp.
- They exclude claim secrets/verifiers, cookies, tokens, provider subject or
  issuer payloads, principal/student/coach/link IDs in routine logs, names,
  contact data, policy/notice text, evidence payloads, request bodies, SQL,
  database/provider errors, stack traces in public output, and credentials.
- Security audit references, when approved, use protected opaque locators and
  remain separate from routine operational logs.
- Aggregate metrics cover attempted/completed/blocked/expired/revoked outcomes,
  replay/conflict counts, latency, and dependency availability. Low-volume
  dimensions are coarsened or omitted to reduce singling-out risk.
- No third-party analytics, session replay, advertising pixel, or remote error
  provider is introduced by this PRD. PRD 23 owns pilot observability content.
- Logs and metrics never become evidence that legal consent occurred.

## TDD and verification plan

Every implementation behavior follows observable Red → minimal Green →
Refactor evidence.

### Contract tests

- Accept every intended identifier, invitation, state, result, readiness, and
  HTTP variant through strict executable schemas.
- Reject malformed/cross-branded IDs, unknown fields, caller authority IDs,
  caller timestamps, token-bearing URLs, unbounded input, hidden profile/contact
  fields, and raw provider/policy payloads.
- Prove provider and Web consumers parse the same frozen success/error shapes.
- Exhaustively type-check lifecycle and typed result unions.

### Domain tests

- Principal binding uniqueness and role-specific mapping without role inference.
- Coach and student claims, including exact PRD 02 record/link effects.
- Forward-only attempt and invitation transitions.
- Same-key replay, mismatched-key conflict, ambiguous retry, claim/claim,
  claim/revoke, duplicate mapping, and invalid coach-context races.
- Policy missing/blocked/stale/synthetic-in-production behavior.
- Trusted clock, UUID, cryptographic secret, canonical digest, and no caller-
  owned server-field behavior.
- Source-boundary tests proving domain code imports no provider SDK, Fastify,
  Next.js, React, Drizzle, PostgreSQL driver, or database package.

### API and identity-adapter tests

- Missing/invalid/expired provider context rejects before protected lookup.
- Issuer, audience, signature, expiry, nonce/state, callback replay, and session
  protections are tested against the selected adapter contract with synthetic
  keys; real-provider acceptance remains separately stopped until credentials
  are supplied.
- Public routes never accept principal/domain IDs as authority and never expose
  identity-provider or policy internals.
- Generic enumeration-resistant invitation failures, request correlation,
  CORS, CSRF, body limits, rate limiting, and error redaction.
- Non-public bootstrap issuance is unreachable from API registration and Web
  bundles.
- API success and failure payloads parse through shared schemas.

### Persistence and migration tests

- Clean PostgreSQL apply and exact tables, columns, indexes, constraints,
  triggers, seeds-if-any, migration journal, and metadata.
- Database rejection of duplicate binding, mapping takeover, invalid state
  transition, multiple terminal claim, eventless transition, and operation
  mismatch when service validation is bypassed.
- Atomic rollback at each material coach/student claim failure point, including
  zero surviving PRD 02/domain mapping/link rows.
- Real PostgreSQL concurrency tests for claim/claim, claim/revoke, mapping, and
  operation races.
- Migration replay, partial-failure interruption, new forward correction,
  drift detection, and recovery preserving unrelated sentinel rows.
- Database unavailability and corrupt-row failures remain internal and redacted.

### Web/PWA and accessibility tests

- Student narrow-viewport, touch, keyboard, screen-reader, text-zoom, focus,
  live-region, contrast, and reduced-motion behavior.
- Coach desktop/tablet issuance, one-time secret display, list redaction, and
  revocation behavior.
- Refresh/resume, ambiguous retry, provider/policy outage, expiry, revocation,
  and generic terminal states.
- No invitation secret in URL path/query, local storage, service-worker cache,
  analytics, logs, screenshots, or rendered history after terminal completion.
- Browser tests prove all product calls go through Fastify and no Web code
  imports domain/database/provider SDK internals.

### Security, privacy, and recovery tests

- Threat-model tests for invitation theft/forwarding, callback replay, session
  fixation, CSRF, brute force, enumeration, subject collision, mapping takeover,
  synthetic-policy activation, secret leakage, and operator misuse.
- Secret and fixture scanning across commits, build output, logs, test
  snapshots, and browser artifacts.
- Synthetic-only policy/provider hard-disable in production configuration.
- Close/shutdown and ambiguous transaction reconciliation.
- Forward recovery and last-resort restore rehearsal with unrelated writes
  preserved.
- A legal/privacy decision checklist proving every unresolved real-user path
  remains disabled rather than marked not applicable.

No live identity provider, real credential, real user, legal notice, contact
address, or production database is used in ordinary tests. Synthetic identity
and policy adapters prove mechanics only and can never satisfy production
readiness or PRD completion.

## Rollout plan

### Phase 0 — design and contract pre-flight

- Independently review this PRD, the identity/session trust boundary, policy
  handoff, data minimization, threat model, migration ownership, and stop
  conditions.
- Produce a Technical Design before executable contract freeze.
- Record unresolved provider, legal/privacy, credential, and architecture
  decisions without selecting defaults.

### Phase 1 — synthetic mechanism

- Freeze strict shared contracts.
- Implement provider-neutral identity/policy ports, local synthetic adapters,
  domain state machines, and disposable PostgreSQL persistence.
- Build student and coach UI against synthetic states only, clearly unavailable
  in production composition.
- Pass component Gate A for each reviewed PR without claiming production
  onboarding or PRD completion.

### Phase 2 — production decision clearance

- Obtain attributable legal/privacy decisions for jurisdiction, eligibility and
  minors, purposes/authority, notice/evidence, lifecycle, sharing, provider
  processing, and recovery.
- Select and review the identity/session architecture and provider behind the
  adapter. Clear any `ARCHITECTURE_DECISION_REQUIRED`,
  `EXTERNAL_CREDENTIAL_REQUIRED`, `FINANCIAL_COMMITMENT_REQUIRED`, and
  `LEGAL_PRIVACY_DECISION_REQUIRED` conditions independently.
- Freeze any coordinated contract changes caused by approved decisions.

### Phase 3 — production-representative validation

- Compose the non-synthetic provider and approved policy gateway in a protected
  environment with synthetic or explicitly authorized controlled accounts.
- Validate redirect/session security, recovery, concurrency, migrations,
  readiness, safe observability, accessibility, and disable/rollback procedures.
- No uncontrolled real-user invitation or data collection occurs during this
  phase.

### Phase 4 — bounded activation

- Enable onboarding only for the approved environment and cohort through a
  server-controlled kill switch after all completion criteria and Gate A pass.
- Monitor privacy-minimized outcomes and dependency health. Disable new claims
  on integrity, policy, provider, or readiness regression without deleting
  existing identities or links.
- Expansion beyond the approved cohort, provider, roles, policy, or geography
  requires corresponding attributed approval and gate evidence.

## Acceptance criteria

1. An independently reviewed Technical Design resolves the provider-neutral
   authenticated-principal, browser/API session, invitation, policy handoff,
   idempotency, migration, recovery, and threat-model boundaries before
   executable contract freeze.
2. Strict Zod schemas and inferred types are frozen for all authorized shared
   identifiers, states, operations, public request/response variants, and safe
   errors. Provider and consumer tests use those schemas; PRD 02 identifiers
   remain nominally distinct.
3. No request can construct authenticated principal context from caller-supplied
   principal, student, coach, link, issuer, or provider-subject data. Missing or
   invalid trusted context denies before protected lookup.
4. External bindings and principal-to-domain mappings are unique, role-specific,
   history-preserving, and concurrency-safe. A principal may hold both roles
   only through separate successful invitations; no role or permission is
   inferred.
5. Coach-bootstrap and student invitations are opaque, high entropy,
   single-use, expiring, revocable, verifier-only at rest, enumeration-
   resistant, and absent from URL paths/queries, logs, telemetry, snapshots,
   browser persistence, and repeat reads.
6. A coach claim atomically creates one PRD 02 coach record and mapping. A
   student claim atomically creates one student record, mapping, and initial
   link to the invitation coach. Injected failures leave zero partial rows.
7. Mutations use server-canonicalized namespaced idempotency. Identical retry
   returns the original typed result with zero row changes; mismatched reuse and
   concurrent claim/revoke/mapping races preserve one authoritative outcome.
8. Refresh, provider interruption, ambiguous response, expiry, revocation, and
   safe retry recover from backend state without duplicate records or account-
   existence disclosure. Subject-changing recovery cannot bypass a separately
   approved verified rebinding workflow.
9. Policy/notice readiness is a deny-by-default typed handoff. Missing, stale,
   blocked, or synthetic-in-production policy prevents completion. The
   onboarding code contains no invented legal copy, lawful-basis assumption,
   minors decision, jurisdiction, withdrawal consequence, retention period, or
   raw consent payload.
10. The student experience passes mobile accessibility and interruption tests;
    the coach experience passes desktop/tablet accessibility and one-time-
    secret redaction tests. Offline claim and service-worker credential caching
    are absent.
11. Public Fastify routes validate every boundary, use shared safe errors and
    server request correlation, enforce authentication/CSRF/CORS/body/rate
    controls, and expose no provider/database/policy internals. Bootstrap
    issuance is statically and dynamically unreachable from public/Web paths.
12. PostgreSQL migration and repository tests prove clean apply, exact schema,
    database-bypass constraints, transaction rollback, concurrency, replay,
    drift, forward correction, and recovery without harming unrelated data.
13. Readiness fails closed on missing/synthetic/integrity-invalid identity or
    policy composition, migration mismatch, credential absence, recovery gaps,
    or active stops and discloses only safe classifications internally and
    ready/not-ready publicly.
14. Operational logs, metrics, traces, errors, screenshots, and review evidence
    contain no secret, token, provider subject, profile/contact data, legal
    content, raw evidence, SQL, credential, or full domain record. Security and
    privacy scans pass on the exact candidate.
15. Identity provider/session architecture and provider selection are reviewed;
    required production credentials are supplied through approved secret
    management; no unapproved financial commitment exists; and no unresolved
    architecture stop remains.
16. Every applicable jurisdiction, eligibility/minors, authority, notice,
    evidence, lifecycle, sharing, provider-processing, and recovery decision is
    attributable and approved. If any is required but unresolved,
    `LEGAL_PRIVACY_DECISION_REQUIRED` remains active and real-user activation
    and PRD completion do not pass.
17. Exact-head lint, formatting, strict typecheck, unit, Web, API, domain,
    PostgreSQL integration, migration, production build, repository check,
    dependency/secret scan, accessibility/E2E, and recovery evidence pass.
18. Independent Agent 90, QA/security, architecture, scope, contracts,
    migrations, accessibility, and privacy reviews report zero open `BLOCKER`
    and `HIGH` findings; required documentation and the Gate A record are
    current.
19. The implementation introduces no PRD 18 coach workspace, PRD 20
    notification product behavior, PRD 21 governance engine, body/training
    intake, profile system, native client, AI behavior, real test data, or
    registry/DAG change.

## Metrics

- 100% of public onboarding request/response and error variants parse through
  frozen executable schemas in provider and consumer tests.
- 100% of tested successful student and coach claims have exactly one internal
  principal, one role mapping, one PRD 02 domain record, and—only for
  students—one initial link.
- 0 duplicate domain records, mappings, links, terminal invitation transitions,
  or operation results across tested identical retries and concurrency races.
- 0 known paths accept a browser-supplied domain or provider identifier as
  authenticated authority.
- 0 plaintext invitation secrets, provider credentials/tokens, profile/contact
  fields, legal copy, or real-user records in persistence, logs, fixtures,
  snapshots, build artifacts, or review evidence.
- 100% of required production identity, policy, legal/privacy, migration, and
  recovery readiness checks fail closed when missing or synthetic.
- 100% of critical student onboarding screens pass the approved automated
  accessibility suite; any required subjective trust/usability assessment is
  reported honestly and, if material, handled under `HUMAN_PERCEPTION_REQUIRED`.
- 0 known `BLOCKER` and 0 known `HIGH` findings at merge and completion.

These metrics are evidence from tests and reviews. They do not claim perfect
security, legal compliance, zero possible defects, or production reliability
beyond the tested environments.

## Technical constraints

- Preserve Node.js 24.18.0, pnpm 10.24.0, strict TypeScript, Zod, Fastify,
  Next.js App Router, PostgreSQL, Drizzle, Vitest, and the dist-first workspace
  model.
- Remain a modular monolith. The PWA calls Fastify; Next.js, including Server
  Components, never accesses PostgreSQL or imports domain/database packages.
- Shared API/data contracts are strict Zod schemas in `packages/schemas`.
  Prose references them after freeze and does not become a competing runtime
  definition.
- Domain owns behavior and ports. Persistence and provider adapters implement
  those ports; provider SDKs, Fastify, React, Next.js, Drizzle, and PostgreSQL
  drivers do not enter domain code.
- Important providers stay behind interfaces and adapters. No provider SDK or
  dependency is added before Technical Design, exact pinning, security/privacy
  review, maintenance review, and applicable stop-condition clearance.
- One global Data/Infrastructure owner creates migrations at a time from the
  latest integrated migration head. Applied migrations are never edited.
- Use server-controlled UTC time, cryptographically secure randomness,
  parameterized persistence, bounded inputs/collections, stable lock order,
  and explicit typed outcomes.
- Preserve PRD 02 student, coach, and link contracts and semantics. Mapping and
  onboarding do not reinterpret an active link as authorization.
- Preserve PP-01 through PP-12: PWA first, student mobile first, coach desktop
  friendly, privacy by default, immutable ordinary history, provider adapters,
  explicit APIs, and simplicity until complexity is earned.
- Add no service worker/offline credential behavior under this PRD. PRD 19 owns
  production PWA hardening.
- New dependencies must be minimal, exactly pinned, and independently reviewed.

## Dependencies and sequencing

### Registry dependency

- PRD 02 — Student & Coach Domain: `COMPLETED`, Gate A passed.

PRD 02 is the only registry dependency. This document does not add PRD 21 or
any other PRD to the DAG. PRD 21's in-progress design is informative context
for a future policy/notice handoff and deny-by-default production composition;
it is not treated as completed or silently required for safe synthetic PRD 07
mechanism work.

### Governing dependencies

- Product Principles.
- Accepted ADRs 001–006.
- Frozen PRD 01 platform error/readiness contracts and PRD 02 student, coach,
  and link contracts.
- Autonomous Delivery Charter, Stop Conditions, Release Gates, reviewer
  independence, and multi-agent ownership/migration rules.

### Execution order

1. Detailed PRD independent pre-flight.
2. Identity/session and onboarding Technical Design, threat model, and stop
   matrix review.
3. Coordinated executable contract freeze and human contract registry update.
4. Isolated Web, API/Domain, and Data implementation against the exact freeze.
5. Serialized API composition and single-owner migration integration.
6. Synthetic integration, accessibility, security/privacy, migration,
   recovery, and exact-head review/correction.
7. Production provider and legal/privacy decision clearance when required.
8. Production-representative validation and Gate A completion evidence.

Parallel work is optional. Shared schema barrels, API registration, root
configuration, contract registry, and migration metadata remain
Orchestrator-coordinated or single-owner paths.

## Release gate and completion

Gate A applies to every PR. PRD 07 has no registry-required Gate B or Gate C
milestone. Migration validation is required, not `NOT_APPLICABLE`.

Policy-neutral, synthetic implementation PRs may pass their own Gate A while
production activation stops remain accurately recorded. That does not make the
real-user path ready and does not move PRD 07 to `COMPLETED`.

PRD 07 may move to `COMPLETED` only when:

- all acceptance criteria are evidenced on the exact reviewed head;
- all required provider, credential, architecture, financial, and
  legal/privacy conditions are cleared or the affected scope is explicitly
  re-authorized without misrepresenting a stop as passed;
- contracts and documentation are current and consistent;
- migration and recovery evidence passes;
- CI, unit, integration, E2E, accessibility, security, privacy, architecture,
  scope, and production build checks pass;
- Agent 90 and QA/security independently pass the actual candidate;
- all relevant PRs are merged;
- the durable Gate A record is current; and
- there are zero open `BLOCKER` and zero open `HIGH` findings.

The author of this PRD does not approve its implementation or Gate A. Registry
activation and state changes remain the Orchestrator's responsibility. PRD 07
completion does not authorize PRD 08, 19, or 20 unless each is independently
dependency-ready and all of its own privacy, provider, safety, and release
conditions are satisfied.

## Known limitations

- This PRD defines onboarding mechanics and stop boundaries, not a selected
  identity provider, completed identity architecture, legal advice, legal
  notice, consent policy, minors policy, or proof of compliance.
- Synthetic provider and policy adapters prove deterministic mechanics only.
  They do not prove provider security, real identity assurance, availability,
  recovery, residency, or legal sufficiency.
- The permitted principal-both-roles model does not grant cross-role access and
  may require later product policy before a real user can activate both roles.
- Invitation-only onboarding is the bounded Pilot V1 mechanism defined here;
  public self-sign-up, social discovery, profile setup, and account merging are
  not included.
- Identity and onboarding records may be personal data even when opaque. Their
  production lifecycle remains subject to approved PRD 21 policy and legal
  determination.
- The coach surface is intentionally limited to onboarding invitations. It is
  not a substitute for PRD 18.
- Offline claim is unsupported. PRD 19 may later harden authorized PWA behavior
  without caching credentials or secrets.
- Passing Gate A establishes zero known serious findings under tested
  conditions; it does not establish perfect security, legal compliance, or the
  absence of future defects.

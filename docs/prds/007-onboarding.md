# PRD 07 — Onboarding

- Status: `IN_PROGRESS`
- Approval basis: Inherited from approved parent PRD under Autonomous Pilot V1 authorization
- Parent registry outcome: Student and coach onboarding within approved identity and consent scope
- Dependencies: PRD 02 — `COMPLETED`
- Release gate: Gate A
- External milestone gate: none
- Pre-flight: `PASS` — see [independent review](../execution/reviews/PRD_07_DESIGN_PREFLIGHT.md); executable contract freeze still requires an independently reviewed Technical Design
- Stop boundary: Provider- and policy-neutral work with synthetic identities and synthetic policy decisions may proceed; real-user activation remains subject to the explicit stop conditions in this PRD

## Context

PRD 02 established minimal opaque student and coach records and immutable
student–coach relationship history. It deliberately did not establish caller
identity, authorization, profiles, invitations, consent, or onboarding. Fitness
OS now needs the smallest trustworthy path from an authenticated principal to
one of those opaque domain records so a student or coach can enter the PWA
without treating a browser-supplied identifier, an email address, or a
student–coach link as proof of identity or permission.

PRD 21 is currently blocked by its recorded architecture stop; its reviewed
policy-neutral design remains informative integration context, not a new PRD 07
registry dependency and not authority for PRD 07 to invent legal policy. PRD 07 owns the
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
  student–coach link when an eligible student invitation is claimed;
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
- Derive a backend-only protected `PrincipalReference` from the approved issuer,
  stable opaque subject reference, and environment. It scopes first-time
  principal establishment before a `PrincipalId` exists and is never accepted
  from or returned to the browser.
- Define an immutable external-principal binding from an approved issuer and a
  stable provider-supplied opaque subject reference to one internal principal.
- Define explicit principal-to-student and principal-to-coach mappings. The
  persistence and contract model may represent both mappings without inferring
  one role from the other, but real-user acquisition of a second role and any
  claim that would link a principal's student record to that same principal's
  coach record are hard-disabled as described under `Dual-role boundary`.
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
- Resolve an existing internal principal binding from trusted identity context.
  If none exists, create the principal and external binding only as an atomic
  step of the first authorized mutating onboarding command, under the common
  operation protocol and after any required invitation verification. Reads and
  inspection never create identity state. Never accept principal, student,
  coach, or provider-subject IDs in a claim body.
- Persist a resumable, server-owned onboarding attempt after authentication
  and invitation verification.
- Key an attempt by a server-owned attempt ID and immutable principal,
  invitation, purpose, and proposed-role scope. Permit at most one nonterminal
  attempt for that exact scope and at most four nonterminal attempts per
  principal and proposed role across distinct invitations; deterministic
  overflow, selection, and terminal handling follow the attempt-identity and
  cardinality rules below.
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
  authenticated internal principal, server-owned attempt and operation
  references, proposed role, invitation purpose, approved policy/package
  reference when available, and bounded correlation metadata.
- Define a strict result: `interaction_pending` with a protected opaque
  interaction reference, `ready` with immutable approved requirement and
  evidence references, or `blocked` with a closed safe reason. It is not a
  generic boolean and contains no raw legal copy or participant response.
- Bound the handoff to an interaction owned by a separately authorized PRD 21
  or equivalent governance provider. That interaction owns approved content,
  response capture, and immutable evidence creation; onboarding may initiate,
  resume, poll, validate, and consume only its protected status/reference.
- Do not add an onboarding legal-copy, consent-response, or evidence-submission
  route. The PWA never submits a policy response to PRD 07, and PRD 07 stores no
  raw response or evidence payload.
- The separately authorized governance interaction may compose its own
  approved-content adapter for notice presentation. PRD 07 neither owns nor
  proxies that adapter; the onboarding domain stores only approved immutable
  references and does not author, translate, serve, or persist legal prose.
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
  after authentication, attempt selection/resume/abandonment and policy-status
  refresh, claim, coach-owned student-invitation issuance, and revocation. None
  accepts legal content, a participant response, or evidence payload.
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
- A PRD 07 legal-copy, consent/authorization-response, or evidence-submission
  API, and implementation of the separately governed interaction that owns
  those concerns.
- Real-user dual-role acquisition or self-coach linking before the exact
  attributable founder and legal/privacy decisions clear their independent
  stops. Policy-neutral storage representation is not activation.
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
5. When a separately authorized governance interaction is required, the PWA
   transfers control using its protected opaque interaction reference. That
   interaction, not an onboarding route, presents approved content and captures
   any required response. Returning to onboarding resumes the existing attempt
   and polls for an immutable evidence reference; it never forwards the raw
   response or legal content through PRD 07.
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
- Before that binding exists, the identity adapter derives one protected
  `PrincipalReference` from the verified issuer, stable subject, and environment.
  It is authority scope for first-time establishment only, not a caller-visible
  identifier, role, permission, or substitute for the resulting `PrincipalId`.
- Principal creation and external-binding insertion are atomic. Concurrent
  commands for the same protected reference converge on the one unique binding;
  a losing provisional principal is rolled back, and both authorized commands
  continue or reconcile against the same authoritative principal without
  rewriting the binding.
- One internal principal has at most one active student mapping and at most one
  active coach mapping. A student or coach record has at most one active
  principal mapping. Mappings across roles are never inferred.
- The data model remains capable of distinct student and coach mappings for one
  principal, but real-user acquisition of the second role is denied before
  claim mutation. A claim that would make the same principal both endpoints of
  the initial student–coach link is also denied. Representation capability is
  not product-policy authorization.
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
- Domain IDs, link IDs, timestamps, server operation IDs, operation namespaces,
  token material, and content digests are server-owned. The browser supplies
  none of them; its bounded retry token is correlation only.
- No completed domain record, mapping, link, transition, or operation-ledger row
  survives a failed claim transaction.
- Historical invitation, attempt, binding, mapping, and transition facts are
  immutable to ordinary application operations. Future authorized privacy
  lifecycle work may apply separately approved deletion or transformation
  rules; PRD 07 does not choose them.

### Dual-role boundary

- Schema, repositories, and synthetic fixtures may represent one principal
  with separate student and coach mappings so mechanics remain policy-neutral
  and do not corrupt imported or future authorized state.
- Real-user readiness and claim composition hard-disable: (a) any claim that
  would add a second role to a principal, and (b) any student claim whose
  invitation coach maps to that same principal, even if the second mapping
  already exists. Neither path may be enabled by configuration, adapter output,
  retry, operator action, or a merely successful synthetic test.
- Enabling dual-role acquisition is a material product-role decision and stops
  under `FOUNDER_DECISION_REQUIRED` until an attributable founder decision
  defines the allowed cases and user experience. If the path affects
  student–coach sharing, privacy expectations, authority, notices, or evidence,
  `LEGAL_PRIVACY_DECISION_REQUIRED` independently remains active until an
  attributable legal/privacy decision clears those exact consequences.
- The two stops are independent. Clearing identity architecture, credentials,
  or one of these decisions does not clear the other; silence and a generic
  approval of PRD 07 do not enable the path.
- Current-state and claim failures remain safe and disclose neither the other
  role mapping nor whether the invitation coach is the same principal.

### Attempt identity and cardinality

- `AttemptId` is a server-generated branded identifier and never authority. An
  attempt has an immutable scope of authenticated `PrincipalId`, verified
  `InvitationId`, invitation purpose, and proposed role, plus a server-owned
  creation ordinal and timestamps.
- The database permits at most one nonterminal attempt for the exact scope.
  Concurrent creation for that scope returns the same authoritative attempt;
  it does not create siblings. Across distinct invitations, a principal may
  hold at most four nonterminal attempts for one proposed role. The fixed Pilot
  V1 cap is server-owned, identical across replicas, and cannot be raised by a
  caller or environment override without a reviewed PRD/contract change.
  Separate-role attempts may coexist in the synthetic lane under their own cap,
  subject to the dual-role hard-disable at real-user readiness and claim.
- Attempt creation locks a per-principal/proposed-role cardinality guard before
  checking the exact-scope uniqueness and cap. It first terminalizes trusted-
  time-expired or inactivity-abandoned attempts under the same lock, then
  creates at most one attempt and increments the guarded active count. At the
  cap it returns `active_attempt_limit_reached` with zero attempt/domain
  mutation and no count, invitation, coach, or competing-attempt detail.
- A principal-scoped current-state read returns stable bounded pages of
  nonterminal attempts ordered by `(created_at, AttemptId)`, with an opaque
  continuation cursor and no total count, and never silently chooses “latest.”
  Each summary contains only `AttemptId`, proposed role, closed safe state, and
  trusted creation/expiry times—never invitation, coach, issuer, principal,
  evidence, or competing-attempt details. A locator may read a retained
  terminal/completed attempt in the same authenticated scope.
- Resume or claim supplies an opaque `AttemptId` only as a locator; the
  authenticated principal and stored scope authorize resume, while claim
  additionally re-verifies the protected invitation proof and current
  claimability. If more than one active attempt exists and no locator is
  supplied, the API returns `selection_required`; if exactly one exists it
  returns `attempt_selected`, and if none exists it returns `no_active_attempt`
  plus only the principal's already-authorized role-mapping state.
- Attempt absolute expiry and inactivity abandonment are server-configured,
  trusted-time transitions. A browser may request abandonment using the normal
  mutation protocol but cannot choose its reason or timestamp. Expiry or
  abandonment decrements the guarded active count exactly once and never
  revokes or extends the underlying invitation. Completion and every other
  terminal transition release the same slot exactly once in their transaction.
- `completed` is immutable and resumes to its stored completion. Other terminal
  attempts are never reopened. A successor attempt receives a new ID and
  ordinal only when the same invitation remains claimable for the same
  principal/scope; the terminal predecessor remains linked as history.
- When multiple invitations target the same role, the first valid completion
  wins the unique mapping. Under the same principal/role guard, other active
  attempts transition to a generic terminal mapping conflict and release their
  slots exactly once; subsequent reads return that stored safe outcome without
  revealing which invitation, coach, principal, or role state won. Claims by
  different principals and claims for different roles obey the same isolation
  and database uniqueness rules.

### Idempotency and concurrency

- Every mutation—first-time principal/external-binding establishment as part of
  its enclosing command, operator coach-bootstrap issuance, coach student-
  invitation issuance, revocation, attempt create/abandon/resume transition,
  governance interaction initiation/consumption, and invitation claim—uses one
  common operation protocol. No mutation relies on HTTP retry behavior alone.
- The invoking boundary must supply a strictly formatted, length-bounded,
  opaque `RetryToken` for every externally initiated mutation to correlate
  retries of one intended submission. It is neither authority nor the
  persisted operation identity, and cannot select a principal, owner,
  invitation, role, policy result, timestamp, or namespace. Authentication and
  command-specific ownership are checked on every request, including a replay.
  A server-scheduled expiry/reconciliation transition instead uses a
  deterministic server-owned trigger reference in the same operation protocol;
  it never fabricates a browser or operator token.
- On first authorized acceptance, the server allocates a branded
  `OperationId`, selects the closed command namespace and canonicalization
  version, and persists the authority-scope, command-namespace, and
  `RetryToken` tuple as the binding to that operation. The authority scope is
  the authenticated principal for product commands and the attributable
  restricted operator identity plus environment for bootstrap issuance. When
  no principal binding exists, the authority scope is the adapter-derived
  protected `PrincipalReference`; the same transaction atomically links the
  committed operation and resulting `PrincipalId` without changing replay
  identity. It also records an immutable authority alias to that principal, so
  a retry after the binding exists resolves the original scoped token before a
  new principal-scoped operation can be allocated. Token uniqueness and
  mismatch checks span both aliases; the binding transition cannot turn a
  replay into an intentional new command.
- The server computes a digest over the complete canonical semantic input and
  immutable resolved scope: authority scope, command kind, owned target or
  verified invitation identity, attempt/policy version where applicable, and
  all behavior-affecting bounded fields. It excludes plaintext secrets, raw
  policy responses, transport metadata, and server-generated output; a stable
  verifier/reference is used where secret proof affects semantics. For a first-
  binding operation, the canonical authority component remains the protected
  pre-binding reference on every replay even after its principal alias exists.
- The first response is `operation_committed` with the stored command result
  only after its transaction commits. While the server lease is valid it is
  `operation_pending`; after an expired lease or ambiguous effect requires
  inspection it is `operation_reconciling`. Neither state is reported as
  command success.
- A repeat of the same scoped token, namespace, canonicalization version, and
  digest returns `operation_pending` or `operation_reconciling`, or
  `operation_replayed` with the stored committed command result, and never
  repeats a side effect. The same scoped token with a different digest or
  command returns `operation_input_mismatch` with zero mutation. A token used
  by a different authority scope neither reveals nor replays the first result.
- An intentionally identical later operation uses a new `RetryToken`, receives
  a new server `OperationId`, and is evaluated normally against current
  authorization and invariants. It is not mistaken for a replay: issuance may
  create another invitation, while duplicate revoke/claim/step commands return
  their command-specific already-terminal or current-state outcome without a
  duplicate transition.
- Pending operations have a bounded server lease and explicit reconciliation
  state. After a lost response, retry or resume first resolves the operation
  ledger against command effects; it never guesses success or executes a
  second operation. For first-time identity establishment, reconciliation checks
  the protected principal reference, unique external binding, resulting
  principal, operation row, and enclosing command effects together; it rolls
  back or ignores any unlinked provisional principal and never rebinds an
  existing subject. Ledger retention is at least the maximum invitation,
  attempt, client retry, and recovery window and is a reviewed lifecycle value,
  not caller input.
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
- Within the separately authorized governance interaction, notice rendering is
  plain content from an approved versioned source. No arbitrary HTML, script,
  remote embed, or provider response is rendered by PRD 07.
- Policy evidence and notice content remain minimized. Routine onboarding logs
  contain neither raw content nor evidence payload.
- An evidence interaction is created only through the internal
  `OnboardingPolicyGateway` after a separately authorized governance
  implementation has approved the package and interaction. The request is
  bounded to principal, attempt, proposed role/purpose, immutable requirement
  package reference, and server operation/correlation references.
- The gateway returns a protected opaque interaction reference and closed
  status. The governance implementation exclusively owns content presentation,
  participant-response submission, evidence construction, and its evidence
  API. PRD 07 adds no proxy or public callback accepting those values.
- Onboarding resume may poll the gateway by protected interaction reference.
  Consumption accepts only a signed/integrity-checked immutable evidence
  reference bound to the same principal, attempt, role/purpose, requirement
  package/version, and validity window. A mismatch, expiry, replacement, or
  unknown reference leaves the attempt `policy_pending` or terminal by a
  closed rule and reveals no governance detail.
- At most one current interaction exists per attempt and requirement-package
  version. Refresh and concurrent polling converge on the same interaction;
  a changed package invalidates readiness and requires a new server operation,
  never an in-place rewrite. PRD 07 stores only the protected interaction
  locator, immutable evidence/package references, integrity/version metadata,
  closed status, and trusted timestamps—never legal copy, answers, selections,
  signatures, or a raw provider response.
- This port allows later composition without adding PRD 21 to the registry DAG.
  Until the PRD 21 or equivalent interaction is separately authorized and its
  applicable legal/privacy decisions are attributable, real-user interaction
  stays blocked under `LEGAL_PRIVACY_DECISION_REQUIRED`; the safe synthetic
  adapter exercises mechanics only.

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
  immutable purpose/proposed role, creation ordinal, predecessor when
  applicable, pinned policy/requirements and protected governance-interaction
  references, immutable evidence reference when ready, safe terminal reason,
  server expiry/inactivity bounds, and trusted timestamps.
- Attempt cardinality guard: principal ID, exact proposed role, active count
  bounded from zero through four, version/lock value, and trusted timestamp. It
  contains no invitation, coach, policy, or evidence detail.
- Completion: role mapping ID, created PRD 02 record ID, optional created link
  ID, invitation ID, attempt ID, server operation ID, and completion timestamp.
- Transition evidence: opaque event ID, aggregate ID, closed event kind,
  previous/next state, server operation ID, safe reason code, and trusted
  timestamp.
- Operation result: server operation ID, closed command namespace, authority-
  scope digest/reference—including the protected pre-binding principal
  reference when applicable—bounded caller retry-token binding,
  canonicalization version, canonical semantic-input digest, linked resulting
  principal ID and immutable authority alias when first established, pending
  lease/reconciliation state, typed result kind/result, retention bound, and
  trusted timestamps.

Plain claim secrets, raw identity assertions, legal copy, consent responses,
governance-provider response/evidence payloads, database errors, and arbitrary
metadata are prohibited fields.

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
  transition, server-operation, bounded retry-token, protected pre-binding
  principal-reference, governance-interaction, immutable-evidence, and
  completion identifiers;
- strict lifecycle and typed-result schemas;
- authenticated current-state, invitation-inspection, claim, coach issuance,
  revocation, attempt selection/resume/abandonment, policy-status refresh, and
  bounded pagination request/response schemas;
- a safe onboarding readiness schema or closed readiness classifications;
- `UNAUTHENTICATED`, `FORBIDDEN`, and `CONFLICT` variants in the shared API
  error-code contract if pre-flight confirms they are required; all existing
  providers and consumers must update in the same coordinated freeze; and
- compile-time tests proving PRD 02 and PRD 07 identifier brands are not
  cross-assignable.

Unknown fields, hidden identity claims, caller operation IDs/namespaces/digests
or timestamps, unbounded text/retry tokens, raw governance content/responses,
and token-bearing URL fields are rejected.

### Closed result taxonomy

The executable freeze uses closed discriminated unions. Command-specific
schemas may expose only their applicable subset, but they do not rename or
silently collapse these outcomes:

- operation protocol: `operation_pending`, `operation_reconciling`,
  `operation_committed`, `operation_replayed`, and
  `operation_input_mismatch`;
- attempt selection/cardinality: `attempt_selected`, `selection_required`,
  `no_active_attempt`, and `active_attempt_limit_reached`;
- governance handoff: `interaction_pending`, `ready`, and `blocked`;
- command state: `command_succeeded`, `completed`, `current_state`,
  `already_terminal`, `invalid_or_unavailable`, and `mapping_conflict`; and
- boundary failure: `unauthenticated`, `forbidden`,
  `dependency_unavailable`, and `internal_corrupt_state`.

An operation status wraps or references the stored command result; it does not
replace that result. Thus a replay of a committed `selection_required` or
`active_attempt_limit_reached` result remains distinguishable from a still-
pending or reconciling operation. HTTP status mapping and safe error-envelope
codes are frozen once for every provider and consumer; no route invents a
second spelling or infers success from an absent discriminator.

Existing shared platform validation, rate-limit, and internal HTTP-envelope
codes remain governed by PRD 01 and are not redefined as onboarding results.

### Domain ports

API/Domain owns narrow ports for:

- resolving trusted authenticated context to an existing principal or deriving
  a protected pre-binding principal reference;
- binding and reading external principal relationships;
- reading principal-to-student/coach mappings;
- issuing, inspecting, revoking, and claiming onboarding invitations;
- deterministically listing, selecting, reading, creating, abandoning, and
  resuming onboarding attempts;
- initiating, polling, validating, and consuming only the bounded governance
  evidence handoff through `OnboardingPolicyGateway`;
- creating the required PRD 02 student, coach, and link records through the
  existing domain repositories; and
- creating and reconciling server-owned idempotent operation results.

Every port returns only the applicable subset of the closed taxonomy above.
Attempt reads explicitly return `attempt_selected`, `selection_required`, or
`no_active_attempt`; creation may additionally return
`active_attempt_limit_reached`. Mutating ports expose operation pending,
reconciling, committed, replayed, and input-mismatch states without collapsing
them into generic success. Database constraint names, identity-provider errors,
token verification details, and raw policy/provider payloads are not domain or
HTTP contracts.

### HTTP surface

The final route names are fixed during executable contract freeze, but the
authorized responsibilities are:

- authenticated current onboarding state;
- authenticated invitation inspection using a bounded body-held claim secret;
- authenticated attempt selection/resume and policy-status refresh without any
  legal-copy, consent-response, or evidence-submission field;
- authenticated atomic invitation claim with a bounded retry token;
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

Every public mutation requires exactly one bounded opaque `RetryToken` as
defined above; it never accepts `OperationId`, operation namespace, digest,
authority scope, or canonicalization version from the browser. Attempt and
interaction references are locators checked against authenticated stored
scope, not bearer authority. No onboarding endpoint accepts governance answers,
choices, signatures, legal content, or raw evidence.

Identity-provider start/callback/session handling verifies identity context but
does not create a Fitness OS principal or external binding. That first product
identity mutation occurs only inside a retry-token-bearing onboarding command,
so provider callback replay, browser refresh, or a current-state read cannot
bypass the common operation protocol.

The non-public coach-bootstrap command uses a separate least-privileged
operational entry point, attributable operator identity, strict environment
binding, the same bounded retry-token/server-operation protocol, and generic
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
  terminal invitation result, at most one nonterminal attempt per immutable
  principal/invitation/purpose/role scope, positive/bounded timestamps, valid
  state transitions, one current governance interaction per attempt/package
  version, and scoped retry-token plus server-operation uniqueness at the
  database boundary.
- Store one cardinality guard per principal/proposed-role, constrained to an
  active count of zero through four. Attempt create and every transition out of
  nonterminal state lock that guard in a stable order, reconcile stale terminal
  candidates, update the count exactly once, and preserve the exact-scope unique
  constraint. A constraint trigger or equivalently reviewed database-enforced
  routine rejects a bypass write that would exceed the cap, underflow the
  guard, or diverge from the nonterminal rows.
- First-time principal, external binding, operation row, and enclosing command
  effects commit atomically. The unique protected issuer/subject binding is the
  concurrency arbiter; the operation authority alias makes pre-/post-binding
  retry lookup and token uniqueness continuous. Conflict handling reuses the
  winner and leaves no unbound principal row or second operation effect.
- Use deferred constraints or constraint triggers where a claim must atomically
  create cross-table mapping, completion, transition, and PRD 02 link evidence.
- Keep history tables append-only to the ordinary application role. No
  application hard-delete repository is introduced.
- Use stable lock order and explicit transaction isolation for claim/revoke and
  concurrent mapping races.
- Use parameterized queries and strict adapters. Persistence output is parsed
  through executable schemas before crossing the domain boundary.
- Index only exact binding, current mapping, invitation verifier/status,
  scoped retry-token binding, server operation, exact active-attempt scope,
  principal/role cardinality guard and nonterminal count, deterministic
  principal attempt selection, current governance interaction, and coach-owned
  invitation queries required by the authorized flow. No generic people search
  is introduced.
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

Real dual-role and self-coach activation additionally require the separately
attributable product decision under `FOUNDER_DECISION_REQUIRED` and the
applicable sharing, authority, notice, and evidence determinations under
`LEGAL_PRIVACY_DECISION_REQUIRED`. Until both are cleared for the exact path,
mechanical representation may be tested synthetically but readiness and claim
remain hard-disabled.

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
  independent founder or legal/privacy stop.

## Failure modes

| Failure or race                                                                                       | Required behavior                                                                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Missing or invalid authenticated context                                                              | Reject before invitation/domain lookup; safe unauthenticated response                                           |
| Unapproved issuer or invalid provider assertion                                                       | Reject and emit redacted integrity classification; no binding mutation                                          |
| Identity provider unavailable                                                                         | Preserve authoritative state; safe temporary-unavailable response; no local authentication fallback             |
| Concurrent first commands for one unbound protected principal reference                               | One principal/binding wins; provisional loser rows roll back and both operations resolve the same principal     |
| Lost response during first principal/binding establishment                                            | Reconcile operation, protected reference, binding, principal, and command effects; never create or rebind twice |
| Unknown, malformed, expired, revoked, or inaccessible invitation                                      | Generic unavailable/not-found result without state or role disclosure                                           |
| Claim secret brute force or rate breach                                                               | Throttle/deny generically; do not reveal partial matches or account existence                                   |
| Invitation replay by completing principal                                                             | Return the committed completed result with zero row changes                                                     |
| Invitation replay by another principal                                                                | Generic unavailable result; no mapping or domain detail                                                         |
| Same scoped retry token reused with different canonical input or command                              | `operation_input_mismatch`; zero mutation and no disclosure across authority scopes                             |
| New retry token with intentionally identical semantic input                                           | New server operation; evaluate current invariants rather than replaying the earlier operation                   |
| Lost first-binding/bootstrap/invitation issue, revoke, attempt-step, evidence-consume, or claim reply | Return `operation_pending`/`operation_reconciling`, or replay the committed result without duplicate effect     |
| Concurrent identical command before first response                                                    | One server operation/effect; all authorized matching retries converge on its stored typed result                |
| Concurrent creation of the same attempt scope                                                         | One nonterminal attempt; all authorized creators receive the same attempt                                       |
| Multiple active attempts for distinct invitations and no locator                                      | `selection_required` plus bounded safe summaries; never choose latest or disclose invitation/coach context      |
| No active attempt in the authenticated principal scope                                                | `no_active_attempt` plus only authorized role-mapping state; no account or prior-attempt disclosure             |
| Fifth active attempt for the same principal and proposed role                                         | `active_attempt_limit_reached`; zero attempt/domain mutation and no count, invitation, coach, or role detail    |
| Expiry/abandonment races with attempt creation                                                        | Lock the principal/role guard; release each terminal slot once, then deterministically admit or deny creation   |
| Attempt expires or is abandoned                                                                       | Immutable terminal transition; invitation unchanged; successor allowed only if still claimable in exact scope   |
| Competing invitations complete the same role                                                          | One mapping wins; other attempt is generically terminal with no winner/coach/role disclosure                    |
| Concurrent claim/claim                                                                                | One terminal result; identical authorized retry replays; competitor makes no mutation                           |
| Concurrent claim/revoke                                                                               | One terminal result; loser observes safe terminal state; no partial rows                                        |
| Principal already mapped for requested role                                                           | Typed mapping conflict; preserve existing mapping and invitation unless policy explicitly permits another path  |
| Domain record already mapped to another principal                                                     | Deny as conflict without disclosing the existing principal                                                      |
| Student invitation coach/link context invalid                                                         | Reject entire claim; create no student, mapping, event, or link                                                 |
| Policy/notice gateway missing, synthetic in production, blocked, stale, or unavailable                | Claim remains incomplete; readiness/route fails closed; no guessed content/evidence                             |
| Policy version changes during claim                                                                   | Re-evaluate and pin one approved version before commit; stale result cannot complete                            |
| Governance interaction pending, expired, replaced, mismatched, or unavailable                         | Keep policy pending or transition by closed rule; store no raw response and expose no provider detail           |
| Dual-role or self-coach real-user claim attempted                                                     | Deny before mutation; keep both applicable decision stops active and disclose no existing mapping               |
| Dual-role/self-coach product decision unresolved                                                      | `FOUNDER_DECISION_REQUIRED`; keep that real-user path hard-disabled                                             |
| Persistence unavailable                                                                               | Safe service-unavailable response; no provider/database/host detail                                             |
| Snapshot or stored-state contract mismatch                                                            | Fail closed as internal error; do not repair history from browser input                                         |
| Browser refresh or ambiguous response                                                                 | Read authoritative state and replay idempotent command; never duplicate records                                 |
| Provider subject changes during recovery                                                              | Do not rebind automatically; route to separately authorized verified recovery                                   |
| Migration failure                                                                                     | Stop deployment; preserve prior compatible schema and unrelated data; forward-fix only                          |
| Mandatory onboarding event cannot commit                                                              | Roll back the corresponding mutation; no best-effort success                                                    |
| Close/shutdown during in-flight claim                                                                 | Let the bounded transaction commit or roll back; reconcile operation ledger before retry                        |
| Legal/privacy parameter unresolved                                                                    | `LEGAL_PRIVACY_DECISION_REQUIRED`; keep real-user path disabled                                                 |
| Required production credential unavailable                                                            | `EXTERNAL_CREDENTIAL_REQUIRED`; keep synthetic path distinct and disabled in production                         |

## Recovery and rollback

- The idempotency ledger is the first recovery source after timeout or process
  loss. Recovery resolves the caller's scoped retry-token binding to the
  server-owned operation. A committed result is replayed; pending/ambiguous
  work returns `operation_pending` or `operation_reconciling` and is reconciled
  against command-specific identity binding, invitation, attempt, governance
  reference, mapping, PRD 02 record/link, and transition state before retry.
- First-time principal/external-binding establishment, bootstrap issuance,
  student-invitation issuance, revoke, attempt transitions, governance
  interaction initiation/consumption, and claim each have an explicit
  reconciler. The identity reconciler uses only the adapter-derived protected
  principal reference and persisted integrity metadata, converges on the unique
  binding/result, and proves no orphan principal or duplicate enclosing effect.
  Recovery never substitutes request correlation for operation identity and
  never creates a new retry token on the caller's behalf.
- A principal with multiple active attempts receives the bounded deterministic
  selection view. Resume requires the chosen locator and revalidates stored
  scope. Expired/abandoned attempts remain terminal and release one guarded
  slot exactly once; a separately created successor competes under the same
  principal/role lock and cap and is allowed only under the exact rules above.
- Returning from the separately authorized governance interaction resumes the
  existing attempt. PRD 07 polls by protected reference and consumes only a
  matching immutable evidence reference through an idempotent server operation;
  missing or ambiguous evidence remains pending and raw responses are neither
  requested nor reconstructed.
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
- database enforcement for exact-scope uniqueness, the four-active-attempt
  principal/role guard, deterministic bounded selection, scoped retry-token/
  server-operation uniqueness, atomic first-binding convergence, and pending
  operation reconciliation;
- a policy gateway that exposes only bounded interaction status and immutable
  evidence references, with no onboarding legal-copy/response/evidence route;
- no synthetic adapter accidentally selected outside explicitly synthetic
  environments.

Production onboarding readiness additionally requires:

- an approved identity/session Technical Design and production adapter;
- attributable provider configuration and all required least-privilege
  credentials;
- completed threat model and production-representative provider/session tests;
- an attributable approved policy/notice package and non-synthetic policy
  gateway backed by a separately authorized governance evidence interaction;
- all applicable legal/privacy decisions, including minors and jurisdiction;
- attributable founder and legal/privacy decisions enabling the exact dual-role
  or self-coach path, or hard-disable proof that those paths remain unreachable;
- approved identity/onboarding data lifecycle and recovery behavior; and
- no active applicable stop condition.

Until those requirements are met, `production_onboarding_ready` is false. Safe
diagnostics use closed classifications such as migration missing, identity
adapter missing/synthetic/integrity-invalid, policy missing/synthetic/blocked,
credential unavailable, recovery unverified, configuration mismatch, or
active stop condition. Public readiness remains only ready/not-ready and never
returns issuer, tenant, host, policy text, subject IDs, secrets, or raw errors.
Production readiness fails if dual-role/self-coach claim can be enabled without
both required attributable decisions, if a governance interaction can submit
through PRD 07, if first-binding reconciliation can orphan or rebind a
principal, if the active-attempt guard can exceed four or drift, or if
operation/attempt reconciliation is incomplete.

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
  caller operation IDs/namespaces/digests/timestamps, unbounded retry tokens,
  token-bearing URLs, hidden profile/contact fields, legal content, participant
  responses, and raw provider/policy/evidence payloads.
- Prove provider and Web consumers parse the same frozen success/error shapes.
- Exhaustively type-check lifecycle and the closed operation, attempt-
  selection/cardinality, governance, command-state, and boundary-failure result
  unions. Provider/consumer fixtures cover every discriminator, including
  `selection_required`, `no_active_attempt`, `active_attempt_limit_reached`,
  `operation_pending`, and `operation_reconciling`.

### Domain tests

- Principal binding uniqueness and role-specific mapping without role inference.
  First-time establishment tests cover same-token replay, different-token
  concurrency for one protected principal reference, canonical mismatch,
  pre-/post-binding authority-alias replay, provisional-principal rollback, lost
  response, pending reconciliation, and one authoritative binding/result with
  no provider secret or raw subject in state or output.
- Coach and student claims, including exact PRD 02 record/link effects.
- Forward-only attempt and invitation transitions.
- For first-time binding within its enclosing command, bootstrap issuance,
  student-invitation issuance, revoke, every attempt transition, governance
  interaction initiation/consumption, and claim: scoped retry-token replay,
  mismatched-digest conflict, identical input under a new token, lost response,
  pending reconciliation, and concurrent first request.
- Same-scope attempt creation convergence; deterministic reads and explicit
  selection with four simultaneous attempts for one principal/role; fifth-
  attempt denial; cap isolation across principals and roles; expiry,
  abandonment, and completion slot release; create/release races; completed
  resume; terminal non-reopen; and valid successor creation.
- Races across multiple invitations for the same role, both proposed roles,
  different principals, claim/claim, claim/revoke, duplicate mapping, and
  invalid coach context, with no cross-attempt or winner disclosure.
- Dual-role and self-coach mechanics can be represented in synthetic repository
  fixtures, but real-user readiness and claim tests prove both remain
  unreachable without separately attributable founder and legal/privacy
  decision fixtures. One decision alone never enables either path.
- Policy missing/blocked/stale/synthetic-in-production behavior.
- Governance handoff initiation/resume/poll/consume tests prove one interaction
  per attempt/package, immutable evidence binding, version replacement,
  mismatch/expiry denial, concurrent polling convergence, and absence of raw
  legal content, participant response, or evidence payload in PRD 07 state.
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
- Provider callback/session retries create no Fitness OS identity state. The
  first retry-token-bearing product mutation proves protected pre-binding scope,
  canonical replay/conflict, and safe convergence without accepting or exposing
  the protected principal reference.
- Public routes accept only a bounded retry token and protected attempt/
  interaction locators, never a server operation ID or governance response.
  Route-registration and payload tests prove PRD 07 exposes no legal-copy,
  consent-response, or evidence-submission endpoint.
- Generic enumeration-resistant invitation failures, request correlation,
  CORS, CSRF, body limits, rate limiting, and error redaction.
- Non-public bootstrap issuance is unreachable from API registration and Web
  bundles.
- API success and failure payloads parse through shared schemas.

### Persistence and migration tests

- Clean PostgreSQL apply and exact tables, columns, indexes, constraints,
  triggers, seeds-if-any, migration journal, and metadata.
- Database rejection of duplicate binding, mapping takeover, invalid state
  transition, multiple terminal claim, multiple nonterminal attempts for one
  exact scope, a fifth nonterminal attempt for one principal/role, cardinality-
  guard overflow/underflow or drift, multiple current interactions per attempt/
  package, eventless transition, scoped retry-token collision, and operation
  mismatch when service validation is bypassed.
- Real PostgreSQL races prove first principal/binding/operation/enclosing-effect
  convergence with no orphan principal and stable principal/role guard locking,
  exact slot release, and deterministic fifth-attempt denial.
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
  multiple-attempt selection, governance interaction return/poll, attempt
  expiry/abandonment, revocation, and generic terminal states.
- Selection UX distinguishes `selection_required`, `no_active_attempt`, pending/
  reconciling operation state, and the generic active-attempt-limit state
  without exposing the cap count or another invitation/coach.
- Dual-role/self-coach attempts render only the generic unavailable state and
  do not reveal the existing role or same-principal coach relationship.
- Browser-network assertions prove governance answers and evidence payloads go
  only to the separately authorized governance interaction and never traverse
  a PRD 07 request or persisted browser state.
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
- Real dual-role/self-coach hard-disable under missing founder or legal/privacy
  decisions, including configuration bypass, adapter spoof, retry, race, and
  readiness tests.
- Operation-ledger reconciliation after lost responses for every mutation and
  disclosure-isolated recovery with multiple attempts/invitations/roles.
- First-binding reconciliation after callback retry, concurrent commands,
  process loss, and ambiguous commit proves one principal/binding, no orphan,
  and no subject/provider detail in logs or public results.
- Attempt-cap bypass, guard drift, create-versus-expiry/abandonment races, and
  replayed overflow results fail closed and preserve exact active counts.
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
- Record dual-role/self-coach product and privacy decisions as independently
  unresolved under their exact stops; do not turn data-model capability into a
  default product policy.

### Phase 1 — synthetic mechanism

- Freeze strict shared contracts.
- Implement provider-neutral identity/policy ports, local synthetic adapters,
  domain state machines, and disposable PostgreSQL persistence.
- Prove atomic first principal/binding establishment, server-owned operation
  identity/reconciliation, the four-active-attempt principal/role cap, closed
  result taxonomy, selection, expiry, abandonment, terminal, and race mechanics
  with synthetic identities. Keep real dual-role/self-coach composition hard-
  disabled.
- Exercise a synthetic governance-interaction adapter that returns only opaque
  interaction and immutable evidence references; do not add legal content,
  participant-response, or evidence-submission behavior to onboarding.
- Build student and coach UI against synthetic states only, clearly unavailable
  in production composition.
- Pass component Gate A for each reviewed PR without claiming production
  onboarding or PRD completion.

### Phase 2 — production decision clearance

- Obtain attributable legal/privacy decisions for jurisdiction, eligibility and
  minors, purposes/authority, notice/evidence, lifecycle, sharing, provider
  processing, and recovery.
- Obtain the attributable founder decision for any proposed real dual-role or
  self-coach path and separate legal/privacy approval for its exact sharing,
  authority, notice, and evidence consequences; otherwise preserve the hard
  disable.
- Separately authorize the PRD 21 or equivalent governance evidence interaction
  before composing its production adapter. This authorization does not change
  the PRD 02-only registry dependency or transfer its evidence responsibilities
  into PRD 07.
- Select and review the identity/session architecture and provider behind the
  adapter. Clear any `FOUNDER_DECISION_REQUIRED`,
  `ARCHITECTURE_DECISION_REQUIRED`,
  `EXTERNAL_CREDENTIAL_REQUIRED`, `FINANCIAL_COMMITMENT_REQUIRED`, and
  `LEGAL_PRIVACY_DECISION_REQUIRED` conditions independently.
- Freeze any coordinated contract changes caused by approved decisions.

### Phase 3 — production-representative validation

- Compose the non-synthetic provider and approved policy gateway in a protected
  environment with synthetic or explicitly authorized controlled accounts,
  using only the bounded interaction/reference protocol to the separately
  authorized governance implementation.
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
   authenticated-principal, protected pre-binding principal reference, atomic
   first binding, browser/API session, invitation, policy handoff, governance
   interaction, attempt identity/cardinality, server-owned idempotency,
   migration, recovery, and threat-model boundaries before executable contract
   freeze.
2. Strict Zod schemas and inferred types are frozen for all authorized shared
   identifiers, states, operations, the complete closed result taxonomy, public
   request/response variants, and safe errors. Provider and consumer tests use
   those schemas and every discriminator; PRD 02 identifiers remain nominally
   distinct.
3. No request can construct authenticated principal context from caller-supplied
   principal, student, coach, link, issuer, or provider-subject data. Missing or
   invalid trusted context denies before protected lookup.
4. External bindings and principal-to-domain mappings are unique, role-specific,
   history-preserving, and concurrency-safe. Concurrent first commands for one
   protected principal reference commit one principal/binding and authoritative
   operation outcome with no orphan or rebind. Mechanics can represent two
   independent roles without inference, but real dual-role acquisition and self-
   coach linking are unreachable unless exact attributable founder and
   applicable legal/privacy decisions separately clear them; readiness and races
   prove fail-closed behavior when either is absent.
5. Coach-bootstrap and student invitations are opaque, high entropy,
   single-use, expiring, revocable, verifier-only at rest, enumeration-
   resistant, and absent from URL paths/queries, logs, telemetry, snapshots,
   browser persistence, and repeat reads.
6. A coach claim atomically creates one PRD 02 coach record and mapping. A
   student claim atomically creates one student record, mapping, and initial
   link to the invitation coach. Injected failures leave zero partial rows.
7. Every mutation uses a bounded caller retry token only as correlation and a
   server-owned namespaced operation ID as persisted identity. Authority scope,
   canonicalization version/digest, same-token replay/conflict, new-token
   intentional repetition, pending reconciliation, lost response, and
   concurrency tests pass for first-time principal/external-binding
   establishment inside its enclosing command, bootstrap issuance, student-
   invitation issuance, revoke, attempt steps, governance interaction
   initiation/consumption, and claim with one authoritative outcome and no
   duplicate effect.
8. Attempt IDs/scopes, one-active-attempt-per-exact-scope cardinality, allowed
   simultaneous attempts for distinct invitations up to the fixed four-per-
   principal/role cap, guarded overflow, bounded deterministic selection,
   explicit resume, expiry, abandonment, completion, exact slot release,
   terminal non-reopen, and successor rules are database-enforced and tested.
   Multiple invitation/principal/role races recover without duplicate records,
   count drift, or cross-attempt, account, coach, role, or relationship
   disclosure. Subject-changing recovery cannot bypass a separately approved
   verified rebinding workflow.
9. Policy/notice readiness is a deny-by-default typed handoff to a separately
   authorized PRD 21 or equivalent governance evidence interaction. PRD 07 may
   initiate/resume/poll and consume only a correctly bound immutable evidence
   reference; it exposes no legal-copy, response, consent, or evidence-
   submission route and stores no raw response/evidence payload. Missing,
   stale, mismatched, expired, blocked, unauthorized, or synthetic-in-
   production composition prevents completion without inventing lawful basis,
   minors, jurisdiction, withdrawal, retention, or content policy.
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
    governance/policy composition, incomplete first-binding or operation
    reconciliation, orphan-principal evidence, active-attempt guard drift/
    overflow, incomplete closed-result coverage, dual-role/self-coach bypass,
    migration mismatch, credential absence, recovery gaps, or active stops and
    discloses only safe classifications internally and ready/not-ready publicly.
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
    and PRD completion do not pass. Dual-role/self-coach activation also remains
    blocked under `FOUNDER_DECISION_REQUIRED` until the exact material product-
    role decision is attributable; clearing either stop alone is insufficient.
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
  frozen executable schemas in provider and consumer tests, including every
  closed result discriminator.
- 100% of tested successful student and coach claims have exactly one internal
  principal, one role mapping, one PRD 02 domain record, and—only for
  students—one initial link.
- 0 duplicate domain records, mappings, links, terminal invitation transitions,
  principals/external bindings for one protected reference, orphan principals,
  attempts for one exact active scope, principal/role active counts above four,
  cardinality-guard drift, governance interactions for one current package, or
  operation results/effects across tested retries, intentional repetitions,
  lost responses, reconciliation, and concurrency races.
- 0 known paths accept a browser-supplied domain or provider identifier as
  authenticated authority.
- 0 plaintext invitation secrets, provider credentials/tokens, profile/contact
  fields, legal copy, or real-user records in persistence, logs, fixtures,
  snapshots, build artifacts, or review evidence.
- 100% of required production identity, policy, legal/privacy, migration, and
  recovery readiness checks fail closed when missing or synthetic.
- 100% of tested real-user dual-role and self-coach paths fail closed until both
  their attributable founder and applicable legal/privacy decisions are present;
  synthetic representability alone enables 0 production paths.
- 0 PRD 07 routes or stored records contain legal copy, governance answers,
  signatures, or raw evidence payloads; 100% of accepted readiness references
  are integrity-checked and bound to the exact principal/attempt/role/package.
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
any other PRD to the DAG. PRD 21's reviewed but currently blocked design is
informative context for a future policy/notice handoff and deny-by-default production composition;
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
  founder/legal/privacy conditions are cleared or the affected scope is
  explicitly re-authorized without misrepresenting a stop as passed;
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
- The principal-both-roles representation grants no cross-role access. Real
  second-role acquisition and self-coach linking are hard-disabled pending an
  attributable founder product decision and applicable legal/privacy decision;
  this PRD intentionally does not predict their outcome.
- PRD 07 does not implement the PRD 21/governance evidence interaction. Its
  synthetic port proves only start/resume/poll/consume mechanics; production
  evidence sufficiency and raw response handling remain with the separately
  authorized governance capability.
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

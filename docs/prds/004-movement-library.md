# PRD 04 — Movement Library

- Status: `APPROVED`
- Approval basis: Inherited from approved parent PRD under Autonomous Pilot V1 authorization
- Parent registry outcome: Reusable, understandable movement guidance with explicit contracts
- Dependencies: PRD 01 — `COMPLETED`
- Release gate: Gate A

## Context

PRD 01 established the shared HTTP platform, safe errors, request correlation,
explicit CORS, and a runtime-validating web client. Fitness OS now needs a small
movement-guidance capability that proves a product read path without waiting for
identity, training, exercise taxonomy, persistence, media providers, or body
intelligence.

The roadmap makes PRD 04 a direct child of PRD 01 and a sibling of PRD 03.
Movement guidance therefore must stand on its own. A later PRD may reference a
movement by its stable identifier and version, but this PRD neither consumes nor
defines exercise-knowledge contracts.

## Problem

Students and coaches do not yet have a consistent place to read how a movement
is set up and performed. Future clients also lack a stable, versioned identifier
for linking to the same guidance. If guidance is embedded independently in UI
components or future training features, wording, safety cues, and identifiers
will drift.

## User

- A student reading concise movement guidance primarily on a smartphone.
- A coach consulting the same guidance on desktop or tablet.
- A future Fitness OS client consuming the same read-only Fastify API.
- A Movement content reviewer governing what may be published.

The PRD introduces no account context. The initial catalog is public and
read-only; that narrow choice is not an authorization precedent for future
private student or coach data.

## Outcome

Fitness OS offers a small, curated movement library whose published entries can
be listed and read through explicit runtime contracts. Each entry has a stable
identifier and visible content version, uses conservative plain-language
guidance, and is rendered through an accessible mobile-first web path without
bypassing Fastify.

## Scope

- Freeze shared executable schemas for movement identifiers, versions,
  summaries, details, route parameters, and list/detail responses.
- Add a version-controlled, read-only catalog containing at least two published
  entries that have passed the content-review rubric in this PRD.
- Add deterministic catalog list and lookup behavior in the framework-free
  domain package.
- Expose `GET /movements` and `GET /movements/:movementId` through Fastify.
- Extend the existing typed web API client to validate movement successes and
  failures through shared schemas.
- Add accessible, mobile-first list and detail pages that fetch through the
  Fastify API at request time.
- Document authoring, review, version increment, withdrawal, rollback, and
  failure behavior.

## Non-scope

- Authentication, authorization, accounts, students, coaches, onboarding,
  permissions, favorites, history, progress, completion, or analytics.
- Personalized advice, suitability decisions, adaptive guidance, training
  plans, prescriptions, sets, repetitions, load, tempo, rest, or scheduling.
- Exercise taxonomy, exercise records, muscle or equipment classification,
  evidence ranking, or any dependency on PRD 03.
- Diagnosis, rehabilitation, injury assessment, contraindication screening,
  biomechanical scoring, or claims that a movement is safe or appropriate for a
  particular person.
- Body, form, pose, camera, computer-vision, Digital Twin, or Form Intelligence
  behavior.
- Images, animation, video, audio, object storage, CDN selection, media
  licensing, or external media-provider commitments.
- Search, filters, categories, recommendations, localization, CMS authoring, or
  user-submitted content.
- PostgreSQL connections, product tables, migrations, queues, caches, or an
  offline-capable service worker.

## UX

The PWA adds two public read paths:

- `/movements` presents the published catalog as a semantic linked list in the
  catalog's deterministic order.
- `/movements/[movementId]` presents the movement name, short description,
  setup, ordered steps, concise cues, common mistakes, and safety notes.

The detail page identifies the content version without suggesting that the
version is a scientific evidence grade. Content is text-only and uses normal
React text rendering; it does not require media to be understandable.

The read path must work at 320 CSS pixels without horizontal scrolling, remain
usable at 200% text zoom, use a logical heading hierarchy, expose visible focus,
and keep every navigation link keyboard reachable. Ordered instructions use an
ordered list. Empty, unavailable, malformed-response, and not-found states use
plain, non-technical messages and never expose raw provider or exception text.

Understandability cannot be established honestly by schema tests alone. Before
publication, every entry must pass an independent Movement content review. A
reviewer who did not author the entry must confirm that the starting position is
identifiable, steps are in executable order, unfamiliar terms are removed or
defined, the safety prompt is visible, and the text does not decide suitability
or substitute for a coach or clinician. Failure or unavailable human review
activates `HUMAN_PERCEPTION_REQUIRED` at the completion gate; it is not replaced
by an agent's opinion.

## Business rules

- A movement entry is instructional content for one physical action. It is not
  an exercise taxonomy record and does not prescribe when, why, how often, or
  with what load a person should perform it.
- Only reviewed, explicitly published entries are returned. Draft content stays
  outside the runtime catalog.
- `movementId` is a deterministic, lowercase, URL-safe slug. Once published, an
  identifier is never reassigned to different guidance.
- `contentVersion` is a positive integer beginning at `1`. Any user-visible
  change to the name, description, setup, steps, cues, mistakes, or safety notes
  increments it.
- The list order is the ascending byte order of `movementId`; source-file order,
  locale, and runtime insertion order do not affect the response.
- Withdrawing unsafe or obsolete guidance removes it from current list/detail
  results. Its identifier remains reserved and may not be reused.
- Prior published text remains recoverable from Git history. This PRD serves
  only the current published version and creates no historical-content API.
- A later consumer that needs historical fidelity must retain the
  `(movementId, contentVersion)` it used; PRD 04 does not create student history
  or silently promise retrieval of old versions.
- Guidance uses plain, bounded text. It does not contain HTML, executable
  Markdown, embedded scripts, external URLs, fabricated citations, medical
  claims, or scientific certainty.
- Every detail includes conservative safety wording that tells the reader to
  stop if they experience pain, dizziness, or loss of control and to seek
  qualified help as appropriate. This containment is not a disclaimer for
  otherwise unsafe instructions.
- Runtime content generation, personalization, and generative-AI responses are
  prohibited. Any AI-assisted draft is untrusted authoring input and receives
  the same independent human content review as other drafts.

## Data

Movement guidance is public, non-personal product content. The capability does
not collect fitness activity, health data, body data, identifiers, preferences,
ratings, or telemetry.

The current published catalog and reserved withdrawn identifiers live in
version-controlled source under `packages/domain`. Catalog construction is
deterministic and has no network, clock, random, database, or provider input.
Git and pull-request history hold authorship, review, and prior revisions; those
workflow records are not exposed in the public API.

No persistence layer or migration is authorized. `packages/database` remains
unchanged. Moving the catalog to persistent storage requires a later approved
contract and migration plan rather than an implicit PRD 04 follow-up.

## Contracts

Wave 1 adds framework-free Zod schemas and inferred types in
`packages/schemas` for:

- `movementIdSchema` and `movementContentVersionSchema`;
- `movementSummarySchema` and `movementDetailSchema`;
- `movementListResponseSchema`;
- `movementDetailParamsSchema` and `movementDetailResponseSchema`.

The summary carries stable identity, current content version, display name, and
a short plain-language description. The detail adds bounded setup items,
ordered steps, cues, common mistakes, and safety notes. Exact field constraints
live only in the executable Zod definitions after contract freeze; the contract
registry references those symbols and does not independently redefine them.

`GET /movements` returns the list response. `GET
/movements/:movementId` returns the detail response. These endpoints accept no
request body, search, filter, pagination, or personalization parameters.
Malformed identifiers use the frozen `BAD_REQUEST` platform error; unknown or
withdrawn identifiers use `NOT_FOUND`; unexpected failures use
`INTERNAL_ERROR`. Every response retains the PRD 01 server-generated request ID
behavior. No new public error code is introduced.

Provider, domain, API, web-client, and rendering tests consume the executable
schemas. PRD 03 contracts, identifiers, taxonomy, and data are neither imported
nor re-created here.

## Content governance and safety

Publishing or revising an entry requires:

1. a focused source change identifying the stable ID and intended version;
2. automated schema, duplicate-ID, reserved-ID, and deterministic-order checks;
3. an independent Movement content reviewer applying the UX rubric;
4. explicit confirmation that the text contains no diagnosis, rehabilitation,
   suitability decision, personalized recommendation, training prescription,
   invented evidence, or claim of universal safety; and
5. normal code review, QA/security, and Gate A evidence.

An entry that fails any item remains unpublished. If plausible execution could
cause material harm and conservative wording does not resolve the uncertainty,
the entry is withheld and `SAFETY_CRITICAL_UNCERTAINTY` applies. The team may
remove or simplify unsafe content; it may not bury uncertainty in a disclaimer
or fabricate professional authority.

## Security/privacy

- The public API returns only reviewed static content and accepts only one
  bounded route identifier; it has no write surface.
- The server validates route parameters and all public responses through frozen
  schemas and preserves safe platform errors and request correlation.
- The web client treats malformed success or failure payloads as content-safe
  protocol errors and never renders arbitrary response bodies.
- Movement strings render as escaped text. `dangerouslySetInnerHTML`, executable
  Markdown, user-controlled URLs, and remote embeds are prohibited.
- The server-side API base URL is trusted operator configuration, not a request
  parameter, and is not exposed as a credential.
- Existing CORS allowlisting, no-Origin probe behavior, header redaction, and
  non-reflected request IDs remain unchanged.
- Public access is accepted only for this non-personal catalog. The PRD grants no
  access policy for later personal or health-related data.

## Failure modes

- An invalid route identifier returns 400 with the shared safe error envelope.
- An unknown or withdrawn identifier returns 404 without revealing draft,
  reserved, or historical content.
- Duplicate IDs, reused reserved IDs, invalid versions, or malformed published
  entries fail catalog construction and tests rather than serving partial or
  ambiguous guidance.
- An empty published catalog returns a valid empty list and the web renders an
  explicit empty state. PRD completion still requires the minimum reviewed
  entries in Scope.
- API exceptions are logged with request correlation and return the generic
  platform error; private stack or configuration detail is not serialized.
- A malformed API success or failure is rejected by the web client and renders a
  safe unavailable state.
- When the API is unreachable, the web path renders a retryable unavailable
  state. It does not fall back to duplicated, stale, or client-bundled guidance.
- A missing or invalid server-side API base URL fails closed with a safe
  operational error and never becomes user-controlled fetch input.
- Withdrawing content removes it from current reads. Recovery redeploys a known
  reviewed commit or publishes a corrected higher version; an earlier unsafe
  version must not be restored merely because it is easy to revert.
- Unresolved clarity invokes `HUMAN_PERCEPTION_REQUIRED`; unresolved potentially
  harmful instruction invokes `SAFETY_CRITICAL_UNCERTAINTY` before publication.

## Acceptance criteria

1. The movement schemas are frozen in `packages/schemas`, referenced in the
   human contract registry, and tested for valid, malformed, extra-field,
   identifier, version, and bounded-content cases.
2. The version-controlled catalog contains at least two published entries, has
   unique stable IDs and valid versions, reserves withdrawn IDs, sorts
   deterministically, and has recorded independent content-review evidence.
3. `GET /movements` returns HTTP 200 and the schema-valid deterministic summary
   list, including a valid empty-list response.
4. `GET /movements/:movementId` returns a schema-valid published detail; invalid
   IDs return 400, and unknown or withdrawn IDs return 404. Error bodies correlate
   with the server-generated `x-request-id` and expose no internal detail.
5. The web API client validates list/detail successes and shared failures with an
   injected-fetch test surface; malformed or non-JSON responses fail closed
   without echoing raw content.
6. `/movements` and `/movements/[movementId]` render through Fastify-backed data,
   satisfy the stated semantic, keyboard, visible-focus, 320-pixel, and 200%-zoom
   checks, and provide safe empty, unavailable, malformed, and not-found states.
7. Every published entry passes the independent clarity and safety wording
   rubric. No published field contains HTML, remote media, diagnosis,
   rehabilitation, suitability decisions, personalized advice, training
   prescription, invented citation, or claim of universal safety.
8. The implementation introduces no PRD 03 import or runtime dependency, no
   authentication or private-data behavior, no provider integration, and no
   database schema or migration.
9. Red → Green evidence covers contracts, catalog invariants, API routes,
   client protocol failures, rendering states, and the route-to-Fastify boundary;
   all existing tests remain green.
10. Lint, format, typecheck, unit/integration tests, production build,
    repository check, and `git diff --check` pass under pinned tools.
11. Independent Agent 90 and QA/security review the exact integrated head and
    report zero open `BLOCKER` or `HIGH` findings before Gate A passes.

## Metrics

- 100% of published movement entries validate against the frozen executable
  detail schema and have unique, non-reserved IDs and positive versions.
- 100% of published entries have recorded independent content-review evidence
  with every rubric item passing.
- 100% of movement provider and consumer response variants have executable
  schema tests.
- 100% of movement pages have automated semantic-state coverage and documented
  keyboard, 320-pixel, and 200%-zoom verification.
- 0 known movement responses omit server request correlation or expose raw
  exception/provider content.
- 0 PRD 03, database, authentication, body/form intelligence, media-provider, or
  personalized-training runtime dependencies are introduced.
- 0 known `BLOCKER` and 0 known `HIGH` findings at merge.

## Technical constraints

- Node.js 24.18.0, pnpm 10.24.0, TypeScript strict mode, Fastify, Next.js, React,
  Zod, Vitest, and the dist-first workspace lifecycle remain fixed.
- The design remains a modular monolith. No service, CMS, generic repository,
  provider adapter, cache layer, or dependency is added without a demonstrated
  PRD 04 need.
- The domain catalog remains framework- and persistence-independent. Web code
  consumes Fastify contracts and must not import `@fitness-os/domain` or
  `@fitness-os/database`.
- Runtime package exports resolve from built `dist` artifacts, and verification
  starts without relying on stale build output.
- Published guidance is deterministic, reviewed text. No runtime generative or
  external content source is permitted.

## Dependencies

- PRD 01 — Platform Foundation: `COMPLETED`.
- Product Principles and accepted ADRs 001–006.
- Frozen PRD 01 public error, request-correlation, CORS, and web-client behavior.

PRD 02 and PRD 03 are not dependencies. This PRD introduces no external
credential, financial commitment, persistence prerequisite, legal/privacy
decision, or media-provider selection. Human clarity review and conservative
safety review are explicit completion evidence; they become stop conditions
only if unavailable, failed, or unable to resolve a potentially harmful entry.

## Release gate

Gate A applies. PRD 04 has no Gate B or Gate C milestone and no migration.
Completion requires all acceptance criteria, exact-head green CI, consistent
frozen contracts, recorded independent Movement content review, architecture,
QA, security, and scope passes, updated operational/contract documentation,
merged relevant PRs, explicit migration `NOT_APPLICABLE` rationale, documented
limitations and deferrals, and zero open `BLOCKER` or `HIGH` findings.

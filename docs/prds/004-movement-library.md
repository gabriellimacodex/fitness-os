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
- A qualified Movement/safety reviewer governing instruction safety and scope.
- An intended student or coach reader judging whether the text is understandable
  without unstated movement knowledge.

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
- Add an append-only identity/version manifest and durable review records that
  bind every published version to its exact content digest and source commit.
- Add deterministic catalog list and lookup behavior in the framework-free
  domain package.
- Expose `GET /movements` and `GET /movements/:movementId` through Fastify.
- Extend the existing typed web API client to validate movement successes and
  failures through shared schemas.
- Add accessible, mobile-first list and detail pages that fetch through the
  Fastify API at request time with explicit no-stale and bounded-abort behavior.
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

Understandability and instruction safety cannot be established honestly by
schema tests alone. Before publication, every exact content version must pass:

1. an independent Movement/safety review by a person with a current recognized
   exercise-professional, movement-coaching, physiotherapy, or equivalent
   qualification whose documented scope covers the reviewed movement; and
2. an independent intended-reader clarity review by a student or coach who did
   not author the entry and can judge whether the text is understandable without
   unstated movement knowledge.

One person may fill both roles only when the privacy-minimized attestation
affirms both the relevant qualification category/scope and an intended-reader
perspective. The reviewer self-attests that they are not the content author.
Every rubric item must be recorded as `PASS`; a partial pass is not publication
approval. A failed or unavailable required review activates
`HUMAN_PERCEPTION_REQUIRED` at the completion gate and cannot be replaced by an
agent's opinion.

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
- Every publish, revise, withdraw, or explicitly reviewed republish action
  appends an identity/version-manifest record; existing records are never edited
  or removed. Withdrawn identifiers remain reserved in that history.
- Prior published text and its exact-version review record remain recoverable
  from Git history. This PRD serves only the current published version and
  creates no historical-content API.
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

The current published catalog and an append-only identity/version manifest live
in version-controlled source under `packages/domain`. Each manifest record
contains a per-movement event sequence, movement ID, content version, SHA-256
digest of the canonical validated detail, lifecycle action, and the expected
durable review-record path for publish/revise/republish actions. A withdrawal
retains the last content version and digest and needs no new content review. CI
compares the manifest with the merge base and Git history: existing records
cannot change, move, or disappear; an ID cannot be reassigned; user-visible
content changes require the next integer version and a new record; and
withdrawal appends a record rather than deleting identity history. Catalog
construction is deterministic and has no network, clock, random, database, or
provider input.

The durable review record contains two non-personal role attestations. It records
only `movement_safety` or `intended_reader`, a broad qualification category,
scope-fit result, reader perspective (`student` or `coach`), independence
self-attestation, every rubric result, and a fresh random per-review reference
that is not reused or mapped to a person. It binds the decision to
`(movementId, contentVersion)`, the canonical content digest, and exact
catalog-source commit SHA. Names, handles, signatures, contact details,
employers, credential/license titles or numbers, issuers, and reviewer-specific
free text are prohibited. Fitness OS does not collect, retain, or link the
underlying identity or credential evidence. The content and manifest are
committed first so that SHA exists; reviewers assess that immutable commit and
digest; then the privacy-minimized record is committed under
`docs/execution/content-reviews/movements/<movementId>-v<contentVersion>.md`.
Gate A verifies the reviewed source commit is an ancestor of the exact head and
that the head still produces the recorded digest. These governance records are
not exposed in the public API. If verified identities, credential evidence, or
linkable reviewer records are later required, collection stops under
`LEGAL_PRIVACY_DECISION_REQUIRED` until storage, access, retention, and deletion
policy is explicitly decided.

No persistence layer or migration is authorized. `packages/database` remains
unchanged. Moving the catalog to persistent storage requires a later approved
contract and migration plan rather than an implicit PRD 04 follow-up.

## Contracts

Wave 1 adds framework-free Zod schemas and inferred types in
`packages/schemas` with these freeze requirements:

- `movementIdSchema`: 3–64 lowercase ASCII characters matching
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- `movementContentVersionSchema`: an integer from 1 through 2,147,483,647;
- normalized, trimmed plain text: name 1–80 characters, summary 1–240
  characters, and each instructional string 1–300 characters;
- `movementSummarySchema` and `movementDetailSchema`;
- detail section bounds: setup 1–8 items, ordered steps 1–12, cues 1–8,
  common mistakes 1–8, and safety notes 1–6;
- `movementListResponseSchema`: a strict object containing `items`, an array of
  0–100 summaries; catalog construction fails above 100 until a later PRD
  authorizes pagination;
- `movementEmptyQuerySchema`: exactly an empty strict object;
- `movementDetailParamsSchema`: exactly one `movementId`; and
- `movementDetailResponseSchema`: one strict published detail.

The summary carries stable identity, current content version, display name, and
a short plain-language description. The detail adds the bounded setup items,
ordered steps, cues, common mistakes, and safety notes above. All objects are
strict and reject unknown fields. Executable Zod remains the runtime Source of
Truth; these explicit maxima are freeze requirements and may not be silently
weakened during implementation.

The HTTP/schema pairings are fixed: `GET /movements` parses
`movementEmptyQuerySchema` and returns HTTP 200 with
`movementListResponseSchema`; `GET /movements/:movementId` parses both
`movementEmptyQuerySchema` and `movementDetailParamsSchema`, then returns HTTP
200 with `movementDetailResponseSchema`. Any query key or malformed identifier
returns the frozen HTTP 400 / `BAD_REQUEST` envelope; unknown or withdrawn IDs
return HTTP 404 / `NOT_FOUND`; unexpected failures return HTTP 500 /
`INTERNAL_ERROR`. The endpoints accept no body. Every response retains the PRD
01 server-generated request ID and sets `Cache-Control: no-store`. No new public
error code is introduced.

Provider, domain, API, web-client, and rendering tests consume the executable
schemas. PRD 03 contracts, identifiers, taxonomy, and data are neither imported
nor re-created here.

## Content governance and safety

Publishing or revising an entry requires:

1. a focused source change appending the ID/version/lifecycle manifest record;
2. automated schema, bounds, manifest-history, content-digest, duplicate-ID,
   reserved-ID, version-increment, and deterministic-order checks;
3. an independent, qualified Movement/safety reviewer applying every safety and
   scope rubric item to the exact version and digest;
4. an independent intended-reader applying every clarity rubric item to that
   same version and digest, with dual-role qualification recorded if combined;
5. explicit confirmation that the text contains no diagnosis, rehabilitation,
   suitability decision, personalized recommendation, training prescription,
   invented evidence, or claim of universal safety; and
6. normal code review, QA/security, and Gate A evidence.

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
- API successes and errors set `Cache-Control: no-store`; Next.js forces dynamic
  rendering, uses `fetch` with `cache: 'no-store'`, and sets `revalidate = 0`.
  No React memoization, service worker, route cache, or client persistence may
  retain movement guidance.
- Each web-client movement request aborts after 3,000 ms. Timeout and abort
  failures render the same safe retryable unavailable state and contain no raw
  origin or response data.
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
- A timed-out or aborted API read renders the same unavailable state and never
  substitutes the last successful response.
- A missing or invalid server-side API base URL fails closed with a safe
  operational error and never becomes user-controlled fetch input.
- Withdrawing content removes it from current reads. Recovery redeploys a known
  reviewed commit or publishes a corrected higher version; an earlier unsafe
  version must not be restored merely because it is easy to revert.
- Unresolved clarity invokes `HUMAN_PERCEPTION_REQUIRED`; unresolved potentially
  harmful instruction invokes `SAFETY_CRITICAL_UNCERTAINTY` before publication.

## Acceptance criteria

1. The strict movement schemas are frozen with the exact ID, version, string,
   section-count, 100-item list, and empty-query bounds specified above; the
   contract registry and tests cover every HTTP/schema pairing, valid boundary,
   malformed value, extra field, and one-over-limit case.
2. The version-controlled catalog contains at least two published entries, has
   unique stable IDs and valid versions, reserves withdrawn IDs, sorts
   deterministically, and has an append-only manifest plus durable exact-version
   review records. CI/history tests reject record mutation/removal, ID reuse,
   skipped/non-incremented versions, digest drift, or missing review evidence.
3. `GET /movements` returns HTTP 200 and the schema-valid deterministic summary
   list, including a valid empty-list response.
4. `GET /movements/:movementId` returns a schema-valid published detail; invalid
   IDs return 400, and unknown or withdrawn IDs return 404. Error bodies correlate
   with the server-generated `x-request-id` and expose no internal detail.
5. The web API client validates list/detail successes and shared failures with an
   injected-fetch test surface; malformed or non-JSON responses fail closed
   without echoing raw content. It sends `cache: 'no-store'`, aborts at 3,000 ms,
   and never returns a previously successful response after timeout or 404.
6. `/movements` and `/movements/[movementId]` render through Fastify-backed data,
   satisfy the stated semantic, keyboard, visible-focus, 320-pixel, and 200%-zoom
   checks, and provide safe empty, unavailable, malformed, and not-found states.
7. Every exact published version has a durable record showing every rubric item
   passed by a qualified independent Movement/safety reviewer and an independent
   intended reader through the non-personal attestation fields above. A combined
   reviewer supplies both role attestations. If either review is failed or
   unavailable, publication and Gate A stop with `HUMAN_PERCEPTION_REQUIRED`.
   No published field contains HTML, remote media, diagnosis, rehabilitation,
   suitability decisions, personalized advice, training prescription, invented
   citation, or claim of universal safety.
8. The implementation introduces no PRD 03 import or runtime dependency, no
   authentication or private-data behavior, no provider integration, and no
   database schema or migration.
9. Red → Green evidence covers contracts, catalog invariants, API routes,
   append-only history, API/Next no-store behavior, timeout/abort, withdrawal
   after a prior successful read, client protocol failures, rendering states,
   and the route-to-Fastify boundary; all existing tests remain green.
10. Lint, format, typecheck, unit/integration tests, production build,
    repository check, and `git diff --check` pass under pinned tools.
11. Independent Agent 90 and QA/security review the exact integrated head and
    report zero open `BLOCKER` or `HIGH` findings before Gate A passes.

## Metrics

- 100% of published movement entries validate against the frozen executable
  detail schema and have unique, non-reserved IDs and positive versions.
- 100% of published entries have recorded independent content-review evidence
  bound to the exact ID, version, digest, and source commit, with both reviewer
  role attestations present and every rubric item passing, but no reviewer
  personal or credential identifier retained.
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

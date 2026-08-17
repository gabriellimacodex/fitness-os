# Technical Design 004 — Movement Library

## Status and authority

- Status: Proposed for independent pre-flight review
- PRD: [PRD 04 — Movement Library](../prds/004-movement-library.md)
- Authority: Inherited approved PRD 04 scope after completed PRD 01
- Architecture: existing modular monolith and canonical Fastify client/API topology

This design does not freeze contracts or authorize implementation by itself.
Implementation begins only after pre-flight review and Orchestrator-coordinated
contract freeze.

## Design summary

PRD 04 adds a deterministic, version-controlled text catalog in the existing
domain package, projects it through two schema-validated Fastify endpoints, and
renders it through two dynamic Next.js pages using the typed API client.

```text
packages/schemas (movement contracts)
          │
          ├───────────────┐
          ↓               ↓
packages/domain       apps/web API client
(static catalog)           ↑
          │                │
          ↓                │
apps/api movement routes ──┘
          ↑
          │
future clients
```

There is no database, content-management system, external media source, search
index, or provider adapter. PRD 03 is a sibling capability and is absent from
the dependency graph, imports, data, and public contracts.

## Boundaries and responsibilities

### Shared executable contracts

`packages/schemas` owns the public movement contracts:

- `movementIdSchema` accepts 3–64 lowercase ASCII characters using
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- `movementContentVersionSchema` accepts integers from 1 through 2,147,483,647;
- normalized trimmed name strings contain 1–80 characters, summary strings
  contain 1–240 characters, and each instructional string contains 1–300
  characters;
- `movementSummarySchema` carries stable identity, current version, name, and
  short description;
- `movementDetailSchema` requires setup 1–8 items, ordered steps 1–12, cues
  1–8, common mistakes 1–8, and safety notes 1–6;
- `movementListResponseSchema` is a strict `{ items }` object whose array
  contains 0–100 summaries;
- `movementEmptyQuerySchema` is a strict empty object and rejects every query
  key;
- `movementDetailParamsSchema` is a strict object containing only the bounded
  `movementId`; and
- `movementDetailResponseSchema` carries one published detail.

All public objects are strict. The limits above are freeze requirements, not
placeholders. Catalog construction fails above 100 published entries until
pagination receives later approved scope. Empty catalogs are valid list
responses; published details require every instructional section to be
non-empty.

Zod code is the field-level Source of Truth. The PRD and this design describe
semantics and constraints needed for freeze; `docs/contracts` later records the
final symbol names, owners, consumers, and status without duplicating shapes.

Existing `apiErrorResponseSchema` and stable platform codes are reused. No new
movement-specific public error envelope or error code is created.

### Domain movement catalog

`packages/domain` adds a movement-library module containing:

- a reviewed constant collection of current published movement details;
- an append-only identity/version manifest from which withdrawn/reserved state
  is derived;
- a pure `listMovements()` function that returns summaries sorted by
  `movementId`; and
- a pure `getMovementById(movementId)` function that returns the current
  published detail or no result.

The module validates source entries with the frozen framework-free schemas when
it is initialized. It rejects duplicate published IDs, overlap with reserved
IDs, invalid versions, malformed content, and nondeterministic source
construction. Returned values do not expose mutable internal arrays or objects.

The catalog uses no clock, random value, environment variable, network call,
database, filesystem read at runtime, or provider. The source file contains only
current reviewed content. The manifest retains every publish, revise, withdraw,
and reviewed-republish transition; Git history retains the exact source and
review evidence for each version.

The domain package does not gain Fastify, Next.js, React, Drizzle, or database
imports. It may consume the framework-free schema package for validation and
inferred contract types. No generic repository or storage interface is created
until a later approved persistence need exists.

### Fastify API

`apps/api` adds a focused route module and registers it from the existing app:

| Request                              | Behavior                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| `GET /movements`                     | 200 with the schema-validated, deterministically sorted list |
| `GET /movements/:movementId`         | 200 with one schema-validated published detail               |
| either route with any query key      | 400 `BAD_REQUEST` platform envelope                          |
| malformed `movementId`               | 400 `BAD_REQUEST` platform envelope                          |
| unknown or withdrawn `movementId`    | 404 `NOT_FOUND` platform envelope                            |
| unexpected catalog/handler exception | 500 `INTERNAL_ERROR` platform envelope and internal log      |

Both routes accept no body and parse the query through
`movementEmptyQuerySchema`. The detail route also parses
`movementDetailParamsSchema`. Search, filter, pagination, variants, and
personalization are not implicit APIs. Success responses are parsed by the
paired list/detail response schema immediately before sending. Success and
error responses set `Cache-Control: no-store`.

The root platform continues to own safe error provenance, request IDs, logging,
and CORS. All responses carry the server-generated `x-request-id`; movement
errors place the same ID in the public envelope. No request header, route param,
catalog field, or caller-supplied Fastify option may control it.

The route module calls the concrete deterministic domain functions directly.
An injected repository, provider abstraction, or asynchronous storage port is
deferred because PRD 04 has exactly one in-process source and no failure mode
that such an abstraction would solve.

### Web API client

`apps/web/lib/api-client.ts` adds:

- `movements()` for the list response; and
- `movement(movementId)` for one detail response.

Both methods accept the factory's existing injected `fetch`, send JSON GETs,
validate successful payloads through movement schemas, and reuse
`ApiClientError`/`ApiProtocolError` for schema-valid and protocol-invalid
failures. The detail path encodes the identifier as one URL segment. Neither
method returns unchecked JSON or includes raw response content in an error.

Movement reads use request-time fetching without a persistent or offline cache.
Every request passes `cache: 'no-store'` and uses a fresh `AbortController` with
a fixed 3,000 ms timeout. A caller abort and the timeout both cancel the fetch,
clear the timer, and surface only the existing safe unavailable behavior. The
client holds no last-success value and performs no React, module, browser, or
service-worker caching. This makes withdrawal/correction behavior explicit;
these freshness guarantees may be revised only by later approved scope.

### Web routes and rendering

Next.js adds dynamic request-time pages:

- `apps/web/app/movements/page.tsx`; and
- `apps/web/app/movements/[movementId]/page.tsx`.

These server-rendered routes obtain a validated, server-only API base URL and
call Fastify through the typed API client. They never import the domain or
database packages. Dynamic rendering prevents the production build from
requiring a live API and prevents guidance from becoming an unreviewed static
build artifact.

Each movement page exports `dynamic = 'force-dynamic'` and `revalidate = 0` and
uses only the client's `cache: 'no-store'` fetch. It does not use `unstable_cache`,
React `cache`, pre-generation, or a client-side store. Therefore a withdrawal
observed by Fastify cannot be replaced by a previously rendered catalog/detail.

The server-only `API_BASE_URL` setting is an absolute HTTP(S) URL with a safe
local default of `http://127.0.0.1:3001`. It is trusted operator configuration,
not a public credential or user-controlled destination. Implementation
documents it in `.env.example` through the shared-file coordination process.

Rendering uses plain React text nodes only:

- one `main` landmark and logical page heading;
- a semantic list of linked summaries;
- definition-style setup/cue/mistake/safety sections with descriptive headings;
- an ordered list for steps;
- visible keyboard focus and a clear return link; and
- safe empty, unavailable, malformed-response, and not-found states.

The detail route maps a schema-valid API `NOT_FOUND` to the application's normal
not-found page. Network, protocol, and server failures render a generic
retryable state without the API base URL, raw body, stack, or catalog internals.
No HTML parser, Markdown renderer, media player, animation library, or new UI
dependency is added.

## Content model and governance

### Stable identity and revision

- A published `movementId` is the permanent identity and never changes because
  a title changes.
- A user-visible text change increments `contentVersion` by one.
- New movements begin at version `1`.
- Publish, revise, withdraw, and reviewed republish each append one manifest
  record containing a per-movement event sequence, movement ID, version,
  lifecycle action, canonical-detail SHA-256, and the expected durable
  review-record path for content-publication actions. Withdrawal retains the
  preceding version and digest and requires no new content review.
- Existing manifest records cannot be edited, reordered, or removed. Withdrawn
  IDs are excluded from current list/lookup but remain reserved by the manifest.
- A withdrawn ID cannot be reassigned or silently resurrected. Republishing the
  same movement requires explicit review and a higher version.
- CI compares the manifest with the merge base and Git history. It rejects
  record mutation/removal, ID reassignment, version gaps or non-increments,
  content digest drift, a current catalog that disagrees with the latest
  lifecycle action, and a published version without its durable review record.
- Runtime code does not infer history from timestamps or mutable current files.

The public version identifies the revision served; it is not a quality score,
measurement, evidence grade, or statement of safety.

### Authoring and review workflow

Each published entry contains plain text for name, summary, setup, steps, cues,
common mistakes, and safety notes. Canonical content is UTF-8 JSON of the
strict-schema output in fixed field order after Unicode NFC normalization and
trimming; array order is preserved because it is instructional meaning. A
durable record at
`docs/execution/content-reviews/movements/<movementId>-v<contentVersion>.md`
binds the ID, version, canonical SHA-256, and exact catalog-source commit SHA to
the author, both reviewer roles, Movement/safety credential title, issuer,
current-as-of date, movement-scope rationale, intended-reader basis, and every
rubric result. The source/manifest commit is created first; reviewers inspect
that immutable commit; the review record is added in a later commit. Gate A
proves the reviewed commit is an ancestor of the exact head and recalculates the
same digest from the head, preventing post-review content drift. Personal
contact details are not copied into runtime content.

The qualified Movement/safety reviewer must be independent of the author and
hold a current recognized exercise-professional, movement-coaching,
physiotherapy, or equivalent qualification whose documented scope covers the
movement. That reviewer must pass every item:

1. the starting position can be identified from the text;
2. steps are ordered and use plain, defined language;
3. cues and mistakes describe observable actions without biomechanical
   certainty;
4. safety wording is prominent and conservative;
5. the entry does not diagnose, rehabilitate, screen contraindications, decide
   suitability, personalize, prescribe training, or claim universal safety;
6. no scientific claim or citation is invented; and
7. the safety instruction is actionable without claiming zero risk.

An independent intended student or coach reader must separately pass every
clarity item:

1. the starting position is identifiable;
2. each step can be followed in order without unstated movement knowledge;
3. unfamiliar terms are removed or defined;
4. section headings and the safety prompt are easy to find; and
5. the entry is understandable without a media asset.

One person may fill both roles only when the record explicitly documents both
the professional qualification and why the person represents an intended
reader. The person still must not be the author, must record each rubric
separately, and must pass every item; a partial result is a failure.

Automated checks enforce structure, bounds, manifest history, content digests,
identifiers, versions, reserved-ID rules, review-record presence, and output
order. They do not claim to establish understandability or safety. A failed or
unavailable Movement/safety or intended-reader review invokes
`HUMAN_PERCEPTION_REQUIRED`. Potentially harmful unresolved instruction invokes
`SAFETY_CRITICAL_UNCERTAINTY`. The affected entry remains unpublished.

## Request and failure flow

```text
browser request
  → dynamic Next.js route
  → typed web API client
  → Fastify request ID + CORS/platform boundary
  → movement route param validation
  → deterministic domain catalog read
  → response schema validation
  → escaped semantic HTML

invalid ID
  → 400 BAD_REQUEST + correlated request ID

unknown/withdrawn ID
  → 404 NOT_FOUND + correlated request ID

invalid catalog source
  → catalog construction/test failure; no partial catalog served

network/protocol/server failure
  → safe web unavailable state; raw response content withheld

timeout/caller abort
  → fetch cancelled by 3,000 ms bound; no prior response substituted

withdrawal after a prior successful read
  → no-store API/client/page path obtains current 404; stale detail is not shown
```

## Configuration

- API `HOST`, `PORT`, `CORS_ALLOWED_ORIGINS`, readiness, errors, and request-ID
  behavior remain unchanged.
- Web `API_BASE_URL` is server-only, absolute HTTP(S), non-secret, and defaults
  locally to `http://127.0.0.1:3001`.
- Request parameters cannot alter the API origin or path prefix.
- No database URL, provider key, media origin, storage bucket, CMS setting, or
  feature flag is introduced.

## Persistence, migration, rollback, and recovery

Persistence and migration are `NOT_APPLICABLE`. Product content is compiled
from reviewed source in `packages/domain`; `packages/database` receives no
schema, migration, seed, connection, or dependency change.

Rollback is a redeploy of a known reviewed commit. A content-only correction
normally increments the affected version. A faulty code deployment may be
reverted, but a prior version known to contain unsafe guidance must not be
restored. In that case, withdraw the entry or publish corrected higher-version
content and redeploy.

Recovery needs no data restore, replay, backfill, reconciliation, or destructive
operation. Git preserves prior source. The current API does not promise access
to historical content; a later persistent or historical model requires its own
approved migration and compatibility plan.

## Security and privacy review points

- Confirm the catalog and responses contain only public, non-personal text.
- Confirm invalid, unknown, withdrawn, malformed-provider, and internal failures
  retain safe envelopes and correlated server-generated IDs.
- Confirm route IDs are bounded and cannot inject a path, query, URL, HTML, or
  log-control sequence.
- Confirm React escaping is retained and no raw HTML/Markdown/media path exists.
- Confirm the server-side API origin is operator-controlled and never derived
  from request data.
- Confirm no authentication assumption is introduced and public catalog access
  is not reused as policy for future personal data.
- Confirm API and Next.js success/error paths retain `no-store`, no pre-rendered
  movement payload exists, and timeout/abort cannot fall back to cached content.
- Confirm authorization/proxy-authorization redaction, CORS credentials-off,
  no-Origin requests, and request-ID non-reflection remain unchanged.
- Confirm no PRD 03, database, body/form, analytics, external provider, or
  generative-runtime dependency entered the diff.

## Test strategy and Red → Green sequence

Every behavior begins as a failing focused test, then receives the minimum
implementation, then is refactored without changing assertions.

### Wave 1 — contracts

- Valid summaries, details, list responses, params, and detail responses parse.
- The strict empty query parses and every query key fails for both endpoints.
- Exact-minimum and exact-maximum IDs, strings, section counts, and the 100-item
  list parse; below-minimum, above-maximum, zero/fractional versions,
  missing/empty required sections, and unexpected fields fail.
- Provider tests pair each route/status with its exact executable success or
  shared error schema.
- Error-envelope compatibility remains unchanged.

### Wave 2 — domain catalog

- Published entries validate and list in deterministic ID order.
- Lookup returns exactly the matching published entry.
- Empty published catalogs produce an empty list.
- Duplicate IDs, a 101-item catalog, reserved-ID reuse, invalid versions, and
  malformed entries fail catalog construction.
- Merge-base/history fixtures prove manifest records cannot be changed, removed,
  or reordered; versions cannot be reused or skipped; digest drift and missing
  exact-version review records fail CI.
- Publish, revision, withdrawal, and reviewed republish fixtures prove current
  catalog state is derived from the latest append-only lifecycle record.
- Returned data cannot mutate the source catalog.

### Wave 3 — API provider

- List and detail successes parse through provider response schemas.
- Empty queries succeed; every query key returns 400 through the shared schema.
- Invalid IDs return 400; unknown and withdrawn IDs return 404.
- Success and error variants set `Cache-Control: no-store`.
- Every variant correlates header and safe error-body request IDs and never
  reflects a client-supplied ID.
- Unexpected errors remain generic and are logged internally.
- Existing health, readiness, CORS, parser, validation-provenance, and error
  regression tests remain green.

### Wave 4 — web consumer and read path

- Injected-fetch tests cover valid list/detail responses, schema-valid API
  failures, non-JSON and malformed successes/failures, URL-segment encoding, and
  raw-content suppression.
- Fake-timer and abort-signal tests prove the 3,000 ms bound cancels the request,
  clears its timer, renders unavailable, and never returns a prior response.
- A sequential withdrawal test returns a valid detail first and 404 second and
  proves API headers, client fetch options, and dynamic Next.js settings prevent
  the first result from being reused. Build inspection proves no movement
  payload was statically generated.
- Rendering tests cover populated list, empty list, valid detail, unavailable,
  malformed-response, and not-found states using semantic HTML assertions.
- Boundary checks prove web code imports neither domain nor database code and
  that the rendered path obtains movement data through the API client.
- Documented manual verification covers keyboard-only navigation, visible focus,
  320 CSS pixels, 200% text zoom, and the independent clarity rubric.

### Integration gates

From a clean worktree without stale `dist` artifacts, run pinned install/build
discipline, lint, formatting, package builds, typecheck, all tests, production
build, repository check, dependency audit, and `git diff --check`. Preserve
observable Red → Green evidence and record exact-head results. Automated
checks do not replace the Movement content review, QA/security, or Agent 90.

## Contract freeze and implementation waves

1. Pre-flight — Agent 90 challenges scope, safety wording, dependency
   independence, contracts, and verification feasibility.
2. Contract freeze — the Schemas owner exclusively adds
   `packages/schemas/src/movement.ts` and
   `packages/schemas/test/movement.test.ts`. The Orchestrator alone updates
   `packages/schemas/src/index.ts` and `docs/contracts/README.md`; provider and
   consumers wait for that integration commit.
3. Wave 2A domain — the Domain owner exclusively adds files below
   `packages/domain/src/movement-library/`, including catalog, manifest,
   manifest-history checks, review-record validation, and colocated tests. The
   owner does not edit `packages/domain/src/index.ts`.
4. Wave 2 bridge — after 2A passes, the Orchestrator alone updates
   `packages/domain/src/index.ts`. Wave 2B API then exclusively adds
   `apps/api/src/movement-routes.ts` and `apps/api/src/movement-routes.test.ts`.
   The API owner does not edit `apps/api/src/app.ts`; after 2B passes, the
   Orchestrator alone registers the route there and owns any necessary
   `app.test.ts` integration edit. This sequencing prevents competing barrel or
   route-registration changes.
5. Web — after the contract-freeze commit, Web/PWA ownership exclusively edits
   `apps/web/lib/api-client.ts`, its tests, and new files under
   `apps/web/app/movements/`. It may run alongside Wave 2 because it consumes
   only frozen schemas and does not edit shared barrels or API registration.
6. Integration — the Orchestrator owns shared `.env.example`, configuration,
   governance-record integration, and documentation changes, integrates in the
   sequence above, and runs all gates.
7. Review — qualified Movement/safety and intended-reader review, QA/security,
   and Agent 90 inspect the exact integrated head; corrections receive affected
   reruns and re-review.

No implementation owner crosses paths from `MULTI_AGENT_PROTOCOL.md` without
explicit reassignment. The Movement reviewer owns content judgment, not an
overlapping uncoordinated code path.

## Alternatives considered

- Depend on PRD 03 exercise knowledge: rejected because the approved dependency
  DAG makes PRD 04 a sibling and later integration belongs to PRD 05.
- Bundle guidance directly in Next.js: rejected because future clients would not
  share the Fastify contract and content could drift from API behavior.
- PostgreSQL or a CMS now: rejected because the small curated read-only catalog
  has no runtime write or query requirement that earns persistence or migration.
- External videos, animations, or images: deferred because they introduce
  provider, licensing, accessibility, safety, and human-perception work not
  required for the text read path.
- Search, filter, taxonomy, and pagination: deferred until catalog size and user
  evidence justify them; PRD 03 taxonomy must not be recreated here.
- A generic catalog repository interface: rejected because one deterministic
  in-process source does not need a swappable abstraction.
- Runtime-generated guidance: rejected because deterministic reviewed content is
  safer, contractable, and sufficient.

## Known limitations

- The catalog is deliberately small, text-only, public, and English-only.
- Content updates require review, a code change, and redeployment.
- The API exposes only the current published revision and no historical lookup.
- There is no search, taxonomy, filter, personalization, media, offline cache, or
  user-state integration.
- Independent review can establish a documented clarity rubric result; it cannot
  prove universal comprehension, suitability, or freedom from injury risk.
- The design creates a stable future reference point but does not integrate with
  exercises, training sessions, Form Intelligence, or body capabilities.

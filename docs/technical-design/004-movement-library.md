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

- `movementIdSchema` accepts a bounded lowercase ASCII slug using
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- `movementContentVersionSchema` accepts positive integers;
- `movementSummarySchema` carries stable identity, current version, name, and
  short description;
- `movementDetailSchema` adds bounded arrays of setup items, ordered steps,
  cues, common mistakes, and safety notes;
- `movementListResponseSchema` carries the deterministic summary list;
- `movementDetailParamsSchema` validates the route parameter; and
- `movementDetailResponseSchema` carries one published detail.

All public objects are strict. Public strings and arrays receive explicit,
reviewed bounds during contract freeze so malformed or unexpectedly large
values fail closed. Empty catalogs are valid list responses; published details
require every instructional section to be non-empty.

Zod code is the field-level Source of Truth. The PRD and this design describe
semantics and constraints needed for freeze; `docs/contracts` later records the
final symbol names, owners, consumers, and status without duplicating shapes.

Existing `apiErrorResponseSchema` and stable platform codes are reused. No new
movement-specific public error envelope or error code is created.

### Domain movement catalog

`packages/domain` adds a movement-library module containing:

- a reviewed constant collection of current published movement details;
- a reserved-ID collection for withdrawn entries;
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
current reviewed content. Git history retains prior revisions; reserved IDs
retain identity after withdrawal.

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
| malformed `movementId`               | 400 `BAD_REQUEST` platform envelope                          |
| unknown or withdrawn `movementId`    | 404 `NOT_FOUND` platform envelope                            |
| unexpected catalog/handler exception | 500 `INTERNAL_ERROR` platform envelope and internal log      |

The routes accept no body and reject undeclared query behavior; search, filter,
pagination, variants, and personalization are not implicit APIs. Route params
are parsed by `movementDetailParamsSchema`. Responses are parsed by their
frozen schemas immediately before sending.

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
This prevents a second bundled copy of guidance and makes withdrawal/correction
behavior explicit. Cache policy is an implementation detail tested at the
client boundary and may be revisited only without weakening current-version or
withdrawal semantics.

### Web routes and rendering

Next.js adds dynamic request-time pages:

- `apps/web/app/movements/page.tsx`; and
- `apps/web/app/movements/[movementId]/page.tsx`.

These server-rendered routes obtain a validated, server-only API base URL and
call Fastify through the typed API client. They never import the domain or
database packages. Dynamic rendering prevents the production build from
requiring a live API and prevents guidance from becoming an unreviewed static
build artifact.

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
- Withdrawn IDs move to the reserved collection and are excluded from list and
  lookup results.
- A withdrawn ID cannot be reassigned or silently resurrected. Republishing the
  same movement requires explicit review and a higher version.
- Source review verifies version increments against the preceding Git revision;
  runtime code does not infer history from timestamps or hashes.

The public version identifies the revision served; it is not a quality score,
measurement, evidence grade, or statement of safety.

### Authoring and review workflow

Each published entry contains plain text for name, summary, setup, steps, cues,
common mistakes, and safety notes. The pull request records the author, the
independent Movement reviewer, the ID/version decision, and the review rubric
result. Personal reviewer metadata is not copied into runtime content.

The Movement reviewer must pass every item:

1. the starting position can be identified from the text;
2. steps are ordered and use plain, defined language;
3. cues and mistakes describe observable actions without biomechanical
   certainty;
4. safety wording is prominent and conservative;
5. the entry does not diagnose, rehabilitate, screen contraindications, decide
   suitability, personalize, prescribe training, or claim universal safety;
6. no scientific claim or citation is invented; and
7. the entry is understandable without a media asset.

Automated checks enforce structure, bounds, identifiers, versions, reserved-ID
rules, and output order. They do not claim to establish understandability or
safety. A failed/unavailable clarity review invokes `HUMAN_PERCEPTION_REQUIRED`.
Potentially harmful unresolved instruction invokes
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
- Confirm authorization/proxy-authorization redaction, CORS credentials-off,
  no-Origin requests, and request-ID non-reflection remain unchanged.
- Confirm no PRD 03, database, body/form, analytics, external provider, or
  generative-runtime dependency entered the diff.

## Test strategy and Red → Green sequence

Every behavior begins as a failing focused test, then receives the minimum
implementation, then is refactored without changing assertions.

### Wave 1 — contracts

- Valid summaries, details, list responses, params, and detail responses parse.
- Invalid ID forms, zero/fractional versions, missing/empty required sections,
  unexpected fields, and out-of-bound values fail.
- Error-envelope compatibility remains unchanged.

### Wave 2 — domain catalog

- Published entries validate and list in deterministic ID order.
- Lookup returns exactly the matching published entry.
- Empty published catalogs produce an empty list.
- Duplicate IDs, reserved-ID reuse, invalid versions, and malformed entries fail
  catalog construction.
- Returned data cannot mutate the source catalog.

### Wave 3 — API provider

- List and detail successes parse through provider response schemas.
- Invalid IDs return 400; unknown and withdrawn IDs return 404.
- Every variant correlates header and safe error-body request IDs and never
  reflects a client-supplied ID.
- Unexpected errors remain generic and are logged internally.
- Existing health, readiness, CORS, parser, validation-provenance, and error
  regression tests remain green.

### Wave 4 — web consumer and read path

- Injected-fetch tests cover valid list/detail responses, schema-valid API
  failures, non-JSON and malformed successes/failures, URL-segment encoding, and
  raw-content suppression.
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
2. Contract freeze — Orchestrator coordinates `packages/schemas` and
   `docs/contracts`; provider and consumers do not begin first.
3. Catalog/API — API/Domain ownership implements schemas' backend consumer,
   catalog, route provider, and colocated tests.
4. Web — Web/PWA ownership extends the client and pages after contract freeze.
   It may proceed in parallel with Catalog/API because it consumes only frozen
   schemas.
5. Integration — Orchestrator coordinates shared configuration/documentation,
   integrates branches, and runs all gates.
6. Review — independent Movement content review, QA/security, and Agent 90
   inspect the exact integrated head; corrections receive affected reruns and
   re-review.

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

# PRD 04 Implementation Review

## Review identity

| Field                | Value                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Type                 | Independent Agent 90 implementation review                                               |
| Round                | 1                                                                                        |
| Repository           | `gabriellimacodex/fitness-os`                                                            |
| Pull request         | https://github.com/gabriellimacodex/fitness-os/pull/15                                   |
| Candidate branch     | `feat/prd-04-movement-library`                                                           |
| Base branch          | `main` (`e1bc9e996da1a6df035c63987f6471f4b358f7a9`)                                      |
| Exact head SHA       | `7731903f283e715dac0007465f2163ea864ea806`                                               |
| Date                 | 2026-08-17                                                                               |
| Authority            | PRD 04 Movement Library (`IN_PROGRESS`), Technical Design 004 approved, contracts frozen |
| Disposition          | `FAIL`                                                                                   |
| Final recommendation | `CORRECTION_REQUIRED`                                                                    |

The reviewer did not author PR #15 or its handoff. Builder claims were treated
as hypotheses and checked against the exact-head tree, the complete
`main...head` compare, raw source at `7731903`, and the GitHub Actions run for
that SHA.

This review does **not** treat empty published content as a defect. The PR
states that the catalog remains empty until independent human receipts exist
and does not claim PRD completion or Gate A content publication. That
limitation is authorized. Test-only review keys must still fail closed for
production/Gate A; that property was checked independently.

## Finding summary table

| Severity  | Open | Deferred | Resolved this round |
| --------- | ---: | -------: | ------------------: |
| `BLOCKER` |    0 |        0 |                   0 |
| `HIGH`    |    2 |        0 |                   0 |
| `MEDIUM`  |    6 |        0 |                   0 |
| `LOW`     |    5 |        0 |                   0 |

`PASS` is prohibited while any `HIGH` remains open.

## Evidence inspected

- PR #15 metadata, body, and single commit
  `7731903f283e715dac0007465f2163ea864ea806`
- Compare `e1bc9e996da1a6df035c63987f6471f4b358f7a9...7731903f283e715dac0007465f2163ea864ea806`
  (26 files, +2158 / −12)
- Authority documents at the reviewed head:
  `docs/prds/004-movement-library.md`,
  `docs/technical-design/004-movement-library.md`,
  `PRODUCT_PRINCIPLES.md`,
  `MULTI_AGENT_PROTOCOL.md`,
  `docs/contracts/README.md`,
  `docs/prds/PRD_REGISTRY.md`,
  `docs/execution/REVIEWER_AGENT.md`,
  `docs/execution/RELEASE_GATES.md`,
  ADR 004
- Frozen movement contracts already on `main`:
  `packages/schemas/src/movement.ts` (unchanged in this PR)
- Every added/modified implementation file at the exact head, including:
  `packages/domain/src/movement-library/{canonical,catalog,manifest,review-record,index}.ts`,
  domain tests and fixtures,
  `apps/api/src/{app,movement-routes,bootstrap,server}.ts` and
  `movement-routes.test.ts`,
  `apps/web/lib/{api-client,api-base-url}.ts` and tests,
  `apps/web/app/movements/**`,
  `apps/web/app/not-found.tsx`,
  `apps/web/app/globals.css`,
  `.env.example`
- Persistence non-change: `packages/database/src/schema.ts` blob
  `a29ea16dc516f7c164c8cbf14b53bd5cc500290c` is identical on base and head
- CI for the exact head:
  Actions run `32063530065`, job `quality` / check-run `95490051838`,
  `conclusion=success`, steps lint / format / typecheck / test / build all
  succeeded

The PR description's local Node 24.13.1 disclaimer was not used as evidence.
CI on `7731903` is the engine result relied upon.

## Required review-area outcomes table

| Review area         | Outcome          | Rationale                                                                                                                                                                                                                                                     |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product / authority | `FAIL`           | PRD 04 is `APPROVED` / `IN_PROGRESS` and this mechanics slice is authorized, but shipped identity/version governance and error freshness do not meet the approved PRD/TD. Empty catalog itself is authorized.                                                 |
| DAG                 | `PASS`           | PRD 04 depends only on completed PRD 01. No PRD 03 import, runtime type, or contract reuse. PRD 02/07/21/25 surfaces were not opened.                                                                                                                         |
| Product Principles  | `FAIL`           | PP-09/PP-11 hold for the empty read path. PP-12 is broken by an unauthorized injectable catalog port. PP-08/PP-07 are intact for empty public text.                                                                                                           |
| Architecture        | `FAIL`           | Fastify remains the only data plane and web pages are dynamic clients. TD 004 forbids an injected catalog/repository; `PlatformOptions.movementCatalog` adds one and is the only 200-detail proof.                                                            |
| Contracts           | `PASS`           | No schema/registry change. Frozen movement Zod is consumed, not rewritten. No new public error code.                                                                                                                                                          |
| Identity / sessions | `NOT_APPLICABLE` | No account, authn, authz, student, or coach context is introduced. Public catalog access is not reused as a later private-data policy.                                                                                                                        |
| Operations          | `FAIL`           | `.env.example` documents `API_BASE_URL`, but authoring, review, version increment, withdrawal, rollback, and failure runbooks required by PRD Scope are absent. Invalid `API_BASE_URL` crashes the page default-arg path instead of a safe operational state. |
| Persistence         | `PASS`           | `packages/database` is untouched. No migration, seed, connection, or product table. `NOT_APPLICABLE` for migrations is justified.                                                                                                                             |
| Security / privacy  | `FAIL`           | Review objects reject listed identifying fields and test authorities cannot satisfy `verifyReviewRecord` unless opted in. Movement 500s omit `Cache-Control: no-store`. Injection can serve unreviewed instructional text.                                    |
| Failure / recovery  | `FAIL`           | 400/404 envelopes are correlated and generic. Unexpected catalog/handler failures inherit the platform 500 path without no-store and without a movement-route test. Invalid API origin throws before the page `try`.                                          |
| Tests / CI          | `FAIL`           | Job `quality` is green on `7731903`. Required merge-base/history, unexpected-500, detail-query, sequential-withdrawal, and build-inspection evidence is missing. The only 200-detail test uses a fake catalog.                                                |
| Scope / docs        | `FAIL`           | Diff stays inside PRD 04 mechanics and does not start another PRD. Required operational/governance documentation was not added.                                                                                                                               |

## Findings

### HIGH-1 — Append-only identity/version ledger is not a version-controlled artifact and CI does not compare merge-base or Git history

- **Severity:** `HIGH`
- **Evidence:**
  - Default catalog is `export const movementCatalog = createMovementCatalog();`
    in `packages/domain/src/movement-library/catalog.ts`, which defaults
    `published` and `manifest` to empty in-memory arrays.
  - There is no committed catalog source, no committed manifest array, and no
    `docs/execution/content-reviews/movements/` tree on `7731903`.
  - `deriveManifestState` validates a caller-supplied array. Nothing compares
    that array to `main` or to Git history.
  - Domain tests in `packages/domain/test/movement-library.test.ts` construct
    fixtures in process. They never load merge-base blobs or `git log` history.
  - `.github/workflows/ci.yml` is unchanged and still only lint / format /
    typecheck / test / build.
  - PRD 04 Data / AC2 and TD 004 §Content model and Wave 2 require CI to
    reject record mutation, removal, reorder, ID reuse, version gaps, digest
    drift, and missing exact-version review records against merge-base and Git
    history.
- **Impact:** “Append-only” is a runtime function, not an enforceable
  repository invariant. The first content commit can edit, reorder, or drop
  prior identity/version records and still pass the current suite. Reserved-ID
  history is not protected by the merge gate this PR claims to implement.
- **Reproduction:** Merge this head. A later PR that mutates or deletes a
  previously appended manifest record has no CI job or fixture that compares
  the candidate manifest to `origin/main`.
- **Resolution condition:** Commit an explicit version-controlled catalog and
  append-only manifest (empty arrays are acceptable). Add merge-base/history
  tests that fail on mutation, removal, reorder, ID reassignment, version
  skip, digest drift, and missing review evidence. Keep those tests red until
  the enforcement exists.

### HIGH-2 — Unexpected movement API failures omit `Cache-Control: no-store`

- **Severity:** `HIGH`
- **Evidence:**
  - `apps/api/src/movement-routes.ts` sets `cache-control: no-store` on the
    400/404 helper and on 200 success. Catalog/handler exceptions are not
    caught.
  - `apps/api/src/app.ts` `setErrorHandler` returns the generic
    `INTERNAL_ERROR` envelope and does **not** set `Cache-Control`.
  - `apps/api/src/movement-routes.test.ts` never injects a throwing catalog
    and never asserts no-store on 500.
  - PRD 04 Security and TD 004 Fastify table / Wave 3 require success **and
    error** variants, including unexpected catalog/handler exceptions, to set
    `Cache-Control: no-store`.
- **Impact:** A transient 500 on `GET /movements` or
  `GET /movements/:movementId` can be stored by an intermediary or browser.
  After a withdrawal or correction, a cached error or a later recovered
  payload can violate the no-stale guarantee that the PRD treats as a safety
  property of this public read path.
- **Reproduction:** `buildApp` + a `movementCatalog.listMovements()` that
  throws. The 500 body is the safe envelope; `cache-control` is absent.
- **Resolution condition:** Every movement success and error, including
  platform-handled 500s on these routes, must set `Cache-Control: no-store`.
  Add a focused test that a throwing catalog yields `500` /
  `INTERNAL_ERROR` / correlated request ID / no internal text / `no-store`.

### MEDIUM-1 — Unauthorized injectable catalog port can serve unreviewed guidance

- **Severity:** `MEDIUM`
- **Evidence:**
  - TD 004: the route module must call the concrete domain functions directly;
    “an injected repository, provider abstraction, or asynchronous storage
    port is deferred.”
  - `PlatformOptions.movementCatalog` in `apps/api/src/app.ts` and
    `MovementRouteCatalog` in `movement-routes.ts` add that port.
  - The only HTTP 200 detail test builds a catalog that returns squat text
    with no manifest, digest, or review record.
  - Production `bootstrapApi()` does not pass the option, so the default
    empty domain catalog is what `server.ts` serves.
- **Impact:** The public API can emit instructional content that never passed
  catalog construction. Tests give false confidence that a published detail
  works end-to-end. This violates PP-12 and the approved TD.
- **Resolution condition:** Remove the production injection seam. Prove 200
  detail through `createMovementCatalog` (test fixtures / `allowTestAuthority`
  at catalog construction, not a raw route double). Keep bootstrap on the
  single in-process catalog.

### MEDIUM-2 — Invalid `API_BASE_URL` throws before the page failure handler

- **Severity:** `MEDIUM`
- **Evidence:**
  - `loadMovements` / `loadMovement` evaluate
    `createApiClient({ baseUrl: getApiBaseUrl() })` as a default parameter,
    which runs **before** the `try` body.
  - `getApiBaseUrl('ftp://example.com')` and `getApiBaseUrl('/api')` throw
    `TypeError('API base URL must be an absolute HTTP(S) URL.')`.
  - Missing env defaults to `http://127.0.0.1:3001` (authorized). Invalid env
    is not covered by the page tests.
  - PRD failure mode: invalid server-side API base URL “fails closed with a
    safe operational error.”
- **Impact:** A misconfigured deployment renders a Next.js exception page
  instead of the designed unavailable state. Fail-closed (no user-controlled
  fetch) holds; the safe operational UI does not.
- **Resolution condition:** Validate the origin inside the `try`, or catch
  default-arg construction, and map invalid configuration to the same
  non-technical unavailable state. Add a page-level test.

### MEDIUM-3 — Durable review records are in-memory objects, not the specified files

- **Severity:** `MEDIUM`
- **Evidence:**
  - PRD/TD require
    `docs/execution/content-reviews/movements/<id>-v<version>.md` binding ID,
    version, digest, source commit, and two signed receipts.
  - Implementation stores `MovementReviewRecord` objects and uses that path
    only as a `Map` key in `createMovementCatalog`.
  - No markdown parser, no directory, no CI that reads those files.
  - `allowTestAuthority: true` lets `createMovementCatalog` accept
    `createTestReviewAuthority()` receipts. Default `movementCatalog` does
    not use this.
  - `verifyReviewRecord` without `allowTestAuthority` rejects `kind: 'test'`
    with “cannot satisfy publication or Gate A.”
- **Impact:** Empty catalog remains authorized. The publication mechanism is
  not the one Gate A is specified to verify. A later content PR can compile
  objects that never existed as durable files.
- **Resolution condition:** Before any publication, add the file format,
  parser, and CI binding. Keep test keys fail-closed unless a test explicitly
  opts in. Do not treat synthetic keys as Gate A evidence.

### MEDIUM-4 — Required read-path failure and freshness tests are missing

- **Severity:** `MEDIUM`
- **Evidence (TD Wave 3–4 / PRD AC9):**
  - No `GET /movements/:movementId?any=key` 400 test (handler exists).
  - “Unknown or withdrawn” API test hits the empty catalog; it does not
    withdraw a previously published ID through the real catalog.
  - No sequential client test: valid detail, then 404, proving no reuse of
    the first payload.
  - No build inspection that movement routes are `ƒ` and that no movement
    payload is statically generated.
  - Timeout test name claims “does not return a prior result” but never
    stores a prior success.
  - No documented keyboard / 320 CSS px / 200% zoom verification.
- **Impact:** Green CI does not cover the freshness and accessibility
  evidence the approved design requires for the pages this PR adds.
- **Resolution condition:** Add the missing provider/consumer tests and
  record the manual a11y checks. Keep empty-catalog 200-list and 404-detail
  tests.

### MEDIUM-5 — Authoring, review, withdrawal, rollback, and failure documentation is missing

- **Severity:** `MEDIUM`
- **Evidence:** PRD 04 Scope requires documenting authoring, review, version
  increment, withdrawal, rollback, and failure behavior. The 26-file diff
  updates only `.env.example`. `docs/contracts/README.md` is unchanged
  (acceptable: contracts were already frozen). No operational note states
  that the shipped catalog is empty and that Gate A content publication is
  not claimed.
- **Impact:** Gate A “required documentation = UPDATED” is not met for the
  capability this PR introduces. Operators have no recovery rule that an
  unsafe prior version must not be restored by revert.
- **Resolution condition:** Add the operational/governance note matching
  actual behavior, including empty-catalog limitation,
  `HUMAN_PERCEPTION_REQUIRED`, and rollback rules.

### MEDIUM-6 — Production domain barrel exports receipt minting and test-key generation

- **Severity:** `MEDIUM`
- **Evidence:** `packages/domain/src/movement-library/index.ts` re-exports
  `createSignedReviewRecord`, `createTestReviewAuthority`, and
  `productionReviewAuthorityFromConfig`. `review-record.ts` uses
  `generateKeyPairSync`, `sign`, and `createPrivateKey`.
  `productionReviewAuthorityFromConfig` labels any fingerprint-matching PEM
  as `kind: 'production'` and does not consult an external pinned keyring.
- **Impact:** An author or agent can mint syntactically valid receipts in
  process. Default verify-path still rejects `kind: 'test'` unless opted in.
  There is no protected Gate A job on this head (authorized while unpublished).
- **Resolution condition:** Keep signing/keygen off the production export
  surface, or confine them to test-only modules. Leave production pinning
  outside the repository. Do not add a repo-supplied trust anchor.

### LOW-1 — Web boundary test does not inspect source imports

`apps/web/app/movements/page.test.tsx` `JSON.stringify`s the imported module
object. That cannot contain `@fitness-os/domain`. ESLint remains the real
boundary. Resolution: assert against the page source text or import graph.

### LOW-2 — Instructional list keys use raw text

`movement-views.tsx` uses `key={item}` for setup/steps/cues/mistakes/safety.
Duplicate strings, which the schema allows, collide. Use index-stable keys
inside each bounded section.

### LOW-3 — Detail `not_found` view is dead

`MovementDetailView` renders a not-found main, but
`apps/web/app/movements/[movementId]/page.tsx` calls `notFound()` first.
The dedicated view is untested as a route. Either use it or drop it.

### LOW-4 — Manifest “sparse” check is unreachable

`deriveManifestState` rejects `records[index - 1] === undefined` while
iterating `records.entries()`. A dense JS array never hits that branch.

### LOW-5 — `/movements` is not linked from the PWA home

`apps/web/app/page.tsx` still renders only `FoundationMessage`. The PRD
requires the two public paths to exist; it does not require a home link.
Discoverability on a 320 px student device is poor.

## Validation performed

- Confirmed exact head `7731903f283e715dac0007465f2163ea864ea806` is PR #15
  `head.sha` and the only commit on the branch.
- Confirmed CI run `32063530065` / check-run `95490051838` (`quality`)
  succeeded on that SHA: lint, format, typecheck, test, build.
- Read every changed implementation file and the frozen movement schema.
- Verified `packages/database/src/schema.ts` blob unchanged vs `main`.
- Verified no `packages/schemas` or `docs/contracts` change.
- Verified default `listMovements()` is `[]` and
  `getMovementById('bodyweight-squat')` is `not_found`.
- Verified `verifyReviewRecord(record, testAuthority)` throws without
  `allowTestAuthority: true`.
- Verified `bootstrapApi` does not pass `movementCatalog`.
- Verified movement pages export `dynamic = 'force-dynamic'` and
  `revalidate = 0`, and the client sends `cache: 'no-store'` with a 3,000 ms
  abort.

## Known limitations

- Tests and `next build` were not re-executed locally. CI on `7731903` is
  the automated result of record.
- Next build output was not downloaded, so `ƒ` vs static generation was not
  independently inspected beyond source exports.
- Keyboard, 320 CSS px, and 200% zoom were not executed. No documented
  manual evidence exists in the diff.
- GitHub Actions log bodies were not fetched; step conclusions were.
- This review does not certify understandability or instruction safety of
  future published text. There is no published text on this head.
- Independence disclosure: review used the public GitHub API and raw files
  at the exact SHA rather than a builder worktree.

## Authorized non-findings

These are **not** `HIGH`:

- Empty published catalog and empty list 200.
- Absence of Human Review Authority receipts and of a protected Gate A
  receipt job, while no entry is published.
- Synthetic test keys, provided they cannot satisfy production/Gate A
  without an explicit test opt-in (current default path).
- No `packages/database` change.
- No PRD 03 dependency.
- Contracts remaining frozen.

## Final disposition

`FAIL`

Autonomous merge is prohibited until HIGH-1 and HIGH-2 are corrected on a new
head, the affected tests/CI are rerun, and Agent 90 re-reviews that exact
SHA. MEDIUM findings must be fixed in the same correction loop or explicitly
deferred with tracking; they are not merge blockers by themselves.

`PASS` requires 0 `BLOCKER` and 0 `HIGH`. This round has 0 `BLOCKER` and
2 `HIGH`.

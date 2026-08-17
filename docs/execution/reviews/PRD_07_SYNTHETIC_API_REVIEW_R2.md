# PRD 07 Synthetic API Review — Round 2

## Review identity

| Field                 | Value                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Type                  | Independent Agent 90 implementation review                                                                          |
| Round                 | 2                                                                                                                   |
| Repository            | `gabriellimacodex/fitness-os`                                                                                       |
| Pull request          | https://github.com/gabriellimacodex/fitness-os/pull/20                                                              |
| Candidate branch      | `feat/prd-07-synthetic-api`                                                                                         |
| Base branch           | `main` (`b45bbf06e879069e5eeb5b2677f2ac4ff510e440`)                                                                 |
| Previous reviewed SHA | `f0da3691a3d18214fd3e9e90e593b2e762078af7`                                                                          |
| Exact head SHA        | `e238900ae52dfc981949dc7fa7ddb419f250a1b3`                                                                          |
| Date                  | 2026-08-17                                                                                                          |
| Authority             | PRD 07 Onboarding (`IN_PROGRESS`), Technical Design 007, contracts frozen in #17, domain invariants on main via #18 |
| Disposition           | `FAIL`                                                                                                              |
| Final recommendation  | `CORRECTION_REQUIRED`                                                                                               |

The reviewer did not author PR #20, the R1 correction commit, or the builder
handoff. Builder claims were treated as hypotheses and checked against the
exact-head tree, the `f0da369...e238900` correction diff, the complete
`main...head` compare, independently executed `buildApp` reproductions, local
API tests and typecheck, and GitHub Actions run `32071062616` for this SHA.

This review does **not** treat the absence of PostgreSQL, identity-provider
sessions, resume/abandon/claim/issue/revoke routes, or real-user activation as
a defect. Those limitations remain authorized. Advertised behavior of the four
shipped routes is still reviewed against the frozen contracts and the approved
PRD/TD.

## Finding summary table

| Severity  | Open | Deferred | Resolved this round |
| --------- | ---: | -------: | ------------------: |
| `BLOCKER` |    0 |        0 |                   0 |
| `HIGH`    |    0 |        0 |                   2 |
| `MEDIUM`  |    1 |        0 |                   7 |
| `LOW`     |    1 |        0 |                   5 |

`PASS` is prohibited while required CI on the exact head is red. No open
`HIGH` remains. Autonomous merge is still prohibited by Gate A (`CI = GREEN`).

## Evidence inspected

- PR #20 metadata and commits `f0da369`, `e238900`
- Correction range `f0da369...e238900` (13 files, +1204 / −182)
- Full compare `b45bbf0...e238900` (12 files, +2026 / −2)
- Authority documents at this head: PRD 007, TD 007, `PRODUCT_PRINCIPLES.md`,
  `docs/contracts/README.md`, `REVIEWER_AGENT.md`, `RELEASE_GATES.md`, R1
  record `docs/execution/reviews/PRD_07_SYNTHETIC_API_REVIEW.md`
- Frozen onboarding contracts: `packages/schemas/src/onboarding.ts` is
  net-zero versus `main` (R1 type export reverted)
- Domain public barrel: `packages/domain/src/onboarding/index.ts` now
  re-exports the existing `ProposedRole` type
- Implementation at `e238900`:
  `apps/api/src/app.ts`,
  `apps/api/src/bootstrap.ts`,
  `apps/api/src/onboarding/{canonical,routes,store,test-store}.ts` and tests
- Unchanged production entry: `apps/api/src/server.ts` and
  `packages/database` have an empty diff versus `main`
- Independent local execution (Node v24.13.1):
  - `pnpm --config.engine-strict=false --filter @fitness-os/api test`
    → 6 files, 61 tests, pass in 526ms
  - `pnpm --config.engine-strict=false --filter @fitness-os/api exec tsc --noEmit`
    → pass
  - schemas and domain `tsc --noEmit` → pass
  - `prettier --check docs/execution/reviews/PRD_07_SYNTHETIC_API_REVIEW.md`
    → fail (table alignment)
- Independent reproductions against `buildApp` at this head (see HIGH-1,
  HIGH-2, MEDIUM-1/2/3/5)
- CI for the exact head:
  Actions run `32071062616`, job `quality` / check-run `95514176575`,
  `headSha=e238900ae52dfc981949dc7fa7ddb419f250a1b3`,
  `conclusion=failure`. Lint succeeded. Format failed. Typecheck, test, and
  build were skipped.

## Required review-area outcomes table

| Review area         | Outcome          | Rationale                                                                                                                                                                                                   |
| ------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product / authority | `PASS`           | Authorized synthetic Fastify slice. HIGH-1 and HIGH-2 resolution conditions hold on this head.                                                                                                              |
| DAG                 | `PASS`           | Still only PRD 07 on top of completed PRD 02. No PRD 03/21/25 implementation.                                                                                                                               |
| Product Principles  | `PASS`           | PP-11: digest uses pinned `utf8-json-sha256.v1` (NFC, UTF-8 key order). PP-12: synthetic composition now requires an explicit test flag. PP-07 holds.                                                       |
| Architecture        | `PASS`           | Fastify remains the only data plane. No public synthetic login. `buildApp` refuses `platform.onboarding` unless `allowSyntheticOnboarding === true`. Production bootstrap still omits the seam.             |
| Contracts           | `PASS`           | Frozen Zod is consumed. `GET /current` honors cursor and emits `nextCursor`. Create-attempt returns replay/mismatch envelopes. Unauthorized `ProposedRole` schema export is gone.                           |
| Identity / sessions | `PASS`           | Default `buildApp` is `401 UNAUTHENTICATED` + `no-store` on every onboarding route. Context remains `synthetic: true`. No cookie or browser principal.                                                      |
| Operations          | `PASS`           | In-memory store remains an authorized limitation. Logger now redacts `req.body.claimSecret` and `req.body.retryToken`.                                                                                      |
| Persistence         | `NOT_APPLICABLE` | `packages/database` is untouched. Migration remains deferred.                                                                                                                                               |
| Security / privacy  | `PASS`           | HMAC-SHA-256 verifier with version tag and constant-time compare. Dual-role/self-coach collapse to generic unavailable. Same-role is `mapping_conflict`. Production injection without the test flag throws. |
| Failure / recovery  | `PASS`           | Invalid cursor fails closed (400). Same token + same input replays. Same token + different invitation is `operation_input_mismatch` with zero insert.                                                       |
| Tests / CI          | `FAIL`           | Local 61/61 pass and cover the R1 gaps. Required job `quality` is red on this SHA; format failed and later steps were skipped.                                                                              |
| Scope / docs        | `PASS`           | Diff stays in the authorized API slice plus the R1 review record and a domain type re-export. PR body is stale (still describes 403 / 53 tests) but does not authorize extra product work.                  |

## R1 findings — independent disposition

### HIGH-1 — `GET /v1/onboarding/current` silently drops attempts and ignores the cursor — `RESOLVED`

- **R1 defect:** first four Map-order rows, `cursor` unread, `nextCursor`
  always `null`.
- **Verification at `e238900`:**
  - `routes.ts` filters `isNonterminal`, sorts `(createdAt, attemptId)`,
    decodes a HMAC cursor, applies exclusive `isAfterCursor`, pages 4, and
    emits `nextCursor` when more in-scope rows remain. Invalid/tampered
    cursors return 400.
  - Independent seed: six attempts for `principal-a` (four student + two
    coach) plus one `terminal` row. `GET /current` → 200, 4 student
    summaries, non-null `nextCursor`. Cursor page → the two coach
    attempts, `nextCursor === null`. Terminal id absent. `?cursor=aaaaaaaa`
    → 400 `BAD_REQUEST`.
- **Resolution condition from R1:** met. Not treated as closed because
  tests exist; closed because the R1 scenario no longer reproduces.

### HIGH-2 — `POST /v1/onboarding/attempts` advertises the operation protocol and does not enforce it — `RESOLVED`

- **R1 defect:** new `operationId` every call, `JSON.stringify({ retry })`
  labeled `utf8-json-sha256.v1`, same token + two secrets created two
  attempts.
- **Verification at `e238900`:**
  - Binding key is `principal:create_attempt:hmac(retryToken)`.
  - Digest is `digestUtf8JsonSha256V1({ authority, invitationRef, namespace })`.
  - Same token + same secret → `operation_replayed`, same `operationId` and
    result.
  - Same token + other issued secret → `operation_input_mismatch`,
    `result: null`, `store.attempts.size === 1`.
  - Digest equals an independently computed canonical hash and is not the
    naive `{ retry }` hash.
- **Resolution condition from R1:** met.

### MEDIUM-1 — Second-role denial uses HTTP 403 — `RESOLVED`

Independent: mapped `student` + issued coach invitation → HTTP 200,
`{ outcome: 'invalid_or_unavailable' }`, zero inserts, body does not
contain `second_role`.

### MEDIUM-2 — Same-role create returns 403 instead of `mapping_conflict` — `RESOLVED`

Independent: mapped `student` + issued student invitation → HTTP 200,
`{ outcome: 'mapping_conflict' }`, `store.attempts.size === 0`.

### MEDIUM-3 — Self-coach hardcoded off — `RESOLVED`

`StoredInvitation.targetCoachPrincipalKey` is persisted. Route computes
`targetCoachIsSelf`. Independent: student invitation targeting
`principal-a` → `{ outcome: 'invalid_or_unavailable' }`, no `self_coach`
leak, zero inserts.

### MEDIUM-4 — Claim-secret verifier is unsalted SHA-256 — `RESOLVED`

`digestClaimSecret` is `hmac-sha256.v1:` + HMAC-SHA-256 over the store
pepper. `findInvitationBySecret` uses `fixedLengthEqual` and does not
return on the first match.

### MEDIUM-5 — Production composition has no rejection of synthetic context — `RESOLVED`

`buildApp` throws `Synthetic onboarding composition requires an explicit
test seam` when `onboarding` is set and `allowSyntheticOnboarding` is not
`true`. Independent reproduction confirmed the throw. Default
`buildApp({ logger: false })` remains 401 + `no-store`. `bootstrapApi`
still passes only `corsAllowedOrigins`.

### MEDIUM-6 — Frozen schema module modified without a coordinated freeze — `RESOLVED`

`export type ProposedRole` was removed from `packages/schemas/src/onboarding.ts`.
Net schema diff versus `main` is empty. Routes import `ProposedRole` from
`@fitness-os/domain`.

### MEDIUM-7 — Required mutation/current-state failure tests missing — `RESOLVED`

`routes.test.ts` now covers overflow + cursor round-trip + tampered
cursor, same-token replay/mismatch, `mapping_conflict`, second-role and
self-coach collapse, extra-field rejection, claimed inspect, unexpected
500 `no-store`, and create/detail `no-store`. Local suite is 61 tests.

### LOW-1 through LOW-5 — `RESOLVED`

Logger redacts claim-secret and retry-token body paths. Compare is
constant-time. Seed helpers moved to `test-store.ts`. Ordinal uses highest
existing value. Current 400 and detail 404 assert `no-store`.

## Findings still open

### MEDIUM-8 — Required `quality` job failed on the exact reviewed head

- **Severity:** `MEDIUM`
- **Evidence:**
  - GitHub Actions run `32071062616` / job `95514176575`,
    `headSha=e238900ae52dfc981949dc7fa7ddb419f250a1b3`,
    `conclusion=failure`.
  - Step `Check formatting` failed; typecheck, test, and build were
    skipped.
  - Local `prettier --check` reproduces: only
    `docs/execution/reviews/PRD_07_SYNTHETIC_API_REVIEW.md` (R1 record
    committed in `e238900`) has table-alignment drift.
  - Gate A requires all required jobs green on the exact head
    (`RELEASE_GATES.md`). A skipped typecheck/test/build is not a CI pass.
- **Impact:** Autonomous merge is prohibited. The product HIGH fixes are
  not the failing surface; the committed review markdown is. Local tests
  and typecheck passed, but they do not replace the required CI job.
- **Reproduction:** `pnpm format:check` on this SHA; or open run
  `32071062616`.
- **Resolution condition:** Format the offending file (or stop shipping
  an unformatted R1 record on this branch), push a new SHA, and obtain a
  green `quality` run on that SHA. Do not claim CI green from the R1 run
  on `f0da369`.

This MEDIUM is **not deferred**. Gate A cannot pass while it is open.

### LOW-6 — PR description is stale relative to the correction

The PR body still says second-role returns `403 FORBIDDEN` and
`api: 53 passed`. Current behavior is generic `invalid_or_unavailable` /
`mapping_conflict` and 61 local tests. Documentation drift only; it does
not reintroduce 403.

## New residual notes (not findings)

- `operation_input_mismatch` is returned as HTTP 200 with a typed
  envelope. TD 007 maps that conflict to HTTP 409 + `CONFLICT`. R1 did
  not require the HTTP remapping, and the frozen operation state is
  present. Not raised as `HIGH`.
- `POST /invitations/inspect` still allocates a fresh `operationId` and
  has no retry-token ledger. The frozen inspect body has no `retryToken`;
  inspect is a read. Not a HIGH-2 regression.
- Cursor MAC is store-pepper HMAC, not principal-bound. Pagination offset
  only; results remain principal-filtered.

## Validation performed

- Confirmed exact head `e238900ae52dfc981949dc7fa7ddb419f250a1b3` is
  PR #20 `head.sha`.
- Confirmed merge-base with `main` is
  `b45bbf06e879069e5eeb5b2677f2ac4ff510e440`.
- Confirmed the only post-R1 commit is
  `e238900 fix(api): honor PRD 07 current-state paging and operation replay`.
- Re-ran API tests (61 passed) and API/schemas/domain typecheck locally.
- Independently reproduced the R1 HIGH-1 six-attempt scenario, HIGH-2
  same-token two-secret scenario, MEDIUM-2 same-role mapping conflict,
  MEDIUM-1/3 dual-role and self-coach collapse, and MEDIUM-5 production
  seam rejection against `buildApp`.
- Verified `packages/database` and `apps/api/src/server.ts` are unchanged
  versus `main`.
- Verified default composition is still 401 on onboarding routes and that
  `/v1/onboarding/login`, `/v1/auth/synthetic`, and `/login/synthetic`
  remain 404.
- Verified CI run `32071062616` failed format on this SHA and skipped
  later steps.

## Known limitations

- Keyboard, 320 CSS px, and 200% zoom were not executed. No web surface
  is in this diff.
- GitHub Actions log bodies beyond the failed format step were not
  needed; the failure is the format step itself.
- This review does not certify later identity-provider, session, CSRF,
  PostgreSQL, claim, or policy-gateway slices.
- Independence disclosure: review used the public GitHub API, the local
  worktree at the exact SHA, and independently executed tests. The
  reviewer did not author the candidate.

## Authorized non-findings

These remain **not** `HIGH`:

- In-memory store and the absence of the PRD 07 PostgreSQL migration.
- Absence of resume/abandon/policy-refresh/claim/issue/revoke routes.
- Absence of an identity provider, session cookie, or CSRF proof while
  no credentialed browser session exists.
- Production bootstrap returning 401 on every onboarding route.
- Absence of a public synthetic-login route.
- `LEGAL_PRIVACY_DECISION_REQUIRED` remaining active.
- Inspect allocating a new `operationId` without a retry-token binding.

## Final disposition

`FAIL`

HIGH-1 and HIGH-2 are independently closed on
`e238900ae52dfc981949dc7fa7ddb419f250a1b3`. All seven R1 MEDIUM findings
and five R1 LOW findings are independently closed.

Autonomous merge is still prohibited: required CI on this exact head is
red (MEDIUM-8). Format the R1 review record, rerun `quality` on a new
SHA, and re-check that run. No product HIGH remains to re-implement.

`PASS` requires 0 `BLOCKER`, 0 `HIGH`, and valid exact-head CI evidence.
This round has 0 `BLOCKER`, 0 `HIGH`, and failed CI.

# PRD 07 Synthetic API Review

## Review identity

| Field                | Value                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Type                 | Independent Agent 90 implementation review                                                                                                 |
| Round                | 1                                                                                                                                          |
| Repository           | `gabriellimacodex/fitness-os`                                                                                                              |
| Pull request         | https://github.com/gabriellimacodex/fitness-os/pull/20                                                                                     |
| Candidate branch     | `feat/prd-07-synthetic-api`                                                                                                                |
| Base branch          | `main` (`b45bbf06e879069e5eeb5b2677f2ac4ff510e440`)                                                                                        |
| Exact head SHA       | `f0da3691a3d18214fd3e9e90e593b2e762078af7`                                                                                                 |
| Date                 | 2026-08-17                                                                                                                                 |
| Authority            | PRD 07 Onboarding (`IN_PROGRESS`), Technical Design 007 independently reviewed, contracts frozen in #17, domain invariants on main via #18 |
| Disposition          | `FAIL`                                                                                                                                     |
| Final recommendation | `CORRECTION_REQUIRED`                                                                                                                      |

The reviewer did not author PR #20 or its handoff. Builder claims were treated
as hypotheses and checked against the exact-head tree, the complete
`main...head` compare, raw source at `f0da369`, independently executed API
tests and typecheck, and the GitHub Actions run for that SHA.

This review does **not** treat the absence of PostgreSQL, identity-provider
sessions, resume/abandon/claim/issue/revoke routes, or real-user activation as
a defect. The PR states that this is the first isolated Fastify slice and does
not claim PRD 07 completion or Gate A capability completion. Those limitations
are authorized. Advertised behavior of the four shipped routes is still
reviewed against the frozen contracts and the approved PRD/TD.

## Finding summary table

| Severity  | Open | Deferred | Resolved this round |
| --------- | ---: | -------: | ------------------: |
| `BLOCKER` |    0 |        0 |                   0 |
| `HIGH`    |    2 |        0 |                   0 |
| `MEDIUM`  |    7 |        0 |                   0 |
| `LOW`     |    5 |        0 |                   0 |

`PASS` is prohibited while any `HIGH` remains open.

## Evidence inspected

- PR #20 metadata, body, and single commit
  `f0da3691a3d18214fd3e9e90e593b2e762078af7`
- Compare `b45bbf06e879069e5eeb5b2677f2ac4ff510e440...f0da3691a3d18214fd3e9e90e593b2e762078af7`
  (6 files, +1002 / −0)
- Authority documents at the reviewed head:
  `docs/prds/007-onboarding.md`,
  `docs/technical-design/007-onboarding.md`,
  `PRODUCT_PRINCIPLES.md`,
  `docs/contracts/README.md`,
  `docs/prds/PRD_REGISTRY.md`,
  `docs/execution/REVIEWER_AGENT.md`,
  `docs/execution/RELEASE_GATES.md`,
  `docs/execution/reviews/PRD_07_DESIGN_PREFLIGHT.md`,
  `docs/execution/reviews/PRD_07_TECHNICAL_DESIGN_REVIEW.md`
- Frozen onboarding contracts:
  `packages/schemas/src/onboarding.ts` (one type-export addition in this PR)
- Domain invariants already on `main` (#18):
  `packages/domain/src/onboarding/{attempt,claim,invitation}.ts`
- Every added/modified implementation file at the exact head:
  `apps/api/src/app.ts`,
  `apps/api/src/onboarding/{routes,routes.test,store,store.test}.ts`
- Unchanged production composition:
  `apps/api/src/bootstrap.ts` and `apps/api/src/server.ts` have an empty
  diff versus `main`
- Persistence non-change: `packages/database` is untouched
- Independent local execution on this worktree (Node v24.13.1):
  - `pnpm --config.engine-strict=false --filter @fitness-os/api test`
    → 5 files, 53 tests, pass in 511ms
  - `pnpm --config.engine-strict=false --filter @fitness-os/api exec tsc --noEmit`
    → pass
  - `pnpm --config.engine-strict=false --filter @fitness-os/schemas exec tsc --noEmit`
    → pass
- Independent reproductions against `buildApp` at this head (see HIGH-1,
  HIGH-2, MEDIUM-2)
- CI for the exact head:
  Actions run `32069855395`, job `quality` / check-run `95510367681`,
  `headSha=f0da3691a3d18214fd3e9e90e593b2e762078af7`,
  `conclusion=success`, steps lint / format / typecheck / test / build all
  succeeded

Builder-reported “api: 53 passed” was independently reproduced, not trusted.

## Required review-area outcomes table

| Review area         | Outcome          | Rationale                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product / authority | `FAIL`           | PRD 07 is `APPROVED` / `IN_PROGRESS` and this synthetic Fastify slice is authorized. Shipped `GET /current` silently drops attempts, and the first mutation advertises the frozen operation protocol without enforcing it.                                                                                                       |
| DAG                 | `PASS`           | PRD 07 depends only on completed PRD 02. No PRD 03/21/25 implementation, catalog, or governance engine is opened.                                                                                                                                                                                                                |
| Product Principles  | `FAIL`           | PP-11 is broken by a `utf8-json-sha256.v1` digest that is ordinary `JSON.stringify`. PP-12 is strained by a production-visible injection port. PP-07 holds for this slice: no body/health data, no plaintext secret persistence.                                                                                                 |
| Architecture        | `FAIL`           | Fastify remains the only data plane. TD 007 requires trusted context only from an API-side adapter and forbids a public synthetic login; those hold. The injectable `PlatformOptions.onboarding` seam is the only way to get 200s and has no production rejection.                                                               |
| Contracts           | `FAIL`           | Frozen request/response Zod is mostly consumed. `GET /current` ignores `cursor` and never emits `nextCursor` when more rows exist. Mutation responses claim `operation_committed` + `utf8-json-sha256.v1` without the pinned canonicalizer or token binding. One unauthorized type export was added to the frozen schema module. |
| Identity / sessions | `PASS`           | No public synthetic-login route. Production bootstrap injects no context; every onboarding route is `401 UNAUTHENTICATED`. `OnboardingContext` is typed `synthetic: true`. No cookie, provider SDK, or principal/subject is accepted from the browser.                                                                           |
| Operations          | `FAIL`           | In-memory store and missing PostgreSQL/readiness are authorized limitations. Logger redaction still covers only Authorization headers. `/ready` stays unconditionally ready while a synthetic store is composed.                                                                                                                 |
| Persistence         | `NOT_APPLICABLE` | `packages/database` is untouched. This slice explicitly defers the PRD 07 migration. `NOT_APPLICABLE` is justified for migrations; it is not a pass of the later Data slice.                                                                                                                                                     |
| Security / privacy  | `FAIL`           | No public login, no `claimSecret` echo in tested responses, no-store hook present, dual-role create is denied. Same `RetryToken` can commit two different attempts. SHA-256 verifier is not the specified HMAC. Second-role/same-role both collapse to HTTP 403.                                                                 |
| Failure / recovery  | `FAIL`           | Missing/invalid auth is 401. Unknown/non-issued invitations collapse to `invalid_or_unavailable`. There is no operation ledger, so lost-response recovery cannot replay or mismatch. Current-state cannot page. Self-coach is not evaluated.                                                                                     |
| Tests / CI          | `FAIL`           | Job `quality` is green on `f0da369`. Local 53/53 pass. Required current-state overflow/cursor, same-token mismatch, same-role `mapping_conflict`, unexpected-500 no-store, and create/detail no-store assertions are missing.                                                                                                    |
| Scope / docs        | `FAIL`           | Diff stays inside the authorized API slice except for a type export on the frozen schema module. PR description over-claims stable current-state and operation envelopes relative to actual behavior.                                                                                                                            |

## Findings

### HIGH-1 — `GET /v1/onboarding/current` silently drops attempts and ignores the cursor

- **Severity:** `HIGH`
- **Evidence:**
  - `apps/api/src/onboarding/routes.ts` builds the page as
    `[...store.attempts.values()].filter(principal).map(summarize).slice(0, 4)`
    and always returns `nextCursor: null`.
  - `onboardingCurrentQuerySchema` accepts `cursor`, but `query.data.cursor`
    is never read.
  - Nonterminal filtering via `isNonterminal` is used for the create-attempt
    cap and is not used here. There is no `(created_at, AttemptId)` order;
    Map insertion order is used.
  - Independent reproduction at `f0da369`: seed six attempts for
    `principal-a` (four student + two coach). `GET /v1/onboarding/current`
    returns HTTP 200, `attempts.length === 4`,
    `roles = student:1,student:2,student:3,student:4`, `nextCursor === null`.
    `GET /v1/onboarding/current?cursor=aaaaaaaa` returns the identical first
    page.
  - PRD 07 Attempt identity / current-state read: bounded pages of
    nonterminal attempts ordered by `(created_at, AttemptId)`, opaque
    continuation cursor, no silent choice of “latest.”
  - Frozen `currentOnboardingResponseSchema` includes `nextCursor` precisely
    because one page is at most four summaries.
  - Route tests never seed more than one own attempt and never send a cursor.
- **Impact:** The resume surface this PR claims to implement can hide
  in-scope attempts and tell the client there is no continuation. An
  unmapped synthetic principal may legally hold four student and four coach
  attempts (PRD: separate-role attempts may coexist in the synthetic lane).
  A refresh or new-device read cannot recover the dropped locators.
- **Reproduction:** The six-attempt seed above. Coach attempts 1–2 are
  stored and absent from the body, with no cursor.
- **Resolution condition:** Filter to nonterminal attempts, order
  deterministically, honor a valid cursor, and emit `nextCursor` when more
  rows remain. Invalid cursors must fail closed. Add a test with more than
  four in-scope attempts and a cursor round-trip. Do not report
  `nextCursor: null` while rows were discarded.

### HIGH-2 — `POST /v1/onboarding/attempts` advertises the frozen operation protocol and does not enforce it

- **Severity:** `HIGH`
- **Evidence:**
  - `committedOperation` in `routes.ts` always allocates a new
    `operationId`, always sets `state: 'operation_committed'`, and hashes
    `JSON.stringify({ input, namespace })` while labeling
    `canonicalizationVersion: 'utf8-json-sha256.v1'`.
  - Create-attempt input to that digest is only `{ retry: retryToken }`.
    The verified invitation, purpose, proposed role, and authority scope
    are omitted. Inspect uses `{ claim: 'redacted' }` for every call.
  - There is no operation row, retry-token binding, authority alias, or
    input-mismatch check.
  - Independent reproduction at `f0da369`: one `RetryToken` with secret A
    then the same token with secret B yields two `operation_committed`
    responses, two different `operationId`s, **identical digests**,
    `store.attempts.size === 2`, and no `operation_input_mismatch`.
  - TD 007 pins `utf8-json-sha256.v1` (NFC, UTF-8 bytewise key order) and
    requires the digest to include authority scope, command namespace, and
    the verified invitation/target. Same scoped token + different digest
    must return `operation_input_mismatch` with zero mutation.
  - The PR requires `retryToken` on this route and returns
    `onboardingOperationResponseSchema` as if the protocol had run.
- **Impact:** A confused or hostile retry of the first mutation can create
  a second attempt under the same token. Clients that persist `operationId`
  or compare digests receive fabricated committed operations. Later
  persistence cannot reconstruct a truthful ledger from these envelopes.
- **Reproduction:** The two-secret same-token script above.
- **Resolution condition:** Persist a scoped retry-token binding for
  `create_attempt`. Same token + same canonical input must replay one
  stored result (`operation_replayed`) with the original `operationId`.
  Same token + different invitation/input must return
  `operation_input_mismatch` and create zero attempts. Compute the digest
  with the frozen `utf8-json-sha256.v1` canonicalizer over the required
  semantic fields, not `JSON.stringify({ retry })`. Add those tests.

### MEDIUM-1 — Second-role denial uses HTTP 403, which the approved TD maps to generic unavailable

- **Severity:** `MEDIUM`
- **Evidence:**
  - After a successful issued-invitation lookup, `routes.ts` maps
    `evaluateClaimEligibility(...).status === 'hard_disabled'` to
    `403 FORBIDDEN`.
  - TD 007 Closed result taxonomy: dual-role and self-coach distinctions
    “remain inside the generic unavailable result and are not exposed
    through a more specific status.”
  - Route test `returns 403 when a second role would be acquired` asserts
    this status. The body does not contain `second_role`.
  - Inspect of the same issued invitation already returns purpose and
    proposed role, so 403 is not the only existence channel.
- **Impact:** An authenticated already-mapped caller who skips inspect can
  still distinguish a live issued secret (`403`) from an unknown/expired
  one (`200 invalid_or_unavailable`). That is a narrower oracle than TD
  allowed. Mutation is still denied.
- **Resolution condition:** Either return the generic
  `invalid_or_unavailable` command result for dual-role/self-coach, or
  obtain an explicit coordinated contract/TD amendment that authorizes
  403 for this capability denial and apply it without using invitation
  validity as the 403/200 branch.

### MEDIUM-2 — Already-mapped same-role create returns 403 instead of `mapping_conflict`

- **Severity:** `MEDIUM`
- **Evidence:**
  - Domain `evaluateClaimEligibility` on main treats
    `alreadyMappedRoles.includes(proposedRole)` as
    `{ status: 'hard_disabled', reason: 'second_role' }`.
  - This PR maps every `hard_disabled` to HTTP 403. It never produces
    `outcome: 'mapping_conflict'`.
  - Independent reproduction: mapped `student` + issued student invitation
    → `403 FORBIDDEN`, `store.attempts.size === 0`.
  - PRD 07 failure mode: “Principal already mapped for requested role →
    typed mapping conflict; preserve existing mapping.”
  - Frozen `onboardingCommandResultSchema` includes `mapping_conflict`.
- **Impact:** Same-role remapping and second-role acquisition are
  indistinguishable to the client. The typed conflict the freeze already
  defined is unused on the only mutation this PR ships.
- **Resolution condition:** Distinguish same-role mapping conflict from
  hard-disabled second-role/self-coach. Return the frozen
  `mapping_conflict` result (or the TD-safe generic unavailable, if that
  amendment is chosen) with zero attempt insert. Add a focused test.

### MEDIUM-3 — Self-coach is hardcoded off and never evaluated

- **Severity:** `MEDIUM`
- **Evidence:**
  - `evaluateClaimEligibility({ ..., targetCoachIsSelf: false })` is the
    only call site.
  - `StoredInvitation` has no target-coach or issuer principal field, so
    the route cannot compute self-coach even if it wanted to.
  - PRD/TD require denial of a student claim whose invitation coach maps
    to the same principal, before mutation, in every composition.
- **Impact:** This slice has no claim route, so no self-coach link can be
  written today. The hard-disable is not actually composed. A later claim
  slice that reuses this store shape will not have the data needed to deny
  the path.
- **Resolution condition:** Persist the invitation’s target coach (opaque
  ID is enough) on the synthetic invitation record, compute
  `targetCoachIsSelf` from the injected principal’s coach mapping, and
  deny before insert. If this slice explicitly defers that field, state
  the deferral in the PR and keep claim composition from treating the
  current store as sufficient.

### MEDIUM-4 — Claim-secret verifier is unsalted SHA-256, not `hmac-sha256.v1`

- **Severity:** `MEDIUM`
- **Evidence:**
  - `digestClaimSecret` is `createHash('sha256').update(secret, 'utf8').digest('hex')`.
  - `findInvitationBySecret` compares hex strings with `===` and returns
    on the first match.
  - TD 007 Invitation lifecycle: persist only `hmac-sha256.v1` with an
    environment-bound pepper; compare fixed-length bytes in constant time.
- **Impact:** High-entropy secrets are not practically rainbow-tableable,
  so this is not a practical offline break of the current in-memory store.
  The shipped verifier is still not the frozen mechanism, has no version
  tag, and is not constant-time. Timing of the linear scan can leak
  whether a digest matched.
- **Resolution condition:** Use the versioned HMAC verifier (or a visibly
  synthetic stand-in that still carries a version and constant-time
  compare) and stop treating raw SHA-256 hex as the invitation key.

### MEDIUM-5 — Production composition has no rejection of an injected synthetic onboarding context

- **Severity:** `MEDIUM`
- **Evidence:**
  - `PlatformOptions.onboarding.{resolveContext,store}` is a public
    `buildApp` option. Default `resolveContext` is `() => null`.
  - `bootstrapApi` currently passes only `corsAllowedOrigins` — independently
    confirmed by `bootstrap.test.ts` and an empty bootstrap diff vs `main`.
  - There is no `NODE_ENV` / readiness check that refuses
    `synthetic: true` context or a disposable store.
  - TD: synthetic adapters must fail production startup/readiness if
    configured there. Domain verification plan: “production rejection of
    synthetic identity/policy ports.”
- **Impact:** Production bootstrap as written stays 401. Any future
  compose path that passes `onboarding.resolveContext` in a real
  environment will activate the in-memory slice with no fail-closed
  guard. `/ready` remains `ready` by default.
- **Resolution condition:** Reject synthetic context/store during
  production composition or fail readiness. Keep the test injection
  seam, and add a bootstrap/readiness test that production options do
  not include onboarding context.

### MEDIUM-6 — Frozen schema module was modified without a coordinated freeze

- **Severity:** `MEDIUM`
- **Evidence:**
  - Diff adds `export type ProposedRole = z.infer<typeof proposedRoleSchema>`
    to `packages/schemas/src/onboarding.ts`.
  - `docs/contracts/README.md` is unchanged. No freeze PR accompanies
    this export.
  - Domain already exports a local `ProposedRole` in
    `packages/domain/src/onboarding/claim.ts`. Routes already import
    domain functions and could have used that type or a local alias.
  - Registry rule: a schema-module modification is a contract
    modification and requires Orchestrator authorization.
- **Impact:** Runtime wire schemas are unchanged. The public TypeScript
  surface of a frozen module still moved on an implementation PR.
- **Resolution condition:** Revert the export and use the existing domain
  or local type, or run a coordinated freeze that records the addition.

### MEDIUM-7 — Required mutation/current-state failure tests are missing

- **Severity:** `MEDIUM`
- **Evidence (TD API tests / PRD AC; shipped suite is 13 route tests + 2 store tests):**
  - No current-state test with more than four in-scope attempts or a
    cursor.
  - No same-`RetryToken` / different-secret mismatch test.
  - No already-mapped same-role test.
  - No unexpected-handler-500 + `Cache-Control: no-store` test (the
    `onSend` hook would likely set it; it is unproven).
  - Create-attempt 200 and attempt-detail 200/404 never assert
    `no-store`.
  - No inspect/create test for `claimed` (only `revoked` / `expired`).
  - No extra-field rejection test on the new POST bodies.
- **Impact:** Green CI on `f0da369` does not cover the pagination,
  idempotency, and freshness failures that the approved design requires
  of these exact routes.
- **Resolution condition:** Add the missing provider tests. Keep the
  existing 401-without-context, no-public-login, secret-non-echo,
  second-role denial, and cross-principal 404 tests.

### LOW-1 — Production logger does not redact claim-secret or retry-token body paths

`bootstrap.ts` `LOGGER_OPTIONS.redact.paths` is only
`req.headers.authorization` and `req.headers['proxy-authorization']`.
Default Fastify/pino request logs omit bodies today. Enabling request-body
logging, or a serializer change, would persist plaintext `claimSecret`.
Resolution: add bounded body redaction paths now, and keep secrets out of
error objects.

### LOW-2 — Invitation digest compare is not constant-time

`findInvitationBySecret` uses `===` and exits early. Pair with MEDIUM-4.

### LOW-3 — Seed helpers live on the production store module

`seedInvitation` / `seedIssuedInvitation` are exported from
`apps/api/src/onboarding/store.ts`, which production routes import.
They are unused by `registerOnboardingRoutes`. Move them to a test-only
module.

### LOW-4 — Attempt ordinal is `activeForRole.length + 1`

That collides if a later slice terminalizes a middle attempt and creates
another. Not reachable on this head because only `policy_pending` is
inserted. Use the domain guard’s next ordinal when that exists.

### LOW-5 — `GET /current` 400 and attempt-detail 404 tests omit `no-store`

`sendError` and the `onSend` hook set the header. Assert it.

## Validation performed

- Confirmed exact head `f0da3691a3d18214fd3e9e90e593b2e762078af7` is PR #20
  `head.sha` and the only commit on the branch.
- Confirmed merge-base with `main` is
  `b45bbf06e879069e5eeb5b2677f2ac4ff510e440`.
- Confirmed CI run `32069855395` / check-run `95510367681` (`quality`)
  succeeded on that SHA: lint, format, typecheck, test, build.
- Re-ran API tests (53 passed) and API/schemas typecheck locally.
- Read every changed implementation file, frozen onboarding Zod, domain
  claim/attempt/invitation invariants, `app.ts`, and `bootstrap.ts`.
- Verified `packages/database` and `apps/api/src/bootstrap.ts` /
  `server.ts` are unchanged vs `main`.
- Verified default `buildApp({ logger: false })` returns
  `401 UNAUTHENTICATED` + `Cache-Control: no-store` on
  `GET /v1/onboarding/current`.
- Verified no routes are registered at `/v1/onboarding/login`,
  `/v1/auth/synthetic`, or `/login/synthetic`.
- Verified inspect/create success and unavailable bodies do not contain
  the claim secret in the existing tests, and that the store persists
  only `claimDigest`.
- Verified `mappingIdFor('principal-a', 'student')` is stable and
  differs by role and principal.
- Verified `bootstrapApi` does not pass `onboarding`.
- Independently reproduced HIGH-1, HIGH-2, and MEDIUM-2 against
  `buildApp` at this head.

## Known limitations

- Keyboard, 320 CSS px, and 200% zoom were not executed. No web surface
  is in this diff.
- GitHub Actions log bodies were not fetched; step conclusions and the
  independent local run are the automated evidence of record.
- This review does not certify the later identity-provider, session,
  CSRF, PostgreSQL, claim, or policy-gateway slices.
- Independence disclosure: review used the public GitHub API, the local
  worktree at the exact SHA, and independently executed tests. The
  reviewer did not author the candidate.

## Authorized non-findings

These are **not** `HIGH`:

- In-memory store and the absence of the PRD 07 PostgreSQL migration.
- Absence of resume/abandon/policy-refresh/claim/issue/revoke routes.
- Absence of an identity provider, session cookie, or CSRF proof while
  no credentialed browser session exists.
- Production bootstrap returning 401 on every onboarding route.
- Absence of a public synthetic-login route.
- `LEGAL_PRIVACY_DECISION_REQUIRED` remaining active; this head does
  not present legal copy or collect real user data.
- Second-role create-attempt is denied before insert. Dual-role is not
  enabled. The 403-versus-generic-unavailable mapping is MEDIUM-1, not
  an enablement finding.
- Stable `mappingIdFor` derivation.
- Cross-principal attempt IDs returning the same 404 as a missing ID.
- Unknown/non-issued inspect and create collapsing to
  `invalid_or_unavailable` without echoing the secret or the terminal
  reason.
- `Cache-Control: no-store` on the 401 suite and on
  `GET /v1/onboarding/current` 200 / inspect 200.
- Contracts remaining frozen except for the type export in MEDIUM-6.

## Final disposition

`FAIL`

Autonomous merge is prohibited until HIGH-1 and HIGH-2 are corrected on a
new head, the affected tests/CI are rerun, and Agent 90 re-reviews that
exact SHA. MEDIUM findings must be fixed in the same correction loop or
explicitly deferred with tracking; they are not merge blockers by
themselves.

`PASS` requires 0 `BLOCKER` and 0 `HIGH`. This round has 0 `BLOCKER` and
2 `HIGH`.

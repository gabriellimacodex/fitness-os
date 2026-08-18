# PRD 03 Gate A Package Review — Round 2

## Review identity

| Field                | Value                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Type                 | Independent Agent 90 Gate A package review                                                                   |
| Round                | 2                                                                                                            |
| Repository           | `gabriellimacodex/fitness-os`                                                                                |
| Pull request         | https://github.com/gabriellimacodex/fitness-os/pull/30                                                       |
| Candidate branch     | `feat/prd-03-gate-a-retry`                                                                                   |
| Base branch          | `main` (`b01fbf51304b3777ad4f119c20e841c0ad1d3308` / #29 merged)                                             |
| Exact head SHA       | `f936d032ba7647b41272b03681689831430d1a25`                                                                   |
| Date                 | 2026-08-18                                                                                                   |
| Authority            | PRD 03 Option A wave; capability Gate A evidence package after curation mutations (#29)                      |
| Disposition          | `PASS`                                                                                                       |
| Final recommendation | `PASS` — builder may mark Gate A `PASS` and PRD 03 `COMPLETED` on a follow-up commit to this PR before merge |

The reviewer did not author PR #30, #29, the Gate A record, or the curation
adapter. Builder claims in the PR body and in
`docs/execution/gates/PRD_03_GATE_A.md` were treated as hypotheses and checked
against the exact-head tree, the `origin/main...HEAD` compare, prior Agent 90
lane reviews (#21/#23/#25/#26/#29 and Gate A R1 FAIL on #27), PRD/TD 003
acceptance criteria, and GitHub Actions run `32155647000` for this SHA.

Independence limitation: review ran in the same repository workspace as the
candidate branch checkout. That does not waive any review topic.

## Finding summary table

| Severity  | Open | Deferred (still visible) | Resolved this round |
| --------- | ---: | -----------------------: | ------------------: |
| `BLOCKER` |    0 |                        0 |                   0 |
| `HIGH`    |    0 |                        0 |                   1 |
| `MEDIUM`  |    0 |                        4 |                   1 |
| `LOW`     |    0 |                        4 |                   1 |

`PASS` is allowed: required CI `quality` is green on the exact head, prior
Gate A HIGH-1 is closed by merged mutations (#29) plus Postgres evidence on
this head, and no open `BLOCKER` or `HIGH` remains. Deferred MEDIUM/LOW stay
visible and must not be summarized away.

## Evidence inspected

- PR #30 metadata and single commit
  `f936d032ba7647b41272b03681689831430d1a25`
- Content compare `origin/main...f936d032ba7647b41272b03681689831430d1a25`
  (4 files, +303 / −3):
  `AGENTS.md`,
  `docs/execution/gates/PRD_03_GATE_A.md`,
  `docs/prds/PRD_REGISTRY.md`,
  `packages/database/test/catalog-curation.integration.test.ts`
- Merged precursor `#29`
  (`b01fbf51304b3777ad4f119c20e841c0ad1d3308`) implementing
  `publishExercise` / `setExerciseLifecycle` / `createTaxonomyTerm` /
  `setTaxonomyTermLifecycle` / `replaceTaxonomyTerm` over Option A ledger TX
- Prior Agent 90 records on this lineage:
  - Gate A R1 FAIL (`PRD_03_GATE_A_REVIEW.md`) — HIGH-1 stubs / missing evidence
  - Curation mutations PASS (`PRD_03_CURATION_MUTATIONS_REVIEW.md`) — stubs
    closed; MEDIUM-1 evidence debt left to this Gate A head
  - Option A data, domain, API, ingest lane reviews
- Authority: `docs/prds/003-exercise-knowledge-base.md` (AC1–AC14),
  `docs/technical-design/003-exercise-knowledge-base.md` (Gate A evidence),
  `docs/execution/RELEASE_GATES.md`, `docs/execution/REVIEWER_AGENT.md`
- Persistence surface at head: zero
  `Catalog mutation not implemented in this slice` stubs in
  `packages/database/src/catalog/curation.ts`
- Integration evidence at head:
  - existing Postgres cases for first publish, archive, taxonomy
    create/archive/replace, identical-key replay
  - **new** case publishes revision `2`, returns `stale_revision` for expected
    revision `1` after current is `2`, archives then reactivates exercise
    (`event_kind='reactivated'`), and archives then reactivates taxonomy
    (previous/next lifecycle recorded; `event_kind='created'` under current
    CHECK — documented limitation)
- Gate A package file present with disposition **`PENDING`** (no false PASS /
  `COMPLETED` claim on this commit); registry PRD 03 remains `IN_PROGRESS`
- CI for exact head: Actions run
  [`32155647000`](https://github.com/gabriellimacodex/fitness-os/actions/runs/32155647000),
  job `quality`, `headSha=f936d032ba7647b41272b03681689831430d1a25`,
  `conclusion=success`. Lint, format, typecheck, test, and build succeeded.
  Observed: `@fitness-os/database` **39** tests including
  `catalog-curation.integration.test.ts` **3/3 pass** (was 2/2 on #29).

## Required review-area outcomes table

| Review area                      | Outcome      | Rationale                                                                                                                                                          |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product / authority              | `PASS`       | Authorized Gate A retry after #29 closed stubs. Package correctly leaves disposition `PENDING` / registry `IN_PROGRESS` until this Agent 90 PASS.                  |
| Prior HIGH-1 (ingest-only stubs) | `PASS`       | Closed by #29 implementations + this head’s Postgres rev2 / stale / reactivate evidence. AC3–AC5/AC12 no longer unmet by stubs.                                    |
| Curation mutation evidence debt  | `PASS`       | Prior curation MEDIUM-1 (rev2 / stale / reactivate) closed by new integration test executed in CI on this SHA.                                                     |
| Optional env composition         | `PASS`       | Remains accepted known limitation; bootstrap omits catalog unless composed. Consistent with TD and prior lanes.                                                    |
| CI on package head               | `PASS`       | Required `quality` green on exact SHA `f936d03…` (run `32155647000`).                                                                                              |
| Component lane evidence          | `PASS`       | Prior Agent 90 PASS dispositions for #21 R2 / #23 / #25 / #26 / #29 remain intact for their slices; deferred MEDIUM/LOW stay visible.                              |
| Manifest verification            | `PASS`       | Unchanged on this head; prior ingest lane evidence retained (digest / `789f407` / non-HTTP CLI).                                                                   |
| Architecture / topology          | `PASS`       | No Fastify mutation routes; curation stays in database package; client→Fastify preserved.                                                                          |
| Security / privacy               | `PASS`       | Non-personal catalog; ledger secrets via key ring; no new public mutation surface; PRD 04 perception stop untouched.                                               |
| Scope / docs                     | `PASS`       | Diff is Gate A evidence tests + pending Gate A record + registry/AGENTS sync. No PRD 05/15/authoring UI.                                                           |
| Contracts                        | `CONSISTENT` | `packages/schemas` untouched in this PR.                                                                                                                           |
| Migrations                       | `VALIDATED`  | No new migration; consumes Option A `0001` already on `main`.                                                                                                      |
| Gate A package completeness      | `PASS`       | Evidence package now covers the previously failing curation AC paths. Record SHA/disposition remain placeholders for builder follow-up after this PASS (expected). |

## Focus checklist (requested)

| Focus item                                                         | Result                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Prior FAIL cause (missing curation mutations + evidence) revisited | **Closed** — #29 mutations on base; this PR adds rev2/stale/reactivate Postgres proof |
| `#29` merged full mutations present on integration head            | **Met** — base `b01fbf5`                                                              |
| Rev2 / stale / reactivate integration tests on this head           | **Met** — 3/3 curation integration tests green in CI                                  |
| `docs/execution/gates/PRD_03_GATE_A.md` present and PENDING        | **Met** — no premature PASS/`COMPLETED` on this commit                                |
| CI green on exact head `f936d03…`                                  | **Met** — run `32155647000`                                                           |
| Write `docs/execution/reviews/PRD_03_GATE_A_REVIEW_R2.md`          | **Met** by this record                                                                |
| Do not commit                                                      | **Met**                                                                               |

## Resolved findings

### HIGH-1 (Gate A R1) — Ingest-only curation left AC3–AC5/AC12 unmet — RESOLVED

- **Prior evidence:** persistence threw on publish/lifecycle/taxonomy families;
  Gate A package labeled the gap a “known limitation.”
- **This integrated head:** `#29` implements all five mutation families with
  Option A ledger integrity inside the write TX; this PR adds CI-executed
  Postgres proof for later immutable revision, `stale_revision`, and
  archive→reactivate (exercise + taxonomy).
- **Residual:** taxonomy reactivate `event_kind` mapping remains a documented
  LOW (below); does not reopen HIGH.

### MEDIUM-1 (curation mutations review) — Missing rev2 / stale / reactivate Postgres cases — RESOLVED

- **Prior evidence:** `#29` integration suite covered first publish, archive,
  taxonomy create/archive/replace, and replay only.
- **This head:** new test
  `publishes revision 2, rejects stale expected revision, and reactivates`
  asserts revision `2`, retained revision `1`, `stale_revision` with
  expected `1` / actual `2`, exercise reactivate ledger event, and taxonomy
  reactivate previous/next lifecycle fields.
- **CI:** `catalog-curation.integration.test.ts` **3/3** on run `32155647000`.

### LOW — Registry / AGENTS PRD 21 “blocked” wording (partial) — RESOLVED on this head

- **This PR** updates `AGENTS.md` so PRD 21 is described as in progress on the
  Option A contract-freeze wave, matching registry `IN_PROGRESS`. Residual
  broader registry-wording LOWs from Option A data remain listed below only if
  still separately tracked; the AGENTS blocked-text instance is closed.

## Deferred findings (still visible — not reopened as HIGH)

### MEDIUM — Exact catalog unique-index readiness checks omitted

(from Option A data R2)

### MEDIUM — Concurrent identical `ingestManifest` keys can throw instead of replay

(from catalog ingest review; single-writer deploy assumption)

### MEDIUM — `listExercises` taxonomy filter paginates after in-memory filter

(from catalog ingest review)

### MEDIUM — Cited Agent 90 review markdowns are not durable on this git head

(from Gate A R1 MEDIUM-1, expanded)

- **Evidence:**
  - Gate A record cites `#21` R2 / `#23` / `#25` / `#26` / `#29` Agent 90 PASS
    dispositions and CI run IDs.
  - On exact head `f936d03…` / `origin/main`, `git ls-tree` under
    `docs/execution/reviews/` contains only
    `PRD_03_OPTION_A_DATA_REVIEW.md` (R1 FAIL) among PRD 03 reviews.
  - Workspace has untracked
    `PRD_03_DOMAIN_REVIEW.md`, `PRD_03_CATALOG_API_REVIEW.md`,
    `PRD_03_CATALOG_INGEST_REVIEW.md`, `PRD_03_CURATION_MUTATIONS_REVIEW.md`,
    `PRD_03_GATE_A_REVIEW.md`, and this R2 file; Option A R2 PASS remains only
    on branch `docs/prd-03-option-a-r2-review` (`8023756`).
- **Impact:** Durable visibility of findings/deferrals is incomplete for
  operators reading git history; packaging gap, not a reopened code AC miss.
- **Deferral:** Explicitly deferred with tracking. Does **not** reopen HIGH:
  this round independently re-checked code, tests, and CI on the exact head.
  **Builder follow-up must land the durable review records** (minimum Gate A
  R1+R2; ideally all cited lane reviews + Option A R2) in the same commit that
  flips Gate A / registry, or an immediately preceding docs commit on this PR.

### LOW — Drizzle TS omits deferred `current_revision_id` FK

(from Option A data R2)

### LOW — Catalog route suite still does not assert `Cache-Control: no-store`

(from catalog ingest / API reviews)

### LOW — `runCatalogIngestCli` has no automated tests

(from Gate A R1 LOW-1; still acceptable under library verification coverage)

### LOW — Taxonomy reactivate lifecycle event uses `eventKind: 'created'`

(from curation mutations LOW-1; also listed in Gate A known limitations)

- Schema CHECK allows `created|archived|replaced` only. Previous/next lifecycle
  columns still record archive→active. Acceptable under current migration;
  prefer a forward migration adding `reactivated` later.

## Known limitations — disposition

| Declared limitation                                                              | Agent 90 disposition                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Taxonomy reactivate persists `event_kind='created'` under current CHECK          | **Accepted LOW** — previous/next lifecycle remain correct; documented in Gate A file |
| Optional env catalog composition (bootstrap opt-in)                              | **Accepted** — consistent with TD and prior lanes                                    |
| Does not authorize PRD 05; PRD 04 content publication remains perception-stopped | **Accepted**                                                                         |
| Gate A record SHA/disposition placeholders on this commit                        | **Expected** — builder fills after this PASS on follow-up commit                     |
| Missing durable Agent 90 PRD 03 review markdowns on git head                     | **Deferred MEDIUM** — builder must land them on follow-up; does not reopen HIGH      |

## Correction round

Round 2. Prior Gate A R1 `FAIL` / `CORRECTION_REQUIRED` is cleared for the
capability package on exact head
`f936d032ba7647b41272b03681689831430d1a25`.

## Builder instructions (required before merge)

On a **follow-up commit to PR #30** (do not merge the current PENDING record as
final), the builder must:

1. Set `docs/execution/gates/PRD_03_GATE_A.md` disposition / final verdict to
   **`PASS`**.
2. Fill exact reviewed integration head SHA exactly:
   `f936d032ba7647b41272b03681689831430d1a25`
   (and record CI run `32155647000` / this review path
   `docs/execution/reviews/PRD_03_GATE_A_REVIEW_R2.md`).
3. Set registry PRD 03 state to **`COMPLETED`** in
   `docs/prds/PRD_REGISTRY.md` (and sync `AGENTS.md` / PRD 003 active-stop
   wording so they no longer claim Gate A unavailable / package pending).
4. Commit durable Agent 90 review records into git on this PR (minimum
   `PRD_03_GATE_A_REVIEW.md` + `PRD_03_GATE_A_REVIEW_R2.md`; ideally also the
   cited lane reviews and `PRD_03_OPTION_A_DATA_REVIEW_R2.md`).
5. Keep all deferred MEDIUM/LOW findings listed above visible; do not delete or
   recharacterize them as resolved without evidence.
6. Re-run / confirm required CI green on the follow-up commit head before merge.

This Agent 90 PASS authorizes those builder updates. It does not itself edit
the Gate A record or registry; this review file remains uncommitted until the
builder lands it.

## Final recommendation

**`PASS`** for PR #30 head
`f936d032ba7647b41272b03681689831430d1a25` as the PRD 03 **Gate A package**.

| Question                                        | Answer                                              |
| ----------------------------------------------- | --------------------------------------------------- |
| Gate A package disposition                      | **`PASS`**                                          |
| Builder may mark Gate A `PASS`?                 | **Yes** — on follow-up commit with exact SHA above  |
| Builder may mark PRD 03 `COMPLETED`?            | **Yes** — on the same follow-up commit before merge |
| Optional env composition limitation acceptable? | **Yes**                                             |
| Prior HIGH-1 closed?                            | **Yes**                                             |
| Open `BLOCKER` / `HIGH`?                        | **0 / 0**                                           |
| CI on exact reviewed head                       | **Green** — `32155647000`                           |

Passing Gate A / marking PRD 03 `COMPLETED` does not authorize PRD 05 or PRD 15
and does not waive PRD 04 `HUMAN_PERCEPTION_REQUIRED` for content publication.

# PRD 03 Option A Data Lane Review

## Review identity

| Field                | Value                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Type                 | Independent Agent 90 implementation review                                                               |
| Round                | 1                                                                                                        |
| Repository           | `gabriellimacodex/fitness-os`                                                                            |
| Pull request         | https://github.com/gabriellimacodex/fitness-os/pull/21                                                   |
| Candidate branch     | `feat/prd-03-option-a-keyring`                                                                           |
| Base branch          | `main` (`ca86684` / `ca866842…` at review time)                                                          |
| Exact head SHA       | `24c78fc7d5c8fcaf443a9c3c6dafdff84b6501f0`                                                               |
| Date                 | 2026-08-17                                                                                               |
| Authority            | PRD 03 Option A recorded; Wave 2 Data/migrations lane; binding mechanics in `PRD_03_OPTION_A_KEYRING.md` |
| Disposition          | `FAIL`                                                                                                   |
| Final recommendation | `CORRECTION_REQUIRED`                                                                                    |

The reviewer did not author PR #21, its commits, or the Option A decision
records. Builder claims in the PR body were treated as hypotheses and checked
against the exact-head tree, the full `main...HEAD` compare, source and tests
under `packages/database`, local unit execution, local `prettier --check`, and
GitHub Actions run `32076832479` for this SHA.

This review does **not** treat the absence of domain curation services, public
Fastify exercise routes, production manifest ingestion, or Gate A / `COMPLETED`
as defects. Those remain explicitly out of this data-lane slice. Behavior that
this lane _does_ ship (ledger integrity, readiness, migration, recovery claims)
is still reviewed against Option A and the approved PRD/TD persistence rules.

Independence limitation: review ran in the same repository workspace as the
candidate branch checkout. That does not waive any review topic.

## Finding summary table

| Severity  | Open | Deferred | Resolved this round |
| --------- | ---: | -------: | ------------------: |
| `BLOCKER` |    0 |        0 |                   0 |
| `HIGH`    |    3 |        0 |                   0 |
| `MEDIUM`  |    3 |        0 |                   0 |
| `LOW`     |    2 |        0 |                   0 |

`PASS` is prohibited while any `HIGH` remains open. Autonomous merge is also
prohibited by Gate A (`CI = GREEN`) while the required `quality` job is red on
this SHA.

## Evidence inspected

- PR #21 metadata and commits
  `66b5a42c703251fd2f3f2692b9a1fb234eaabb2c`,
  `24c78fc7d5c8fcaf443a9c3c6dafdff84b6501f0`
- Full compare `main...24c78fc7d5c8fcaf443a9c3c6dafdff84b6501f0`
  (24 files, +3082 / −19)
- Authority at this head:
  `docs/prds/003-exercise-knowledge-base.md`,
  `docs/technical-design/003-exercise-knowledge-base.md`,
  `docs/execution/decisions/PRD_03_OPTION_A.md`,
  `docs/execution/decisions/PRD_03_OPTION_A_KEYRING.md`,
  `docs/execution/blocks/PRD_03_ARCHITECTURE_DECISION_REQUIRED.md`,
  `docs/execution/REVIEWER_AGENT.md`,
  `docs/execution/RELEASE_GATES.md`
- Implementation:
  `packages/database/src/catalog/{ledger-keyring,migration-readiness,operation-ledger,readiness,tables,index}.ts`,
  `packages/database/drizzle/0001_prd03_exercise_catalog.sql`,
  `packages/database/drizzle/meta/{_journal.json,0001_snapshot.json}`,
  `packages/database/evidence/PRD_03_MIGRATION_RECOVERY.md`,
  tests under `packages/database/test/`
- Rejected-candidate non-reuse: SHAs `2198b28…` / `bdd1990…` are not ancestors
  of this head (objects absent from this clone). Current migration `0001`
  content hash `361c4279efca4f309b10ca8a67a42a950f6d30fe8e1be565569bd568b2720c0a`
  differs from the rejected stop-record hash
  `bd65feb65d8148040ef451257aa254fc32bfb9633672bc0099c4e2035c4fe568`.
- Diff scope: only `packages/database/**`, PRD 03 Option A docs/registry, and
  `AGENTS.md`. `apps/**`, `packages/domain`, `packages/schemas` are empty versus
  `main`.
- Local execution (Node `v24.13.1`, `pnpm --config.engine-strict=false`):
  - unit: `ledger-keyring`, `migration-readiness`, `operation-ledger` → 8/8 pass
  - `tsc -p packages/database/tsconfig.typecheck.json --noEmit` → pass
  - `prettier --check .` → fail on `_journal.json` and `0001_snapshot.json`
    (missing final newline)
- Integration: `TEST_DATABASE_URL` unset locally → not executed. CI also skipped
  Test/Typecheck/Build after format failure.
- CI for exact head: Actions run `32076832479`, job `quality`,
  `conclusion=failure`. Lint succeeded. Format failed. Typecheck, test, and
  build were skipped.

## Required review-area outcomes table

| Review area                   | Outcome | Rationale                                                                                                                                                       |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product / authority           | `PASS`  | Authorized Option A data lane from current `main`. No Gate A / completion claim in code.                                                                        |
| Option A secret separation    | `PASS`  | Ledger signing uses `LedgerKeyRing` only; `result_integrity_key_id` persisted; no cursor-secret signing path in catalog code.                                   |
| Option A subset readiness     | `PASS`  | `journalContainsRequiredHashes` is subset presence, not exact journal count. Extra later hashes still ready.                                                    |
| Option A missing-key / parity | `FAIL`  | Active-key check exists; retained cited-`keyId` scan and readiness-wired replica parity do not. Recovery evidence overclaims missing-key readiness.             |
| Ledger integrity mechanics    | `FAIL`  | HMAC binds `JSON.stringify` of `jsonb` payloads without stable canonicalization; PostgreSQL `jsonb` key reorder breaks verify/replay for non-sorted key orders. |
| Migration                     | `PASS`  | Forward-only `0001`; seeds only `modality`/`equipment` dimensions; no exercise fact rows; deferred current-revision FK present in SQL.                          |
| Persistence / schema          | `PASS`  | Catalog tables, constraints, and ledger columns match the data-lane intent; intentional TS/SQL deferred-FK drift is documented.                                 |
| Security / privacy            | `PASS`  | Non-personal catalog data only; secrets are `Buffer` ring material, not DB columns or logs in this slice.                                                       |
| Failure / recovery            | `FAIL`  | Replay path vulnerable to canonicalization drift; concurrent commit race unhandled; recovery doc asserts unreadiness behavior the code does not implement.      |
| Tests / CI                    | `FAIL`  | Local units pass; required CI `quality` is red on this SHA; integration not evidenced on this head.                                                             |
| Scope / docs                  | `PASS`  | Stays in database lane + Option A docs. No public routes or domain completion. Minor registry wording noise only.                                               |

## Focus checklist (requested)

| Focus item                                                               | Result                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Cursor secret never signs `catalog_operation` results; `keyId` persisted | **Met** in schema + `signLedgerResult` / `commitCatalogOperation` |
| Readiness is required-hash subset, not exact journal count               | **Met** in `migration-readiness.ts` / `readiness.ts`              |
| Migration forward-only; seeds only modality/equipment; no exercise facts | **Met**                                                           |
| Scope stays in data lane                                                 | **Met**                                                           |
| CI green on exact head; local DB unit tests; integration if URL set      | **Not met** — CI red; units green; integration unavailable        |

## Open findings

### HIGH-1 — Required CI `quality` is red on the exact reviewed head

- **Evidence:** Actions run `32076832479` / check `quality` → `failure`.
  Step "Check formatting" failed on
  `packages/database/drizzle/meta/_journal.json` and
  `packages/database/drizzle/meta/0001_snapshot.json` (missing trailing newline).
  Typecheck, Test, and Build were skipped.
- **Local reproduction:** `pnpm --config.engine-strict=false format:check` → exit 1
  on the same two files at `24c78fc…`.
- **Impact:** Gate A CI check cannot pass. Release evidence for this head is
  invalid; database integration coverage claimed for CI was not executed on this
  SHA.
- **Resolve when:** A new head has required `quality` green (format, typecheck,
  test, build) for that exact SHA, independently re-verified.

### HIGH-2 — Ledger result HMAC uses non-canonical `JSON.stringify` over `jsonb`

- **Evidence:** `operation-ledger.ts` serializes with `JSON.stringify(resultPayload)`
  for both sign and verify. Committed `result_payload` is PostgreSQL `jsonb`,
  which does not preserve object key order. Independent reproduction:

  ```text
  signed: {"revision":1,"exerciseId":"…","nested":{"b":2,"a":1}}
  db-like sorted: {"exerciseId":"…","nested":{"a":1,"b":2},"revision":1}
  digestMatch: false
  ```

- **Test gap:** `catalog.integration.test.ts` commits
  `{ exerciseId, revision: 1 }`, which is already lexicographically ordered, so
  a passing integration run would not detect the failure mode.
- **Impact:** Violates Option A durable replay integrity and TD 003’s
  deterministic canonical JSON requirement. Identical operation retries can
  return `integrity_failure` after a normal DB round-trip once payloads use
  non-sorted key insertion order.
- **Resolve when:** Signing and verification use a versioned, order-stable
  canonical serializer (aligned with TD 003), covered by a test that permutes
  equivalent key orders through a DB round-trip (or an equivalent jsonb
  normalize step) and still verifies.

### HIGH-3 — Missing-key readiness is incomplete and recovery evidence overclaims

- **Binding requirement:** `PRD_03_OPTION_A_KEYRING.md` states catalog readiness
  is false when a retained committed result cites a `keyId` absent from the ring
  (`missing_ledger_key`), and when replica epoch parity fails.
- **Evidence:** `checkCatalogDatabaseReadiness` only calls `activeLedgerKey`,
  subset journal hashes, and taxonomy seed identity checks. It never reads
  `catalog_operation.result_integrity_key_id`, never returns
  `missing_ledger_key`, and never invokes `replicasShareEpoch`.
- **Doc conflict:** `evidence/PRD_03_MIGRATION_RECOVERY.md` claims a historical
  cited `keyId` keeps readiness false via `missing_ledger_key`. That behavior
  is not implemented.
- **Impact:** Option A’s named recovery/readiness invariant is unmet in the
  shipped readiness path; operators following recovery evidence get a false
  sense of protection after historical key loss.
- **Resolve when:** Readiness scans retained ledger rows for cited `keyId`s,
  fails closed with `missing_ledger_key` when any are absent, has tests for that
  path, and either wires replica epoch parity into readiness or documents a
  tracked deferral that does not contradict the binding KEYRING text / recovery
  evidence.

### MEDIUM-1 — Concurrent `commitCatalogOperation` has check-then-insert race

- **Evidence:** `resolveCatalogOperation` then `insert` without handling unique
  violation on `catalog_operation_operation_key_unique`.
- **Impact:** Two concurrent identical commits can surface a raw DB error instead
  of deterministic `replayed` / `operation_input_mismatch`.
- **Resolve when:** Unique conflicts re-enter resolve/replay (or equivalent
  transactional serialization) with tests.

### MEDIUM-2 — Replica epoch parity is not part of readiness

- **Evidence:** `replicasShareEpoch` / `ledgerKeyRingEpoch` exist and are unit
  tested, but `checkCatalogDatabaseReadiness` never consumes them.
- **Impact:** Binding KEYRING lists replica epoch parity as a readiness-false
  condition; multi-replica drift would still report ready.
- **Resolve when:** Readiness accepts configured replica epoch digests (or an
  explicit single-replica mode is recorded as deferred without contradicting
  KEYRING/recovery docs).

### MEDIUM-3 — Exact catalog object checks omitted for existing unique indexes

- **Evidence:** Option A / KEYRING keep exact checks for catalog functions,
  triggers, unique indexes, and seed identities once objects exist. Seeds are
  checked; unique indexes created by `0001` are not asserted by readiness.
  Functions/triggers are absent (N/A).
- **Impact:** Accidental index drop or partial migrate leave readiness green.
- **Resolve when:** Readiness verifies the required unique indexes (and any
  future functions/triggers) or an explicit tracked deferral is recorded.

### LOW-1 — Drizzle table TypeScript omits the deferred `current_revision_id` FK

- **Evidence:** SQL adds
  `exercise_current_revision_id_exercise_revision_id_fk … DEFERRABLE INITIALLY DEFERRED`;
  `tables.ts` leaves `currentRevisionId` without that FK. Recovery evidence
  calls this intentional.
- **Impact:** Bounded `db:generate` drift risk; documented, not a runtime hole
  after migrate.
- **May defer** with the existing recovery note kept accurate.

### LOW-2 — Registry wording still frames PRD 21 as waiting on this Option A

- **Evidence:** `PRD_REGISTRY.md` authorization blurb mixes PRD 21 blocked text
  with PRD 03 Option A resume language.
- **Impact:** Operator confusion only; does not expand scope.
- **May defer** to a docs cleanup.

## Resolved findings this round

None. Round 1.

## Known limitations / unavailable evidence

- Local `TEST_DATABASE_URL` was unset; catalog integration tests were not run
  in this review environment.
- CI did not run Test/Typecheck/Build on `24c78fc…` because format failed first.
- Rejected candidate objects `2198b28…` / `bdd1990…` are absent from the clone;
  non-reuse is inferred from ancestry failure plus distinct `0001` content hash,
  not from a full tree diff against those commits.

## Merge recommendation

**Do not merge.** Disposition `FAIL` / `CORRECTION_REQUIRED`.

Option A’s core separations that motivated the stop (cursor secret ≠ ledger
HMAC; subset journal readiness; new wave from `main`; dimension-only seeds;
data-lane scope) are largely present and are **not** a revival of the rejected
`2198b28` / `bdd1990` architecture. However, three open `HIGH` findings block
autonomous merge: red CI on the exact head, non-canonical ledger result
integrity over `jsonb`, and incomplete missing-key readiness versus the binding
KEYRING / recovery evidence.

Gate A autonomous-merge preconditions `CI = GREEN` and `HIGH = 0` are not met.

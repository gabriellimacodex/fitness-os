# PRD 03 Option A Data Lane Review — Round 2

## Review identity

| Field                 | Value                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Type                  | Independent Agent 90 implementation review                                                               |
| Round                 | 2                                                                                                        |
| Repository            | `gabriellimacodex/fitness-os`                                                                            |
| Pull request          | https://github.com/gabriellimacodex/fitness-os/pull/21                                                   |
| Candidate branch      | `feat/prd-03-option-a-keyring`                                                                           |
| Base branch           | `main` (`ca86684` / `ca866845e5eba71a7bff618b4079faa2b165ba2c`)                                          |
| Previous reviewed SHA | `24c78fc7d5c8fcaf443a9c3c6dafdff84b6501f0`                                                               |
| Exact head SHA        | `bbe81c17558cf7922650e1ac55a448080266248c`                                                               |
| Date                  | 2026-08-17                                                                                               |
| Authority             | PRD 03 Option A recorded; Wave 2 Data/migrations lane; binding mechanics in `PRD_03_OPTION_A_KEYRING.md` |
| Disposition           | `PASS`                                                                                                   |
| Final recommendation  | `MERGE_ALLOWED` (Gate A autonomous merge with MEDIUM-3 / LOW deferred)                                   |

The reviewer did not author PR #21, the R1 correction commit `bbe81c1`, or the
builder handoff. Builder claims were treated as hypotheses and checked against
the exact-head tree, the `24c78fc…bbe81c1` correction diff, the complete
`main...HEAD` compare, local database unit tests, local `format:check`, and
GitHub Actions run `32077532960` for this SHA.

This review does **not** treat the absence of domain curation services, public
Fastify exercise routes, production manifest ingestion, or Gate A / `COMPLETED`
as defects. Those remain out of this data-lane slice.

Independence limitation: review ran in the same repository workspace as the
candidate branch checkout. That does not waive any review topic.

## Finding summary table

| Severity  | Open | Deferred | Resolved this round |
| --------- | ---: | -------: | ------------------: |
| `BLOCKER` |    0 |        0 |                   0 |
| `HIGH`    |    0 |        0 |                   3 |
| `MEDIUM`  |    0 |        1 |                   2 |
| `LOW`     |    0 |        2 |                   0 |

`HIGH = 0` and required CI `quality` is green on the exact head. Open `MEDIUM`
remaining from R1 is explicitly deferred below with rationale. Open `LOW`
findings are deferred with rationale.

## Evidence inspected

- PR #21 metadata; commits `66b5a42…`, `24c78fc…`, `bbe81c1…`
- Correction range `24c78fc…bbe81c1` (11 files, +487 / −134): drizzle meta
  formatting, `canonical-json.ts`, ledger commit/store canonicalization,
  readiness cited-`keyId` scan + optional replica epochs, KEYRING wording,
  conflict re-resolve, unit + integration test updates, R1 review record
- Full compare `main...bbe81c1` remains database lane + Option A docs/registry
- Authority at this head: PRD/TD 003, `PRD_03_OPTION_A.md`,
  `PRD_03_OPTION_A_KEYRING.md` (replica wording updated), recovery evidence,
  R1 record `PRD_03_OPTION_A_DATA_REVIEW.md`
- Local execution (Node `v24.13.1`, `pnpm --config.engine-strict=false`):
  - `format:check` → pass (trailing newlines on `_journal.json` /
    `0001_snapshot.json` present)
  - `@fitness-os/database` vitest → 13 passed / 22 skipped (integration skipped:
    `TEST_DATABASE_URL` unset locally)
  - `tsc -p packages/database/tsconfig.typecheck.json --noEmit` → pass
- CI for exact head: Actions run
  [`32077532960`](https://github.com/gabriellimacodex/fitness-os/actions/runs/32077532960),
  job `quality`, `headSha=bbe81c17558cf7922650e1ac55a448080266248c`,
  `conclusion=success`. Lint, Check formatting, Typecheck, Test, Build all
  success. CI `TEST_DATABASE_URL` set; `catalog.integration.test.ts` **5/5
  passed** (includes unsorted-key payload commit and `missing_ledger_key`
  readiness case).

## Required review-area outcomes table

| Review area                   | Outcome | Rationale                                                                                                                                    |
| ----------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Product / authority           | `PASS`  | Authorized Option A data lane from current `main`. No Gate A / completion claim in code.                                                     |
| Option A secret separation    | `PASS`  | Ledger signing remains on `LedgerKeyRing` only; `result_integrity_key_id` persisted; no cursor-secret signing path.                          |
| Option A subset readiness     | `PASS`  | Required-hash subset unchanged; extra later hashes still ready.                                                                              |
| Option A missing-key / parity | `PASS`  | Cited-`keyId` scan returns `missing_ledger_key`; optional `replicaEpochs`; KEYRING documents single-replica omit; recovery evidence matches. |
| Ledger integrity mechanics    | `PASS`  | Order-stable `canonicalizeLedgerJson` (NFC + sorted keys); store canonical object; unit + CI integration cover key-order equivalence.        |
| Migration                     | `PASS`  | Forward-only `0001`; dimension-only seeds; no exercise facts.                                                                                |
| Persistence / schema          | `PASS`  | Catalog tables/constraints/ledger columns match data-lane intent; deferred FK TS drift remains documented LOW.                               |
| Security / privacy            | `PASS`  | Non-personal catalog data; secrets remain ring `Buffer` material.                                                                            |
| Failure / recovery            | `PASS`  | Canonicalization drift closed; unique-key conflict re-resolves; missing-key readiness implemented.                                           |
| Tests / CI                    | `PASS`  | Local units + format green; CI quality green on exact SHA including catalog integration.                                                     |
| Scope / docs                  | `PASS`  | Stays in database lane + Option A docs. Registry wording noise remains deferred LOW.                                                         |

## Focus checklist (requested)

| Focus item                                                               | Result                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Cursor secret never signs `catalog_operation` results; `keyId` persisted | **Met**                                                        |
| Readiness is required-hash subset, not exact journal count               | **Met**                                                        |
| Migration forward-only; seeds only modality/equipment; no exercise facts | **Met**                                                        |
| Scope stays in data lane                                                 | **Met**                                                        |
| CI green on exact head; local DB unit tests; integration if URL set      | **Met** — CI green; local units green; integration via CI only |

## HIGH closure verification (R1 → R2)

### HIGH-1 — Required CI `quality` red (prettier) — **RESOLVED**

- Local: `pnpm --config.engine-strict=false format:check` → exit 0.
- Files `_journal.json` / `0001_snapshot.json` end with newline.
- CI run `32077532960` step "Check formatting" success; full `quality`
  success on `bbe81c1…`.

### HIGH-2 — Non-canonical `JSON.stringify` over `jsonb` — **RESOLVED**

- New `packages/database/src/catalog/canonical-json.ts` sorts object keys and
  NFC-normalizes strings before `JSON.stringify`.
- `commitCatalogOperation` / `resolveCatalogOperation` sign and verify via
  `canonicalizeLedgerJson`; insert stores `JSON.parse(canonicalResult)` so
  jsonb round-trips match the digest.
- Unit: key-order permutation verify passes locally.
- CI integration: unsorted nested payload commit path exercised in
  `catalog.integration.test.ts` (5/5 green).

### HIGH-3 — Missing-key readiness incomplete / recovery overclaim — **RESOLVED**

- `checkCatalogDatabaseReadiness` scans distinct
  `catalog_operation.result_integrity_key_id` and returns
  `missing_ledger_key` when absent from the ring.
- Optional `replicaEpochs` wired; KEYRING updated so single-replica
  compositions omit peer epochs while still enforcing active + cited keys.
- Recovery evidence (`PRD_03_MIGRATION_RECOVERY.md`) now matches code.
- CI integration asserts readiness false with `missing_ledger_key` when the
  retained cite is absent.

## Resolved findings this round

| ID       | Title                                      | Notes                                                                                                                                                                                                                                |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HIGH-1   | CI quality red (prettier)                  | Format + full quality green on `bbe81c1`                                                                                                                                                                                             |
| HIGH-2   | Ledger HMAC non-canonical JSON             | Canonical serializer + store + tests                                                                                                                                                                                                 |
| HIGH-3   | Missing-key readiness / recovery overclaim | Cited-key scan + KEYRING single-replica wording                                                                                                                                                                                      |
| MEDIUM-1 | Concurrent commit check-then-insert race   | Unique `23505` re-enters `resolveCatalogOperation` (`constraint_name` matches existing postgres.js pattern). Dedicated concurrency stress test still absent — residual coverage gap, not a reopen of the unhandled raw-error defect. |
| MEDIUM-2 | Replica epoch parity not part of readiness | Optional `replicaEpochs` + binding KEYRING deferral for single-replica                                                                                                                                                               |

## Deferred findings (explicit)

### MEDIUM-3 — Exact catalog unique-index checks omitted — **DEFERRED**

- **Evidence:** Readiness still does not assert the unique indexes created by
  `0001`; seeds and journal hashes are checked.
- **Rationale for deferral:** Does not reopen Option A secret separation,
  subset readiness, missing-key scan, or ledger canonicalization. Risk is
  accidental index drop / partial migrate reporting ready. Track in a follow-up
  data-lane hardening slice before Gate B / multi-replica production ops.
- **Resolve when:** Readiness verifies required unique indexes (and any future
  functions/triggers) or a longer-lived tracked deferral is accepted at Gate B.

### LOW-1 — Drizzle TS omits deferred `current_revision_id` FK — **DEFERRED**

- Documented intentional drift in recovery evidence; runtime FK remains in SQL.
- Acceptable for this data-lane merge; revisit on next `db:generate`.

### LOW-2 — Registry wording mixes PRD 21 blocked text — **DEFERRED**

- Operator-docs noise only; no scope expansion. Cleanup with registry pass.

## Known limitations / unavailable evidence

- Local `TEST_DATABASE_URL` unset; catalog/migration/repository integration
  suites were not executed in this review environment. CI ran them on the
  exact head with Postgres service and reported green, including the two
  HIGH-2/HIGH-3 integration cases added in `bbe81c1`.
- Concurrent commit race is handled in code but not load-tested under parallel
  clients in this round.

## Merge recommendation

**PASS / MERGE_ALLOWED** for Gate A autonomous merge of PR #21 at
`bbe81c17558cf7922650e1ac55a448080266248c`.

Preconditions met: `CI = GREEN`, `BLOCKER = 0`, `HIGH = 0`. Remaining
`MEDIUM-3` and `LOW-1`/`LOW-2` are explicitly deferred with rationale and remain
visible. This does **not** authorize Gate B, production ingestion, or PRD 03
completion.

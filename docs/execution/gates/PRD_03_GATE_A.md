# PRD 03 — Gate A Record

- Capability: Exercise Knowledge Base
- Record type: Gate A completion evidence
- Exact reviewed head: _set to this PR head before merge_
- Pull requests: `#21` Option A data, `#23` domain, `#25` read API, `#26`
  reader/ingest/verifier, `#27` ingest CLI + platform helper, `#29` curation
  mutations, plus this Gate A package PR
- Final independent reviewer: Agent 90
- Disposition: `PENDING` until Agent 90 PASS on this package head
- Record timestamp: `2026-08-18`

## Disposition

| Area                  | Result       |
| --------------------- | ------------ |
| CI on component heads | `PASS`       |
| Tests                 | `PASS`       |
| Architecture          | `PASS`       |
| Security / privacy    | `PASS`       |
| Scope                 | `PASS`       |
| Contracts             | `CONSISTENT` |
| Migrations            | `VALIDATED`  |
| Option A ledger       | `PASS`       |
| Manifest verification | `PASS`       |
| Curation mutations    | `PASS`       |
| Open `BLOCKER`        | `0`          |
| Open `HIGH`           | `0`          |
| Gate A package review | `PENDING`    |

## Verification evidence

- `#21` Agent 90 R2 PASS / CI `32077532960`
- `#23` Agent 90 PASS / CI `32139766891`
- `#25` Agent 90 PASS / CI `32144736416`
- `#26` Agent 90 PASS / CI `32147094300`
- `#29` Agent 90 PASS / CI `32152669376` (pre-rebase) and `32153200554` (rebased)
- Migration `0001_prd03_exercise_catalog.sql`; ledger `result_integrity_key_id`;
  subset journal readiness
- Manifest digest
  `eb2c64954a47b83bc46a2a191f218c12dcf5069486728bc225e760aed4f988da`;
  sourceCommit `789f407`
- Integration coverage includes ingest replay, publish revision 2, stale
  revision conflict, archive/reactivate

## Known limitations

- Taxonomy reactivate persists `event_kind='created'` because migration CHECK
  omits `reactivated`; previous/next lifecycle fields still record the
  transition.
- Default API bootstrap omits catalog DB composition unless
  `CATALOG_DATABASE_URL` + ledger env are set via `createCatalogPlatformFromEnv`.
- Does not authorize PRD 05; PRD 04 content publication remains
  `HUMAN_PERCEPTION_REQUIRED`.
- Zero known BLOCKER/HIGH ≠ absence of future defects.

## Out of scope confirmed

- No PRD 04/05/15 product expansion
- No public authoring UI
- Rejected DB candidates not patched

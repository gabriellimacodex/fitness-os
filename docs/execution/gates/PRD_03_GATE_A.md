# PRD 03 — Gate A Record

- Capability: Exercise Knowledge Base
- Record type: Gate A completion evidence
- Exact reviewed integration head: _filled at merge_
- Pull requests: `#21` (Option A data), `#23` (domain), `#25` (read API), `#26` (reader/ingest/verifier)
- Final independent reviewer: Agent 90 (per-PR PASS; Gate A confirmation on this record’s PR)
- Disposition: `PENDING` until Agent 90 confirms this Gate A package on its PR head
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
| Open `BLOCKER`        | `0`          |
| Open `HIGH`           | `0`          |
| Gate A package review | `PENDING`    |

## Verification evidence

- Option A data lane `#21` / Agent 90 R2 PASS (`bbe81c1`); CI `32077532960`.
- Domain core `#23` / Agent 90 PASS (`925d32f`); CI `32139766891`.
- Catalog read API `#25` / Agent 90 PASS (`fdd6cf4`); CI `32144736416`.
- Reader + ingest + verifier `#26` / Agent 90 PASS (`83238a2`); CI `32147094300`.
- Migration `0001_prd03_exercise_catalog.sql` seeds only modality/equipment;
  `catalog_operation` persists `result_integrity_key_id` (ledger ring, not cursor
  secret); readiness uses required-hash **subset**.
- Production manifest `catalog/catalog-manifest.v1.json` with review bound to
  sourceCommit `789f407` (Agent 90-reviewed domain merge introducing the
  artifact); digest
  `eb2c64954a47b83bc46a2a191f218c12dcf5069486728bc225e760aed4f988da`.
- `@fitness-os/catalog-ingest` verifies ancestry/cleanliness/digest and is not
  registered on the public Fastify surface.
- PostgreSQL integration evidence executed in CI via `TEST_DATABASE_URL`.

## Known limitations

- Remaining curation mutations beyond `ingestManifest` are not implemented in
  this Gate A package (publish/lifecycle/replace remain deployment-follow-ons).
- Default API bootstrap does not open a catalog database unless explicitly
  composed with `PlatformOptions.exerciseCatalog` / readiness; empty composition
  omits routes until a reader is injected.
- Passing gates establish zero known BLOCKER/HIGH on reviewed heads; they do
  not guarantee absence of future defects.
- Does not authorize PRD 05 or waive PRD 04 `HUMAN_PERCEPTION_REQUIRED` for
  movement content publication.

## Out of scope confirmed

- No PRD 04 movement guidance, PRD 05 training behavior, or PRD 15 appraisal.
- No public authoring UI.
- Rejected database candidates were not patched.

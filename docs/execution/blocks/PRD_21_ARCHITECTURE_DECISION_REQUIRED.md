# PRD 21 — Architecture Decision Required

- Status: `ACTIVE`
- Recorded: 2026-08-17
- Stop condition: `ARCHITECTURE_DECISION_REQUIRED`
- Affected path: PRD 21 and every dependency path that requires PRD 21
- Independent review target: `df76f91c1f73f12031eaacfa9da9af38d1b39670`
- Review disposition: `FAIL — B0 / H2 / M0 / L0`
- Independent production stop: `LEGAL_PRIVACY_DECISION_REQUIRED`

## Why autonomous correction stopped

The PRD 21 schema-contract lane completed three meaningful correction rounds.
The third exact-head independent review still found two architectural HIGH
findings across canonical idempotency and durable lifecycle proof. The
Autonomous Delivery Charter therefore prohibits another autonomous patch
round. No schema freeze, Gate A PASS, merge, completion transition, real-data
processing, or production activation is permitted until an authorized
architecture decision is recorded.

## Unresolved conflicts

### Canonicalization profiles do not cover every semantic set

The corrected contract replaced caller-supplied canonicalization options with
a closed profile selected by semantic input kind. However, the
`retention_preview` profile declares no set-like paths while its real processor
input accepts `approvedExceptionIds`. The same approved exception identifiers
in a different order therefore produce different canonical bytes and digests.

This conflicts with the Technical Design guarantee that equivalent semantic
inputs replay the committed result. Under the reviewed contract, an equivalent
retention preview can instead report an idempotency conflict solely because a
set was permuted.

### Partial lifecycle results cannot carry the proof required by replay

The operation ledger requires a non-null `proofId` for `completed` and
`partially_failed` governance lifecycle outcomes. The public
`governanceLifecycleResultSchema` requires that locator only for `completed`;
its strict `partially_failed` variant both accepts the outcome without proof and
rejects the same outcome when a `proofId` is supplied.

This makes the public executor contract inconsistent with durable ledger and
reconciliation requirements. A partial destructive operation can be reported
without the minimal proof locator that its committed replay requires.

## Evidence preserved

- Reviewed correction SHA: `df76f91c1f73f12031eaacfa9da9af38d1b39670`.
- Base correction SHA: `b84465adf99f5fa4a2885018970a929bb582b0c3`.
- Node.js 24.18.0 and pnpm 10.24.0.
- Full workspace check: passed with 119 tests; 17 PostgreSQL integration tests
  were skipped because no test database was configured for this schema-only
  change.
- Workspace build, `git diff --check`, scoped secret scan, inventory ownership,
  request-transition matrix, exact operation identity, production synthetic
  rejection, readiness, and processor scope checks passed.
- No independent PASS record was created, and no PRD 21 schema-contract commit
  was pushed or merged.

## Decision options

### Option A — Exhaustive versioned canonical profiles and one proof locator (recommended)

Make the canonical profile registry exhaustive over every operation kind and
define all semantic-set paths beside the typed operation contract. Persist the
profile version and operation kind already required for deterministic replay;
add `/approvedExceptionIds` to `retention_preview` and require real-input
permutation tests for every declared set.

Use one durable lifecycle proof locator for every positive or partially
successful destructive outcome. Require `proofId` in both the public result and
ledger for `completed` and `partially_failed`; require it to be absent for
denied outcomes. Reconciliation and replay consume the same locator.

Tradeoff: smallest coherent contract surface. It keeps one replay rule and one
proof identity across public execution, persistence, audit, and recovery.

### Option B — Typed canonical normalizers and distinct partial-progress proof

Replace path-based profiles with a typed normalizer for each operation kind,
then hash only the normalized parsed DTO. Introduce a distinct
`partialProgressProofId` and proof type for partial lifecycle outcomes, with an
explicit mapping into ledger, audit, and reconciliation records.

Tradeoff: stronger type-local semantics and a more expressive partial-progress
model, but a larger contract, migration, consumer, provider, and review surface.

### Option C — Treat exception order as semantic and partial proof as optional (not recommended)

Declare `approvedExceptionIds` order-sensitive and weaken ledger requirements
so partial lifecycle outcomes may omit proof.

Tradeoff: smallest edit, but it lowers existing idempotency and durable-proof
acceptance criteria. It is not recommended and cannot be selected under
standing authority without explicit re-authorization of those criteria.

## Recommended decision and impact

Approve Option A. It resolves both findings without weakening the reviewed
replay or proof model and keeps reconstruction deterministic from persisted
operation kind plus canonicalization version.

Until a decision is explicitly recorded:

- PRD 21 remains `BLOCKED` and cannot receive a schema freeze, Gate A PASS, or
  `COMPLETED` transition;
- PRDs 08, 14, 23, and 24 cannot begin or complete paths that require PRD 21;
- PRD 07 may continue only in its separately authorized synthetic,
  policy-reference-only lane because PRD 02 is its sole registry dependency;
- `LEGAL_PRIVACY_DECISION_REQUIRED` remains independently active for all real
  data and production policy paths; and
- PRD 25 remains outside authorized scope.

The minimum human determination required is selection of Option A, Option B,
or another explicitly specified architecture that makes canonical replay and
partial lifecycle proof coherent without weakening PRD 21 acceptance criteria.

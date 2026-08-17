# PRD 03 — Architecture Decision Required

- Status: `DECISION_RECORDED`
- Recorded: 2026-08-17
- Decision recorded: 2026-08-17
- Selected option: `A`
- Decision record: [PRD 03 Option A](../decisions/PRD_03_OPTION_A.md)
- Stop condition: `ARCHITECTURE_DECISION_REQUIRED`
- Affected path: PRD 03 and every dependency path that requires PRD 03
- Independent review target: `2198b28c1785093751b970ee666d96a2843fc6d2`
- Review disposition: `FAIL — B0 / H2 / M0 / L0`

## Why autonomous correction stopped

The PRD 03 database lane completed three meaningful correction rounds and the
next independent review still found two architectural HIGH findings. The
Autonomous Delivery Charter therefore prohibits another autonomous patch round.
No Gate A PASS, merge, completion transition, or production ingestion was
permitted until an authorized architecture decision was recorded. Option A is
now recorded; implementation has not resumed.

## Unresolved conflicts

### Durable replay integrity uses the cursor secret

The database adapter signs durable `catalog_operation.result` values with the
same `cursorSecret` used for presentation-layer pagination cursors. Committed
rows do not carry a key identifier and the runtime has no historical
verification key ring. Normal cursor-key rotation, or replicas configured with
different cursor secrets, consequently makes prior committed operations fail
replay as an invalid ledger result.

This conflicts with the PRD 03 guarantee that an identical operation key and
canonical input digest return the original committed result without repeating a
side effect. Freezing one cursor secret forever would avoid the immediate error
but would couple unrelated security lifecycles and leave rotation/recovery
undefined.

### Readiness rejects every future migration

Catalog readiness currently requires the Drizzle journal to contain exactly two
rows. A valid later additive or forward-fix migration makes the row count three
and reports `not_ready`, even when both required PRD 03 migration hashes and all
required catalog objects remain valid.

This conflicts with the Technical Design's forward-only recovery model and
required-migration availability. It also makes the readiness implementation
incompatible with the next legitimate migration by construction.

## Evidence preserved

- PostgreSQL 17 serial database suite: 7 files, 61 tests passed.
- Database typecheck, package build, Drizzle schema check, and
  `git diff --check`: passed under Node.js 24.18.0.
- Migration hashes:
  - `0000`: `f2778aeb7dcee34b553d500817a9b9c1317a420d3f2e997c30b429d685c06c15`
  - `0001`: `bd65feb65d8148040ef451257aa254fc32bfb9633672bc0099c4e2035c4fe568`
- The isolated integrated candidate `bdd1990399644ce447c948b94d4f5ed38ea372ed`
  passed the non-live-database workspace check and 69 catalog-ingestion tests,
  but it is not approved because its database provider failed independent
  architecture review.
- No independent PASS record was created and no affected commit was merged or
  pushed as a qualifying PRD 03 result.

## Decision options

### Option A — Versioned ledger key ring (recommended)

Separate cursor signing from durable operation-result integrity. Introduce a
dedicated ledger-integrity key ring with an active key ID, persist that key ID
with every committed result, and retain the bounded historical verification
keys required by the ledger retention policy. Define replica parity, rotation,
recovery, missing-key readiness, and secret-management behavior explicitly.

Change readiness to prove that every required migration hash is present as a
subset, while permitting later journal entries. Keep the existing exact checks
for catalog functions, triggers, unique indexes, and seed identities, and add a
catalog schema/version marker if the accepted design requires one.

Tradeoff: adds explicit key lifecycle and configuration, plus one migration
shape change while PRD 03 migration `0001` is still unapplied. It preserves the
strongest replay-tamper boundary and forward migration model.

### Option B — PostgreSQL-rooted replay proof

Remove the application HMAC and redesign replay validity around immutable,
reciprocal PostgreSQL facts for every positive and negative result family.
Negative results such as stale revision and conflict would need durable,
operation-bound witnesses that remain historically meaningful without relying
on current aggregate state.

Use the same forward-compatible required-migration subset rule or an explicit
catalog schema marker for readiness.

Tradeoff: avoids a durable application key lifecycle, but materially expands
the schema, trigger, witness, and proof surface and requires a new threat-model
review. A public checksum alone is not an acceptable substitute because prior
red-team evidence showed that a false result can be recomputed and inserted.

### Option C — Declare the cursor secret permanent (not recommended)

Formally prohibit rotation and require one identical secret across all replicas
and recovery environments, then correct only the migration readiness rule.

Tradeoff: smallest code delta, but operationally fragile. Loss, divergence, or
necessary rotation of an unrelated cursor secret invalidates durable replay.
This option is not recommended for the Pilot Release Candidate.

## Recommended decision and impact

Approve Option A. It most directly preserves the reviewed anti-tamper intent,
decouples presentation and durable-data lifecycles, supports controlled key
rotation, and makes forward-fix migrations possible without weakening existing
database invariants.

The founder recorded Option A on 2026-08-17. The architecture stop is
satisfied for the two findings above. Implementation has not resumed.

- PRD 03 remains `BLOCKED` until an Option A implementation wave starts from
  current `main`;
- a fourth autonomous correction of the failed candidate is still prohibited;
- Gate A PASS and `COMPLETED` remain unavailable;
- PRD 05 and PRD 15 cannot begin because they depend on PRD 03, and their
  downstream path to PRD 24 remains blocked;
- PRD 04, PRD 07, and recorded PRD 21 Option A work are not architecturally
  invalidated, but they do not authorize bypassing PRD 03; and
- PRD 25 remains outside authorized scope.

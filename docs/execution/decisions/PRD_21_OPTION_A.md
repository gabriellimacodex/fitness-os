# PRD 21 — Recorded Architecture Decision

- Status: `RECORDED`
- Decision date: 2026-08-17
- Decision maker: Founder
- Selected option: `A` — exhaustive versioned canonical profiles and one proof locator
- Source stop: [PRD 21 Architecture Decision Required](../blocks/PRD_21_ARCHITECTURE_DECISION_REQUIRED.md)
- Implementation: not resumed
- Independent remaining stop: `LEGAL_PRIVACY_DECISION_REQUIRED`

## Decision

The founder selected Option A from the recorded stop. The canonical profile
registry must be exhaustive over every operation kind, including every
semantic-set path beside the typed operation contract. Every positive or
partially successful destructive lifecycle outcome must carry one durable
`proofId` in both the public result and the ledger.

This recording satisfies `ARCHITECTURE_DECISION_REQUIRED` for the two findings
named in the stop. It does not approve the failed schema-contract candidate, a
schema freeze, Gate A, a fourth autonomous correction round, real-data
processing, production policy activation, or PRD 21 completion.

## Binding constraints

- Persist the profile version and operation kind required for deterministic
  replay.
- Add `/approvedExceptionIds` to the `retention_preview` profile and require
  real-input permutation tests for every declared set.
- Require `proofId` on `completed` and `partially_failed` public results and
  ledger records.
- Require `proofId` to be absent on denied outcomes.
- Reconciliation and replay consume that same locator.
- Resume only in a new isolated implementation wave that starts from current
  `main` and applies Option A. Do not patch the rejected schema-contract
  candidate (`df76f91c1f73f12031eaacfa9da9af38d1b39670`).

## Explicitly rejected

- Option B — typed canonical normalizers plus a distinct partial-progress proof.
- Option C — treating exception order as semantic and making partial proof
  optional. That option weakens accepted criteria and remains unauthorized.

## Remaining blocks

- PRD 21 remains `BLOCKED` in the registry until the Option A implementation
  wave starts. Schema freeze, Gate A PASS, and `COMPLETED` remain unavailable.
- `LEGAL_PRIVACY_DECISION_REQUIRED` remains independently active for all real
  data and production policy paths.
- PRDs 08, 14, 23, and 24 still cannot begin or complete paths that require
  PRD 21 `COMPLETED`.
- PRD 07 may continue only in its separately authorized synthetic,
  policy-reference-only lane.
- PRD 25 remains outside authorized scope.

# PRD 03 — Recorded Architecture Decision

- Status: `RECORDED`
- Decision date: 2026-08-17
- Decision maker: Founder
- Selected option: `A` — versioned ledger key ring
- Source stop: [PRD 03 Architecture Decision Required](../blocks/PRD_03_ARCHITECTURE_DECISION_REQUIRED.md)
- Implementation: not resumed

## Decision

The founder selected Option A from the recorded stop. Durable catalog-operation
integrity must use a dedicated ledger-integrity key ring, not the presentation
cursor secret. Catalog readiness must prove that every required migration hash
is present as a subset and must permit later journal entries.

This recording satisfies `ARCHITECTURE_DECISION_REQUIRED` for the two findings
named in the stop. It does not approve the failed candidate, Gate A, a fourth
autonomous correction round, production ingestion, or PRD 03 completion.

## Binding constraints

- Separate cursor signing from durable operation-result integrity.
- Persist an active ledger key identifier with every committed result.
- Retain the bounded historical verification keys required by the ledger
  retention policy.
- Define replica parity, rotation, recovery, missing-key readiness, and
  secret-management behavior before implementation review.
- Change readiness from an exact journal-row count to required-hash subset
  presence. Keep exact checks for catalog functions, triggers, unique indexes,
  and seed identities.
- Resume only in a new isolated implementation wave that starts from current
  `main` and applies Option A. Do not patch the rejected database candidate
  (`2198b28c1785093751b970ee666d96a2843fc6d2` / `bdd1990399644ce447c948b94d4f5ed38ea372ed`).

## Explicitly rejected

- Option B — PostgreSQL-rooted replay proof without an application HMAC.
- Option C — a permanent cursor secret.

## Remaining blocks

- PRD 03 remains `BLOCKED` in the registry until the Option A implementation
  wave starts. Gate A PASS and `COMPLETED` remain unavailable.
- PRDs 05 and 15 still cannot begin because they require PRD 03 `COMPLETED`.
- PRD 04, PRD 07, and recorded PRD 21 Option A work are not invalidated.
- PRD 25 remains outside authorized scope.

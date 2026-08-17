# PRD 03 Option A — Ledger key ring and subset readiness

- Status: `BINDING`
- Decision: [PRD 03 Option A](./PRD_03_OPTION_A.md)
- Date: 2026-08-17
- Implementation wave: `feat/prd-03-option-a-keyring` from current `main`

This document defines the Option A mechanics that must exist before catalog
implementation review. It does not approve Gate A, production ingestion, or
PRD 03 completion. It does not revive the rejected candidates
`2198b28` / `bdd1990`.

## Separation of secrets

Two independent cryptographic materials exist:

| Material      | Purpose                                                 | Stored with                              | Rotation                               |
| ------------- | ------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| Cursor secret | Integrity of presentation-layer pagination cursors only | Never in the catalog ledger              | Independent of the ledger ring         |
| Ledger key    | HMAC of a committed `catalog_operation` result          | Active `keyId` on every committed result | Versioned ring with retained verifiers |

A cursor secret must never sign, verify, or be compared to a durable operation
result. A ledger key must never sign a pagination cursor.

## Ledger key ring

A ring is an ordered set of keys. Each key has:

- `keyId` — opaque, unique, stable identifier
- `secret` — HMAC-SHA-256 key material, never persisted in PostgreSQL
- `status` — `active` or `retired`

Invariants:

- Exactly one key is `active`.
- Signing uses only the active key and writes that `keyId` with the result.
- Verification looks up the persisted `keyId` in the ring (`active` or
  `retired`) and rejects a missing identifier as a missing-key failure.
- The ring retains every retired key required to verify retained committed
  results. A key may leave the ring only after no retained result cites it
  and the retention window has elapsed.

## Replica parity

Replicas of one environment share one ring epoch. The epoch is the ordered
list of `(keyId, status)` pairs, not the secret bytes. Readiness compares a
digest of that epoch across configured replicas. A replica with a different
active key, a missing historical `keyId`, or extra unapproved keys is
`not_ready`. Secret bytes are never exchanged in the parity payload.

## Rotation

1. Provision a new key outside the database.
2. Add it to the ring as `active`.
3. Mark the previous active key `retired`.
4. New commits use the new `keyId`. Historical rows keep their original
   `keyId` and remain verifiable with the retired key.

Rotation does not rewrite committed results.

## Recovery

- Lost active key: refuse new commits. Existing rows that cite remaining
  ring keys still verify. Readiness is `not_ready` until a new active key is
  provisioned.
- Lost historical key that any retained result still cites: those results
  fail verification. Readiness is `not_ready` (`missing_ledger_key`).
- Compromised key: rotate immediately, keep the compromised identifier as
  `retired` only for the verification of already-committed rows, and stop
  using it for new signatures.

## Secret management

- Secrets enter the process from the environment or a secret manager. They
  are never database columns, log fields, fixtures, cursors, or browser
  values.
- Diagnostics report only `keyId`, status, and presence (`configured` /
  `missing`). They never print secret bytes or lengths of other keys.
- Test rings use disposable random material and must fail closed if composed
  as production.

## Missing-key readiness

Catalog readiness is false when any of the following is true:

- the ring has no active key
- a retained committed result cites a `keyId` absent from the ring
- replica epoch parity fails
- a required catalog migration hash is missing from the Drizzle journal

## Subset journal readiness

Readiness proves that every required migration hash is present in the
journal. Later additive journal entries do not fail readiness by count.

Exact checks remain required for catalog functions, triggers, unique
indexes, and seed identities once those objects exist. Journal row count is
not a readiness signal.

The required-hash set is owned by the implementation wave that introduces
each migration. It is not the rejected-candidate hash pair.

## Out of scope

- Catalog tables, ingestion, and public exercise routes (later slices of
  this wave)
- Production catalog content
- Cursor-secret permanence (Option C, rejected)
- PostgreSQL-only replay without an application HMAC (Option B, rejected)

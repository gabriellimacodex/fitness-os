# PRD 04 — Human Perception Required

- Status: `ACTIVE`
- Stop condition: `HUMAN_PERCEPTION_REQUIRED`
- Affected path: PRD 04 Gate A **content publication** only
- Recorded: 2026-08-18
- Decision maker needed: Human Review Authority (dual-role receipts)

## Why this path is paused

Published movement versions require durable review files under
`docs/execution/content-reviews/movements/` signed against a Human Review
Authority key. The catalog remains intentionally empty of published entries.
Mechanics for PRD 04 are already on `main`; **content publication** cannot
complete Gate A until independent human perception receipts exist.

## What may continue

- Unrelated Wave 2/3 work that does not require PRD 04 `COMPLETED`
  (e.g. finish PRD 03 Gate A, continue PRD 07 synthetic, start PRD 21 Option A
  mechanics).
- PRD 05 Training Core remains blocked until **both** PRD 03 and PRD 04 are
  `COMPLETED`.

## Resume condition

Human Review Authority issues both role receipts for an exact source commit and
digest for at least one published movement version; Gate A content job
validates those receipts. Do not invent reviewers, keys, or receipts.

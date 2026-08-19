# PRD 21 — Gate A Status Record

- Capability: Privacy & Data Governance (Option A)
- Record type: Gate A **status** (not completion)
- Exact head at recording: `b0b9e178e9cc4e2ffceea1c6c0dd8c5fbbf9a486`
- Disposition: `PENDING`
- Production readiness: `BLOCKED` — `LEGAL_PRIVACY_DECISION_REQUIRED`
- Registry state: `IN_PROGRESS` (must **not** flip to `COMPLETED` from this record)
- Record timestamp: `2026-08-19`

## Explicit non-claims

- This is **not** Gate A `PASS`.
- This does **not** authorize PRD 21 `COMPLETED`.
- This does **not** clear `LEGAL_PRIVACY_DECISION_REQUIRED`.
- This does **not** authorize production policy, real subject data, public privacy
  UX, or destructive lifecycle execution.
- Zero known BLOCKER/HIGH on merged slices ≠ absence of future defects.

## Disposition by area

| Area                         | Result       | Notes                                                          |
| ---------------------------- | ------------ | -------------------------------------------------------------- |
| CI on merged Option A slices | `PASS`       | Per-PR `quality` green on #28–#58 heads (see evidence)         |
| Synthetic / mechanism tests  | `PASS`       | Schemas, domain, disposable PG, synthetic API seams            |
| Architecture (Option A)      | `PASS`       | Binding decision `docs/execution/decisions/PRD_21_OPTION_A.md` |
| Security / privacy           | `BLOCKED`    | Production paths stopped; synthetic-only seams                 |
| Scope                        | `PASS`       | Disposable/synthetic Option A only                             |
| Contracts                    | `CONSISTENT` | Frozen rows in `docs/contracts/README.md`                      |
| Migrations                   | `VALIDATED`  | `0002`–`0006` privacy migrations + append-only guards          |
| Production policy activation | `BLOCKED`    | `LEGAL_PRIVACY_DECISION_REQUIRED`                              |
| Destructive lifecycle        | `BLOCKED`    | Synthetic deny `requires_legal_privacy_decision` (#58)         |
| Open `BLOCKER` (package)     | `0`          | No package-level BLOCKER claimed; stops remain active          |
| Open `HIGH` (package)        | `0`          | Deferred MEDIUM/LOW tracked on individual PR reviews           |
| Gate A package review        | `PENDING`    | Requires independent Agent 90 on a future completion candidate |

## Landed Option A evidence (merged)

| Slice                              | PR(s)       | Notes                                            |
| ---------------------------------- | ----------- | ------------------------------------------------ |
| Option A decision                  | —           | `decisions/PRD_21_OPTION_A.md`                   |
| Contracts / domain / synthetic API | #28–#45     | Policy-neutral seams                             |
| Disposable PG core → request       | #46–#48     | Subject-request current pointer                  |
| Transition history                 | #50         | Append-only + race fencing                       |
| API → repository wire              | #51         | Synthetic subject-request-transition             |
| Expected inventory + coverage      | #52–#53     | Metadata + compareExpectedInventoryToRuntime     |
| Append-only guards                 | #54         | Triggers + ordinary role SELECT/INSERT           |
| SubjectDataProcessor sim + API     | #55–#56     | inventory/access + execute seam                  |
| Export digest simulation           | #57         | Opaque `exportManifestDigest` only               |
| Destructive capability deny        | #58         | delete/retention/governance_lifecycle stop-gated |
| Standing `/goal` meta              | #49,#56,#58 | `GOAL_PILOT_RC.md` progress snapshots            |

## Active stop

`LEGAL_PRIVACY_DECISION_REQUIRED` remains independently active for:

- real-user onboarding / real subject data;
- production policy packages and legal wording;
- production readiness (`productionReady` must stay false);
- destructive retention / governance-record lifecycle execution.

Unrelated Wave 3 work (e.g. PRD 07 synthetic) may continue where dependency
analysis allows. PRD 05 remains blocked on PRD 04 `HUMAN_PERCEPTION_REQUIRED`.

## Resume condition for Gate A PASS

All of the following must be true on one exact candidate head:

1. Option A acceptance criteria for the **authorized** scope are evidence-backed.
2. Independent Agent 90 (or equivalent) PASS with 0 BLOCKER and 0 HIGH on that head.
3. CI `quality` green on that exact head.
4. Either:
   - `LEGAL_PRIVACY_DECISION_REQUIRED` is cleared with attributable human/legal
     decisions covering required packet items; **or**
   - Gate A is explicitly scoped as **policy-agnostic / synthetic-only** with
     production readiness recorded `BLOCKED`/`NOT_APPLICABLE` with rationale
     (per TD 021), and registry `COMPLETED` rules for that scoped outcome are
     satisfied without weakening PRD acceptance.
5. Durable findings and known limitations are recorded without “100% bug-free”
   or perfect-security claims.

Until then this file remains `PENDING`.

## Known limitations

- Synthetic inventory fixture is mechanism-only (`synthetic_only`); not a
  production inventory review.
- Ordinary-role live `SET ROLE` DML harness and TRUNCATE bypass hardening remain
  deferred from #54 reviews.
- Form Intelligence / body capture dependents (08+) still require PRD 21
  `COMPLETED` before their privacy-dependent paths begin.
- PRD 25 remains `PROPOSED` and out of Autonomous Pilot V1 standing authority.

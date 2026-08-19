# Goal — Fitness OS Pilot Release Candidate

- Status: `ACTIVE` (founder-selected meta for `/goal`)
- Target: **PRD 24 — Pilot Release Candidate** `COMPLETED` with Gate D PASS
- Authority: Autonomous Pilot V1 through PRD 24 (`docs/prds/PRD_REGISTRY.md`,
  `docs/execution/AUTONOMOUS_DELIVERY_CHARTER.md`)
- Explicitly excluded: **PRD 25 — Pilot Release** (`PROPOSED`; needs separate
  authorization)
- Date recorded: 2026-08-18
- Last refreshed: 2026-08-19
- Progress snapshot head: `ba23121` (PR #94 merged; see Progress below)
- Original baseline when first recorded: `789f407`

## Paste into `/goal`

Use this exact objective (or invoke `/goal` with a short pointer to this file):

```text
Deliver Fitness OS Pilot Release Candidate (PRD 24 COMPLETED + Gate D PASS) from current main, following docs/execution/GOAL_PILOT_RC.md, docs/execution/MASTER_EXECUTION_PLAN.md, docs/prds/PRD_REGISTRY.md, AGENTS.md, MULTI_AGENT_PROTOCOL.md, docs/execution/AUTONOMOUS_DELIVERY_CHARTER.md, docs/execution/RELEASE_GATES.md, docs/execution/STOP_CONDITIONS.md, and docs/execution/REVIEWER_AGENT.md. Execute the dependency DAG wave-by-wave without inventing parallel product paths. Complete each APPROVED/IN_PROGRESS PRD with contracts → design → implementation → tests → Agent 90 → CI green → Gate A before dependents. PRD 03 Option A and PRD 21 Option A are binding. Do not start PRD 25. Do not merge with open BLOCKER/HIGH. Stop only on STOP_CONDITIONS; otherwise keep delivering. Human stops (HUMAN_PERCEPTION, LEGAL_PRIVACY, credentials, financial) pause only the blocked path and continue unrelated authorized work. Report AGENT HANDOFF after each mergeable slice. Done only when PRD 24 is COMPLETED, Gate D evidence exists on the exact head, known limitations are documented, and an independent verification can reproduce Gate D PASS — not a builder claim.
```

Short form:

```text
/goal Execute docs/execution/GOAL_PILOT_RC.md to completion
```

## Definition of done

The goal is complete **only** when all of the following are true and
independently verifiable:

1. Registry shows every unconditional dependency of PRD 24
   (`11, 13, 18, 19, 20, 21, 23` and their transitive required deps) as
   `COMPLETED`. PRD 22 may remain non-integrated.
2. PRD **24** is `COMPLETED` with a durable Gate D PASS record for the exact
   candidate head under `docs/execution/gates/`.
3. CI `quality` is green on that exact head.
4. Agent 90 (or equivalent independent reviewer) has PASS with **0 BLOCKER**
   and **0 HIGH** open on the RC candidate.
5. Known limitations are documented (no “100% bug-free” or perfect-security
   claims).
6. PRD **25** was **not** started.

PRD **22** (Form Intelligence POC) is optional for baseline RC. It may run as
an isolated POC lane; it must not block PRD 24 unless later explicitly
integrated after its POC gate.

## Non-goals (do not invent)

- PRD 25 Pilot Release
- Native iOS / Apple Watch
- Unrelated frontend polish / PWA preview detours outside the Wave schedule
  (e.g. abandoned preview PRs that are not the current DAG step)
- Weakening acceptance criteria, fabricating human-perception or legal
  approvals, inventing credentials, or patching rejected architecture
  candidates named in Option A records
- Claiming perfect security or zero possible defects
- Mandatory inclusion of PRD 22 in the baseline RC

## Authority and working rules

1. Authority hierarchy: `PRODUCT_PRINCIPLES.md` → ADRs → current APPROVED PRD →
   epic (if any) → frozen contracts → task.
2. Standing authority only for `APPROVED` / authorized `IN_PROGRESS` PRDs under
   the charter. `PROPOSED` is never implementation authority.
3. Follow the Master Execution Plan **dependency DAG** and **wave table**. Do
   not reorder dependents ahead of `COMPLETED` prerequisites.
4. Wave 2 shared-path serialization remains binding when touching schema
   barrels, Drizzle metadata, migrations, or API registration.
5. Every material PR: tests → Agent 90 → CI green on exact head → autonomous
   merge only when Gate A checklist passes (`RELEASE_GATES.md`).
6. Builder may not be the only reviewer. Agent 90 inspects real diff and
   evidence.
7. Stop conditions (`STOP_CONDITIONS.md`) pause only the affected path;
   continue unrelated authorized work when dependency analysis allows.
8. Prefer the plan in Git over conversation improvisation.

## Binding architecture decisions already recorded

- **PRD 03 Option A** — versioned ledger key ring; subset journal readiness;
  do not patch rejected DB candidates `2198b28` / `bdd1990`.
- **PRD 21 Option A** — exhaustive canonical profiles + `proofId`; do not
  patch rejected schema candidate `df76f91`; real-data paths remain under
  `LEGAL_PRIVACY_DECISION_REQUIRED`.

## Progress snapshot (do not redo completed work)

| Area                 | State                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD 00–02            | `COMPLETED`                                                                                                                                                                                                                           |
| PRD 03               | `COMPLETED` — Option A Gate A PASS (`docs/execution/gates/PRD_03_GATE_A.md`, #30)                                                                                                                                                     |
| PRD 04               | `IN_PROGRESS` — mechanics on `main`; **content publication** paused on `HUMAN_PERCEPTION_REQUIRED` (`blocks/PRD_04_HUMAN_PERCEPTION_REQUIRED.md`)                                                                                     |
| PRD 05               | `APPROVED` — **blocked** until PRD 04 is `COMPLETED`                                                                                                                                                                                  |
| PRD 07               | `IN_PROGRESS` — synthetic/disposable persistence, domain ports, and synthetic readiness route through #94 on `ba23121`; real-user still `LEGAL_PRIVACY`                                                                               |
| PRD 21               | `IN_PROGRESS` — Option A through #78 on `cac4d43` (ordinary-role harness, evidence/audit inject, PG persistence bundle + synthetic HTTP/integration); Gate A status `PENDING` — **not** PASS; production `BLOCKED` by `LEGAL_PRIVACY` |
| PRD 06, 08–20, 22–24 | `APPROVED` — start only when registry deps + gates allow                                                                                                                                                                              |
| PRD 25               | `PROPOSED` — out of scope                                                                                                                                                                                                             |

Open stop that blocks the Training Core chain: **PRD 04 content** needs human
perception receipts before Gate A content publication and before PRD 05.

Open stop that blocks production privacy / real-user onboarding: **LEGAL_PRIVACY**
— disposable/synthetic persistence and policy-neutral mechanics remain authorized.

Disposable migrations already on `main` (do not regenerate): `0001` catalog;
`0002`–`0006` + `0011` privacy; `0007`–`0010` onboarding invitation/attempt/operation/role-mapping.
Next Wave 3 authorized work: further PRD 07/21 synthetic/disposable mechanics without inventing Gate A PASS or registry COMPLETED under active stops.

## Execution sequence from current progress

Work the DAG; use safe wave parallelism only when ownership and contracts allow.

### Wave 2 — remaining

1. **PRD 04** — resume only after human perception receipts; close Gate A →
   `COMPLETED`. Until then, keep the stop recorded and do not invent receipts.
2. Do not start PRD 05 until **both** 03 and 04 are `COMPLETED`.

### Wave 3 — authorized in parallel where deps allow

3. **PRD 07** — continue authorized synthetic / disposable onboarding beyond
   `0010` only if gaps remain; keep real-user activation blocked by
   `LEGAL_PRIVACY` until cleared.
4. **PRD 21** — continue Option A from current `main`:
   - keep destructive/lifecycle paths denied under `LEGAL_PRIVACY`;
   - Gate A status remains `PENDING` until resume conditions in
     `gates/PRD_21_GATE_A.md` are met — never invent PASS or COMPLETED.
5. **PRD 05** Training Core — only after 03+04 `COMPLETED`; then Gate A /
   external Training Core gate as required.

### Waves 4–12 — dependents only when deps are COMPLETED

6. Follow registry dependencies for PRDs 06, 08–20, 23 (and 09–18 stack).
7. External gates (Training Core, Body+Twin, Copilot, Release Candidate) must
   PASS or remain honestly `BLOCKED`/`PENDING` — never fake PASS.
8. **PRD 24** — integrate unconditional deps; Gate D; document limitations;
   mark `COMPLETED`.

### Human / external pauses (expected; do not invent answers)

| Stop                              | Typical impact                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `HUMAN_PERCEPTION_REQUIRED`       | PRD 04 published content; Digital Twin / Form Intelligence perception gates     |
| `LEGAL_PRIVACY_DECISION_REQUIRED` | Real-user onboarding; body/photo/governance production paths; parts of 21/08/14 |
| `EXTERNAL_CREDENTIAL_REQUIRED`    | Provider-backed body/auth/notification integrations when acceptance needs them  |
| `FINANCIAL_COMMITMENT_REQUIRED`   | Paid providers not already authorized                                           |
| `FOUNDER_DECISION_REQUIRED`       | Dual-role / self-coach product unlock; thesis changes                           |
| `TECHNOLOGY_VALIDATION_FAILED`    | Body Engine / Twin / Copilot threshold failures                                 |
| `ARCHITECTURE_DECISION_REQUIRED`  | After three failed correction rounds on one architecture                        |

When paused: record the stop, preserve reversible state, continue every other
authorized lane that does not depend on the blocked decision.

## Progress reporting

After each mergeable slice, emit `AGENT HANDOFF` with:

- PRD / wave / lane
- exact head SHA and PR URL
- CI run id + Agent 90 outcome
- registry state changes
- open stops / deferred MEDIUM/LOW
- next DAG node

Do not claim the `/goal` complete until the Definition of done above is
evidence-backed.

## How to run

```text
/goal Deliver Fitness OS Pilot Release Candidate (PRD 24 COMPLETED + Gate D PASS) from current main, following docs/execution/GOAL_PILOT_RC.md …
```

Or:

```text
/goal Execute docs/execution/GOAL_PILOT_RC.md to completion
```

Use `/goal status`, `/goal pause`, `/goal resume` as needed. Clearing the goal
does not change registry state; only recorded PRD/gate evidence does.

# Goal — Fitness OS Pilot Release Candidate

- Status: `ACTIVE` (founder-selected meta for `/goal`)
- Target: **PRD 24 — Pilot Release Candidate** `COMPLETED` with Gate D PASS
- Authority: Autonomous Pilot V1 through PRD 24 (`docs/prds/PRD_REGISTRY.md`,
  `docs/execution/AUTONOMOUS_DELIVERY_CHARTER.md`)
- Explicitly excluded: **PRD 25 — Pilot Release** (`PROPOSED`; needs separate
  authorization)
- Date recorded: 2026-08-18
- Last refreshed: 2026-09-03 (integrated delivery refresh through #259)
- Progress snapshot head: `6887866` (PR #259 merged; see Progress)
- Original baseline when first recorded: `789f407`

## Paste into `/goal`

Use this exact objective (or invoke `/goal` with a short pointer to this file):

```text
Deliver Fitness OS Pilot Release Candidate (PRD 24 COMPLETED + Gate D PASS) from current main, following docs/execution/GOAL_PILOT_RC.md, docs/execution/MASTER_EXECUTION_PLAN.md, docs/prds/PRD_REGISTRY.md, AGENTS.md, MULTI_AGENT_PROTOCOL.md, docs/execution/AUTONOMOUS_DELIVERY_CHARTER.md, docs/execution/RELEASE_GATES.md, docs/execution/STOP_CONDITIONS.md, and docs/execution/REVIEWER_AGENT.md. Execute the Master Execution Plan dependency DAG wave-by-wave (Waves 0–12 to PRD 24; Wave 13 / PRD 25 out of scope). Do not invent parallel product paths. Complete each APPROVED/IN_PROGRESS PRD with contracts → design → implementation → tests → Agent 90 → CI green → Gate A before dependents. Honor Wave 2 shared-path serialization (schema barrels, Drizzle metadata, migrations, API registration). PRD 03 Option A and PRD 21 Option A are binding. PRD 22 Form Intelligence is optional for baseline RC and must not block PRD 24 unless explicitly integrated after its POC gate. Do not start PRD 25. Do not merge with open BLOCKER/HIGH. Stop only on STOP_CONDITIONS; otherwise keep delivering. Human stops (HUMAN_PERCEPTION, LEGAL_PRIVACY, credentials, financial, founder decision, technology validation, architecture decision) pause only the blocked path and continue unrelated authorized work. Report AGENT HANDOFF after each mergeable slice. Done only when every unconditional PRD 24 dependency is COMPLETED, PRD 24 is COMPLETED, a durable Gate D PASS record exists on the exact candidate head under docs/execution/gates/, CI quality is green on that head, Agent 90 (or equivalent) PASS has 0 BLOCKER/0 HIGH, known limitations are documented without perfect-security or zero-defect claims, and an independent verification can reproduce Gate D PASS — not a builder claim.
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
   candidate head under `docs/execution/gates/` satisfying `RELEASE_GATES.md`
   Gate D (Gates A–C as applicable; CI green; unit/integration/E2E; security;
   authorization; migrations; failure/retry; production build; deployment;
   smoke; rollback/recovery documented; known limitations documented).
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

| Area                 | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD 00–02            | `COMPLETED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| PRD 03               | `COMPLETED` — Option A Gate A PASS (`docs/execution/gates/PRD_03_GATE_A.md`, #30)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PRD 04               | `IN_PROGRESS` — mechanics on `main`; #228/#243/#251/#254/#255/#257/#259 add failure-mode, withdrawal, success-path, manifest/history/lifecycle, and review-record guard coverage. **Content publication** remains paused on `HUMAN_PERCEPTION_REQUIRED` (`blocks/PRD_04_HUMAN_PERCEPTION_REQUIRED.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PRD 05               | `APPROVED` — **blocked** until PRD 04 is `COMPLETED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PRD 07               | `IN_PROGRESS` — synthetic/disposable persistence and TD 007 ports are composed; #192 and the #227 integration add coach-bootstrap/full issue→claim/revoke/resume/abandon PG evidence, transition-sink composition, canonical-input/idempotency guards, trusted-time attempt evaluation, claim-secret throttling, and student/coach onboarding screens. The #227 correction makes throttled responses non-oracular while preserving safe retry replay/mismatch semantics. #246 binds the four PG repository readiness components to real schema evidence, #247 binds clock/id/secret components to real self-tests, #248 enables caller-supplied mechanism evaluation, and #249 composes the real PG persistence/readiness platform from environment with the same clock/id/secret instances. #250 adds the PG-backed claim-failure tracker and migration `0024`. Server bootstrap adoption, identity adapter, and policy gateway remain open. Real-user remains under `LEGAL_PRIVACY`; Gate A is not claimed.                                                                                                                                                                                                                                                                                                                                              |
| PRD 21               | `IN_PROGRESS` — Option A synthetic through #256. H3 remains closed. H4 includes trusted intake, server-derived processor plans, guarded completion/resume, PG step/lifecycle/retention-preview/retention-rule persistence, rule-aware preview routing, post-persistence PG lifecycle-proof lookup, trusted persisted-preview/current-runtime authorization (#232), exact-once persisted-preview consumption (#234), server-authoritative processor-step plan/timestamp/transition identity with exact immutable replay matching (#236), an independent runtime-validated processor execution-receipt source (#238), a coordinator-owned non-destructive synthetic execute→receipt→step path (#240), and durable pre-execution operation ownership with exact completed replay plus fail-closed restart reconciliation (#242). #252 adds retention rules to the PG persistence bundle, #253 adds an environment-gated PG platform composition helper, and #256 binds recovery readiness to real trigger evidence. No destructive processor action is enabled; trusted resolution of `reconciliation_required`, server-bootstrap adoption, exact inventory/runtime injection into the platform helper, and full coordinator semantics remain open. Gate A `PENDING`; production `BLOCKED` by `LEGAL_PRIVACY`; H6 remains open. See `gates/PRD_21_GATE_A.md`. |
| PRD 06, 08–20, 22–24 | `APPROVED` — start only when registry deps + gates allow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| PRD 25               | `PROPOSED` — out of scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Open stop that blocks the Training Core chain: **PRD 04 content** needs human
perception receipts before Gate A content publication and before PRD 05.

Open stop that blocks production privacy / real-user onboarding: **LEGAL_PRIVACY**
— disposable/synthetic persistence and policy-neutral mechanics remain authorized.

Disposable migrations already on `main` (do not regenerate): `0001` catalog;
`0002`–`0006` + `0011`–`0012` + `0014`–`0015` + `0017`–`0023` privacy;
`0007`–`0010` + `0013` + `0016` + `0024` onboarding
invitation/attempt/operation/role-mapping/principal-binding/transition/claim-failure.

Immediate next authorized Wave 3 work:

1. Continue remaining PRD 07/21 synthetic/disposable mechanics — #230 landed an
   independent execution/coordinator receipt source, #232 replaced caller-trusted
   retention authorization booleans with trusted persisted/current evidence,
   #234 added exact-once preview consumption, #236 made processor-step plan,
   timestamp, replay, and transition identity server-authoritative, #238 made
   the recorded outcome authoritative from one exact independent receipt, and
   #240 composed the non-destructive synthetic execute→receipt→step path, and
   #242 added a disposable durable execution journal that reserves before the
   handler, replays exact completed receipts after restart, and holds ambiguous
   work without re-execution. The next smallest PRD 21 H4 slice is a trusted
   synthetic reconciliation-evidence seam that can resolve a held operation
   without invoking the handler again; it must not expose caller authority,
   enable delete or retention side effects, or clear LEGAL. #244 binds expected
   inventory/runtime coverage inside the PG probe, #245 binds audit-sink table
   evidence, #252 composes retention rules in the PG persistence bundle, #253
   adds an env-gated PG platform helper, and #256 binds recovery to trigger
   evidence. Exact inventory/runtime injection into that helper, server-bootstrap
   adoption, and fail-closed reviewed-exception outcomes remain open. Full
   coordinator semantics remain open. Do not invent legal
   exception policy, Gate A PASS, or registry `COMPLETED` under active stops.
2. Optional later: synthetic-only Gate A package for PRD 21 **only** if resume
   conditions in `gates/PRD_21_GATE_A.md` are met — never invent PASS/COMPLETED.
3. Resume PRD 04 content publication only after human perception receipts.

## Master Execution Plan — wave map (canonical)

| Wave | Work                                               | Constraint summary                                         |
| ---- | -------------------------------------------------- | ---------------------------------------------------------- |
| 0–1  | 00 Bootstrap; 01 Platform                          | Done                                                       |
| 2    | 02 Domain; 03 Catalog; 04 Movement                 | 03 done; 04 HUMAN_PERCEPTION pause; serialize shared paths |
| 3    | 05 Training Core; 07 Onboarding; 21 Privacy        | 05 blocked on 04; 07/21 synthetic authorized               |
| 4    | 06 UX; 08 Body Scan; 15 Evidence; 20 Notifications | After own deps + contract freezes                          |
| 5    | 09 Body Intelligence; 19 PWA Hardening             | Capability validation / no native scope                    |
| 6    | 10 Snapshot; 16 Copilot                            | Evidence-grounded; human-in-the-loop                       |
| 7    | 11 Twin; 14 Progress Photos                        | After 10; privacy/perception gates                         |
| 8–9  | 12 Character Sheet; 13 Evolution                   | After twin / snapshot+sheet                                |
| 10   | 17 Adaptive; 23 Observability                      | Professional approval where consequential                  |
| 11   | 18 Coach Workspace                                 | Integration-heavy                                          |
| POC  | 22 Form Intelligence                               | Isolated; optional for baseline RC                         |
| 12   | **24 Release Candidate**                           | Gate D on exact head — **goal target**                     |
| 13   | 25 Pilot Release                                   | **Out of scope** until separate authorization              |

## Execution sequence from current progress

Work the DAG; use safe wave parallelism only when ownership and contracts allow.

### Wave 2 — remaining

1. **PRD 04** — resume only after human perception receipts; close Gate A →
   `COMPLETED`. Until then, keep the stop recorded and do not invent receipts.
2. Do not start PRD 05 until **both** 03 and 04 are `COMPLETED`.

### Wave 3 — authorized in parallel where deps allow

3. **PRD 07** — continue synthetic/disposable composition from the current
   landed state through #250 (PG end-to-end evidence, transition sink,
   idempotency/canonical-input guards, throttling, trusted time, and student/coach
   screens included); choose only
   still-unmet TD acceptance criteria and keep real-user activation blocked by
   `LEGAL_PRIVACY` until cleared.
4. **PRD 21** — continue Option A from current `main` (integrated through #256,
   including #210 record-family coverage and #217–#225 retention/lifecycle
   persistence, readiness, verifier, API planning, and authorization slices):
   - keep destructive/lifecycle paths denied under `LEGAL_PRIVACY`;
   - #230 adds an independent read-only execution/coordinator receipt source for
     pre-append authorization; #232 composes persisted-preview/current-runtime
     authorization without caller-trusted state/digest booleans; #234 consumes
     the preview exact-once with canonical operation/input binding, concurrent
     conflict handling, and legacy-safe migrations. H4 residuals remain around
     full coordinator semantics across the landed plan/step/resume/completion/
     lifecycle pieces; #236/#238/#240/#242 add the server-authoritative
     execute→receipt→step composition and restart-safe durable ownership, while
     trusted resolution of reconciliation holds remains open;
   - H5 contract coverage and PG expected-inventory/runtime binding landed;
     #253 establishes the PG platform helper, but exact inventory/runtime
     injection, bootstrap adoption, and reviewed exception semantics remain open;
     H6 trigger readiness evidence landed in #256 while package-level recovery
     and destructive recovery remain open;
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

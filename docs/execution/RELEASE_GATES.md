# Release Gates

## Purpose

These gates control whether a Fitness OS change may be merged, promoted, or called a Pilot Release Candidate. They supplement `PRODUCT_PRINCIPLES.md`, accepted ADRs, approved PRDs, frozen contracts, and repository engineering governance; they do not replace or weaken them.

Gate results are evidence-based. Use `0 known BLOCKER`, `0 known HIGH`, `all required gates passing`, and `known limitations documented`. Do not claim `100% bug-free`, `zero possible production defects`, or `perfect security`.

## Evidence and status rules

Each gate record must identify the exact commit SHA, scope, responsible evaluator, evidence, open findings, deferrals, known limitations, and timestamp. Evidence must come from the candidate being evaluated, not a prior head or a builder's unsupported report.

Each required check has one status:

- `PASS` — its stated criteria were verified for the exact candidate;
- `FAIL` — evidence shows the criteria are not met;
- `BLOCKED` — required evidence or access is unavailable;
- `NOT_APPLICABLE` — the check genuinely does not apply and a written rationale is recorded; or
- `PENDING` — the check has not yet been run or completed.

Only `PASS` and justified `NOT_APPLICABLE` satisfy a check. A gate passes only when every required check is satisfied, all findings remain visible in the durable record, and no open `BLOCKER` or `HIGH` exists. A missing, stale, skipped, cancelled, or hidden result is not a pass.

No builder may be the sole approver of work it authored. Branch protection, required checks, reviewer independence, exact-head verification, and the durable findings record must not be bypassed. Splitting, relabeling, or documenting a change does not exempt it from a gate that applies to its actual behavior.

## GATE A — PR Gate

Gate A applies to every pull request before merge, including maintenance, documentation, dependency, configuration, migration, and governance changes.

Required checks:

| Check        | Required evidence                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI           | All required jobs are green for the exact head SHA; no required failure is ignored, overridden, or represented by a stale run.                                   |
| Tests        | Applicable automated tests pass and meaningfully cover changed behavior and relevant failure paths; test gaps and justified `NOT_APPLICABLE` areas are explicit. |
| Architecture | Product Principles, accepted ADRs, approved PRD/maintenance authority, frozen contracts, import boundaries, and architectural topology remain consistent.        |
| Security     | Applicable security/privacy review passes; no exposed secret, unaddressed serious vulnerability, unsafe data behavior, or authorization defect is known.         |
| Scope        | The diff stays within its authorized scope and non-scope, with no hidden product feature, speculative infrastructure, or unrelated refactor.                     |
| Reviewer     | Agent 90 or another genuinely independent reviewer inspected the actual code and diff under [REVIEWER_AGENT.md](./REVIEWER_AGENT.md).                            |

Autonomous merge requires all Gate A checks to be satisfied plus:

```text
CI = GREEN
BLOCKER = 0
HIGH = 0
Architecture Gate = PASS
QA Gate = PASS
Security Gate = PASS
Scope Gate = PASS
Contracts = CONSISTENT
Migrations = VALIDATED when applicable
Required documentation = UPDATED
```

Open `MEDIUM` findings must be fixed immediately or explicitly deferred with rationale and tracking. Open `LOW` findings may be deferred with rationale. Deferred findings remain visible and do not become resolved findings.

Gate A does not authorize work on the next PRD. Autonomous execution may advance only to another `APPROVED` PRD.

## GATE B — Capability Gate

Gate B applies when a significant domain capability reaches an integration milestone. Examples include Training Core, Body Intelligence, Digital Twin, and Training Intelligence. The approved PRD or Technical Design identifies the precise capability boundary and acceptance criteria; this document does not invent them.

Gate B includes a passing Gate A for the candidate and deeper integration evidence across all affected components. At minimum, as applicable, it evaluates:

- end-to-end contract consistency across clients, API, domain, persistence, and providers;
- integration tests for primary workflows and material failure paths;
- authorization, privacy, data lifecycle, and historical-state behavior;
- migration compatibility, validation, and recovery;
- provider-adapter behavior, timeouts, retries, duplicates, and degraded operation;
- performance or repeatability thresholds already defined by the approved PRD;
- observability and operational diagnosis; and
- capability-level documentation and known limitations.

An isolated component test cannot substitute for capability integration. `BLOCKER` or `HIGH`, unmet acceptance criteria, inconsistent contracts, or unvalidated applicable migrations fail Gate B and prohibit autonomous promotion or merge of the capability milestone.

## GATE C — External Red Team Gate

Gate C requires an external, independent model or reviewer at these selected major milestones:

- Foundation;
- Training Core;
- Body Intelligence + Digital Twin;
- Training Copilot; and
- Release Candidate.

External review is a milestone control, not a daily implementation dependency. The reviewer receives the real candidate evidence and is asked to challenge architecture, multi-agent execution where relevant, security, CI, scope, tests, contracts, migrations, failure modes, and documentation. The resulting findings, corrections, and final disposition remain in the durable gate record.

If external review is operationally unavailable, autonomous work may continue only until the next mandatory external gate. The unavailable gate remains `BLOCKED` or `PENDING`; it cannot be marked `PASS` based on internal review, elapsed time, or assumed approval. Crossing that mandatory milestone requires either:

- a completed independent external audit with the gate passing; or
- an explicit human override recorded with scope, rationale, accepted risk, and exact candidate SHA.

An override is not an external-review `PASS`; the record must say that the milestone proceeded by human override. `BLOCKER` or `HIGH` findings from an external review prohibit autonomous merge until corrected and independently verified in a subsequent round.

## GATE D — Pilot Release Candidate

Gate D applies to the complete Fitness OS Pilot Release Candidate. It requires all applicable Gates A–C and, at minimum:

```text
0 known BLOCKER
0 known HIGH

CI GREEN

Unit PASS
Integration PASS
E2E PASS

Security PASS

Authorization tests PASS

Migration validation PASS

Failure/retry behavior tested

Production build PASS

Deployment PASS

Smoke tests PASS

Rollback/recovery procedure documented

Known limitations documented
```

These results must cover the exact release-candidate SHA and production-representative configuration. An applicable item cannot be silently waived. If an item genuinely does not apply, the Gate D record must mark it `NOT_APPLICABLE` with evidence and rationale; ambiguity is `BLOCKED`, not `PASS`.

Gate D evaluates only the scope authorized for the Pilot Release Candidate. It does not silently add native iOS, Apple Watch, or a capability whose approved prerequisite or POC gate failed. A release-candidate label is prohibited until Gate D passes or an explicit human decision records a permitted exception without misrepresenting the gate as passed.

## Correction and re-evaluation

A failed gate returns the change to its owner for correction. Affected tests and checks are rerun, then the independent reviewer performs Round 2 against the exact corrected head. Every later code change invalidates any evidence it could affect and requires corresponding re-evaluation.

If significant architectural instability remains after three meaningful correction rounds, autonomous patching stops and reports:

```text
ARCHITECTURE_DECISION_REQUIRED
```

Gate evidence, findings, and deferrals must never be deleted or concealed to obtain a pass. Superseded results may be retained as historical rounds and clearly linked to the current result.

## Gate summary

| Gate                        | Applies to                                | Minimum decision                                                                                             |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A — PR                      | Every merge                               | Required PR checks pass; independent review; 0 known `BLOCKER`/`HIGH`                                        |
| B — Capability              | Significant domain integration milestones | Gate A plus deeper cross-component integration and failure evidence                                          |
| C — External Red Team       | Selected major milestones                 | Independent external audit passes, or an explicit human override is recorded without calling the gate passed |
| D — Pilot Release Candidate | Full Pilot RC                             | Gates A–C plus complete RC build, test, security, deployment, recovery, and limitation evidence              |

# Autonomous Delivery Charter

## Purpose

This charter grants the Fitness OS Orchestrator standing authority to deliver work that the founder has already authorized. It removes routine approval waits from reversible engineering work while preserving product, safety, privacy, financial, and release controls.

`PRODUCT_PRINCIPLES.md` remains the product constitution. Accepted ADRs, approved PRDs, frozen contracts, and repository governance remain binding in their established authority order. This charter does not create a second product constitution or authorize exceptions to a higher-level decision.

## Boundary of standing authority

Standing authority exists only when all of the following are true:

- the current detailed PRD is explicitly in the `APPROVED` state;
- the PRD's declared dependencies and required pre-flight decisions are satisfied;
- the work remains inside the PRD's scope, non-scope, acceptance criteria, technical constraints, and release gate;
- the work complies with the Product Principles, accepted ADRs, frozen contracts, and current repository governance; and
- no condition in `STOP_CONDITIONS.md` is active.

`PROPOSED` means proposed, not approved. The presence of an item in a roadmap, registry, issue, design, branch, or draft PR does not authorize implementation. The Orchestrator may draft and refine a proposed PRD, but it may not implement it, promote it to `APPROVED`, or treat dependencies as waived without the required human authorization.

PRD state changes must be explicit and recorded in the PRD registry. Standing authority may progress from one completed PRD only to another PRD already marked `APPROVED`; completion never auto-approves the next PRD.

## Actions authorized without routine human approval

Within the boundary above, the Orchestrator may autonomously:

- create branches and isolated worktrees;
- decompose the approved PRD and dispatch appropriately scoped sub-agents;
- create technical designs and execution plans;
- freeze reversible contracts through the established contract process;
- implement the approved scope and write or update its tests;
- create and validate migrations expressly authorized by the current PRD;
- make or revise reversible engineering decisions within the approved architecture;
- refactor inside the approved architecture when needed to deliver or safely maintain the approved scope;
- reject incomplete, unsafe, out-of-scope, or low-quality sub-agent work;
- run review, correction, and verification loops;
- open PRs and keep their descriptions and technical documentation accurate;
- merge routine PRs that satisfy every condition in this charter's autonomous merge policy; and
- move to the next dependency-ready PRD only when it is already `APPROVED`.

The Orchestrator must not request human approval merely because two reasonable implementation options exist. It chooses the simplest reversible option consistent with current governance, records material reasoning where future maintainers need it, and preserves a practical rollback path.

Standing authority does not permit the Orchestrator to change the product thesis, approve roadmap scope, spend unapproved money, invent credentials, settle material legal or privacy policy, fabricate human perception results, lower an acceptance threshold, bypass a release gate, or make an irreversible decision outside an approved mandate.

## Execution model

Substantial approved work follows a dependency-aware sequence:

```text
PRD and, when appropriate, Technical Design
                 ↓
          Pre-flight review
                 ↓
        Executable contracts frozen
                 ↓
     Isolated implementation workstreams
                 ↓
              Integration
                 ↓
           Automated tests
                 ↓
      Independent Reviewer Agent
                 ↓
             QA / Security
                 ↓
             Correction
                 ↓
        Re-review when required
```

Parallel work is permitted only when ownership and contract dependencies are isolated. Agent count is chosen for safe throughput, not maximized. When Web, API, and Data work share a contract, the executable contract in `packages/schemas` is frozen before dependent implementation begins; `docs/contracts` remains its human registry.

Optional specialists such as Body Intelligence, Digital Twin, Movement, Training Intelligence, Computer Vision, Data/Analytics, and Security agents are instantiated only when an approved PRD has a concrete need for them.

## No self-approval

The builder of a change may not be its only reviewer and may not satisfy the independent-review gate by restating its own conclusions. At minimum, a routine feature flow is:

```text
Builder → automated tests → independent reviewer → QA/Security → correction → re-review if needed
```

The independent reviewer inspects the actual code, diff, tests, contracts, migrations, CI, and documentation. Where practical, the reviewer works in a separate context after integration and does not inherit the builder's rationale as presumed fact. Builder reports are evidence to verify, not approval.

The Orchestrator may coordinate the process and merge a qualifying change, but it may not replace the independent review with its own implementation judgment or silently dismiss a finding.

## Correction loop and architecture stop

Findings are corrected, relevant gates are rerun, and changed behavior is independently re-reviewed. A normal loop is:

```text
Implementation → Review Round 1 → Correction → Tests → Review Round 2
```

A meaningful correction round includes a concrete review, a substantive response to its findings, and rerun evidence; renaming a round or making cosmetic edits does not reset the count. If significant architectural instability remains after three meaningful correction rounds, the Orchestrator must stop the affected delivery and return:

```text
ARCHITECTURE_DECISION_REQUIRED
```

It must report the unresolved conflict, alternatives, evidence, consequences, and recommended decision. It may not keep patching, weaken architecture criteria, or split the same defect into new labels to avoid this stop. If resolving the architecture conflict would also make a founder-level product decision, `FOUNDER_DECISION_REQUIRED` applies as defined in `STOP_CONDITIONS.md`.

## Autonomous merge policy

A routine PR may be autonomously merged only when every condition below is evidenced for its reviewed head:

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

In addition:

- the PR must be mergeable and the reviewed head must not have changed after the evidence was produced;
- branch protection and required checks must not be bypassed;
- the independent reviewer must have inspected the real change and issued no unresolved `BLOCKER` or `HIGH` finding;
- each `MEDIUM` finding must either be fixed or explicitly deferred with rationale, owner or tracking reference, and impact recorded;
- `LOW` findings may be deferred and recorded when useful; and
- any external gate required by the PRD or release plan must have passed.

These conditions are conjunctive. No agent may silently reinterpret `ALL` as a risk-weighted majority, lower a threshold because of deadlines, substitute a builder attestation for independent evidence, or merge while a required signal is missing or stale. A failing or unavailable required gate is not a pass.

## Completion definition

A PRD may move to `COMPLETED` only when all of the following are true:

```text
Acceptance criteria met
BLOCKER = 0
HIGH = 0
CI = GREEN
Independent Reviewer = PASS
Security = PASS
QA = PASS
Architecture = PASS
Required documentation = UPDATED
Relevant PRs = MERGED
Required external gate = PASS, when applicable
```

Completion is based on repository and review evidence, not a builder summary. A partially delivered, deferred, or threshold-reduced outcome remains incomplete unless the PRD is explicitly re-authorized with changed acceptance criteria by the appropriate decision-maker.

## Evidence and engineering honesty

Delivery reports must state what was tested, the reviewed head, gate results, unresolved findings, deferred findings, known limitations, and relevant rollback or recovery constraints. They must distinguish observed facts from estimates and assumptions.

The control plane must never claim or imply `100% bug-free`, `zero possible production defects`, `perfect security`, or equivalent certainty. The permitted evidence-based form is:

```text
0 known BLOCKER
0 known HIGH
all required gates passing
known limitations documented
```

Passing gates reduces known risk; it does not prove the absence of defects, security weaknesses, or operational failure modes.

## Reversible and irreversible decisions

A reversible decision has a bounded blast radius, a documented or obvious rollback, no material unapproved external commitment, and no change to the founder's product thesis or a person's consequential rights. The Orchestrator makes these decisions autonomously within an approved PRD.

When reversibility is uncertain, the Orchestrator evaluates data migration consequences, user impact, external commitments, privacy and safety implications, and rollback feasibility. It must not label a decision reversible merely because code can be reverted. Decisions that activate a stop condition are governed by `STOP_CONDITIONS.md`.

## Limitations of autonomous delivery

Autonomous delivery does not replace human product authority, legal accountability, professional judgment, subjective user validation, or independent release evidence. It cannot guarantee product-market fit, human-perceived quality, scientific validity, safety, security, or freedom from defects. The Orchestrator may prepare evidence and recommendations in these areas, but it may not fabricate approval or exceed the standing authority defined here.

# Product Requirements Documents

This directory is the roadmap registry and future home of detailed Fitness OS Product Requirements Documents (PRDs). [PRD_REGISTRY.md](PRD_REGISTRY.md) records PRD 00–25, their lifecycle states, dependencies, external-gate expectations, likely primary agents, and intended outcomes. [MASTER_EXECUTION_PLAN.md](../execution/MASTER_EXECUTION_PLAN.md) presents the dependency DAG and safe execution waves.

## Authority and authorization

All PRDs must comply with the repository-level [Product Principles](../../PRODUCT_PRINCIPLES.md), accepted ADRs, frozen contracts, and execution governance. `PRODUCT_PRINCIPLES.md` remains the single product constitution; PRDs apply it and do not redefine it.

Registry presence is planning metadata, not implementation authorization. In particular, **`PROPOSED` is not authorization**. The Orchestrator may progress autonomously only among `APPROVED` PRDs whose dependencies and gates permit execution.

## Lifecycle states

| State | Meaning |
| --- | --- |
| `PROPOSED` | Roadmap candidate awaiting explicit approval. No design, contract, migration, implementation, or release authority is granted. |
| `APPROVED` | Explicitly authorized for execution, subject to dependencies, stop conditions, and release gates. |
| `IN_PROGRESS` | Approved PRD is actively in design or implementation. |
| `IN_REVIEW` | Implementation is integrated and undergoing independent review, QA/security, correction, or merge gates. |
| `BLOCKED` | Work cannot safely continue until a stated dependency, gate, or authorized decision is resolved. |
| `COMPLETED` | Acceptance criteria and all applicable completion and release gates have passed, required PRs are merged, and documentation is current. |
| `SUPERSEDED` | Replaced by an explicitly identified later decision or PRD; it is not executable and its historical record remains. |

A state transition must be explicit and auditable. `PROPOSED → IN_PROGRESS` is invalid; approval is required first. `COMPLETED` requires acceptance criteria met, zero known `BLOCKER`, zero known `HIGH`, green CI, independent reviewer pass, security pass, QA pass, architecture pass, updated required documentation, merged relevant PRs, and any applicable external gate.

## Just-in-time detailed PRD

The registry deliberately does not invent 25 detailed specifications. Before an approved registry entry is executed, the Orchestrator must create or verify a detailed PRD containing:

- Context
- Problem
- User
- Outcome
- Scope
- Non-scope
- UX
- Business rules
- Data
- Contracts
- Security/privacy
- Failure modes
- Acceptance criteria
- Metrics
- Technical constraints
- Dependencies
- Release gate

A Technical Design is added when the scope warrants one. A substantial PRD may receive independent pre-flight review of the PRD, Technical Design, contracts, and migration plan before implementation. Shared executable contracts are frozen first in `packages/schemas`; `docs/contracts` remains the human registry and freeze layer.

Detailed PRDs must preserve PWA-first delivery, student mobile-first and coach desktop-friendly experiences, human approval for consequential training decisions, measured-versus-estimated provenance, immutable history, privacy by default, evidence integrity, deterministic-before-generative behavior, provider adapters, explicit APIs, and earned complexity.

Native iOS and Apple Watch are not part of the Pilot V1 target. Form Intelligence remains conditional on the PRD 22 POC gate.

# ADR 006 — Autonomous Delivery Control Plane

- Status: Accepted
- Date: 2026-08-16

## Context

Fitness OS needs a repeatable path from an approved roadmap item to reviewed, tested, and integrated software without requiring founder approval for ordinary reversible engineering decisions. Unbounded autonomy would be unsafe: a builder could review its own work, weaken acceptance criteria, conceal material uncertainty, or advance an unapproved product direction.

## Decision

Adopt the [Autonomous Delivery Control Plane](../execution/README.md). The Orchestrator receives standing authority to decompose and execute only `APPROVED` PRDs, coordinate isolated agents, make reversible technical decisions within established architecture, run correction loops, open pull requests, and merge routine changes only when every required merge gate passes.

The builder may not be the only reviewer. [Agent 90 — Adversarial Reviewer](../execution/REVIEWER_AGENT.md) independently inspects the real change and evidence. Known `BLOCKER` or `HIGH` findings prohibit autonomous merge. Architecture, QA, security, scope, contract, migration-when-applicable, documentation, and green-CI gates are conjunctive rather than optional.

Autonomous execution pauses only for the categories defined in [Stop Conditions](../execution/STOP_CONDITIONS.md), including founder-level product decisions, credentials, financial commitments, consequential legal/privacy decisions, failed technology validation, required human perception, and safety-critical uncertainty. Ordinary reversible engineering problems remain the Orchestrator's responsibility.

Major milestones use the external red-team gates defined in [Release Gates](../execution/RELEASE_GATES.md). The founder intervenes by approving product direction, supplying unavailable authority or resources, deciding an enumerated stop condition, or explicitly overriding an external gate—not by approving every routine engineering pull request.

## Alternatives considered

- Human approval for every pull request: rejected because it turns routine engineering into a founder bottleneck.
- Fully unconstrained autonomous delivery: rejected because it erases product authorization, independence, and safety boundaries.
- Builder self-certification: rejected because tests and author reports do not provide independent challenge.

## Consequences

Approved work can progress continuously while preserving explicit product authorization and auditable merge evidence. The Orchestrator must maintain accurate PRD state, independent review, correction history, and gate results. `PROPOSED` never means approved.

Autonomous software delivery remains limited: it cannot guarantee zero defects or perfect security, fabricate human perception or legal decisions, provide missing credentials, or silently lower a failed acceptance threshold. Status claims must remain evidence-based and identify known limitations.

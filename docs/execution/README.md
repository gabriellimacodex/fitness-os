# Autonomous Delivery Control Plane

This directory defines how Fitness OS may deliver work autonomously after a product requirements document (PRD) has been explicitly approved. It governs execution; it does not approve product work by itself.

## Authority and activation

[`PRODUCT_PRINCIPLES.md`](../../PRODUCT_PRINCIPLES.md) remains the product constitution. Accepted [architecture decisions](../adr/), the current `APPROVED` PRD, and frozen [contracts](../contracts/README.md) constrain every implementation.

The roadmap is recorded in the [Master Execution Plan](MASTER_EXECUTION_PLAN.md), and PRD state is recorded in the [PRD Registry](../prds/PRD_REGISTRY.md). PRD 00 is `COMPLETED`; PRDs 01–25 are `PROPOSED`. A `PROPOSED` entry is planning information, not implementation authority. This control-plane change does not activate autonomous product execution. A subsequent explicit command must approve the intended PRD or execution plan before work begins.

## Control documents

- [Master Execution Plan](MASTER_EXECUTION_PLAN.md) — capability DAG, dependencies, sequencing, and safe research lanes.
- [Autonomous Delivery Charter](AUTONOMOUS_DELIVERY_CHARTER.md) — standing authority, merge policy, correction loop, and completion rules.
- [Stop Conditions](STOP_CONDITIONS.md) — the limited situations that require founder or human action.
- [Release Gates](RELEASE_GATES.md) — PR, capability, external red-team, and Pilot Release Candidate gates.
- [Reviewer Agent](REVIEWER_AGENT.md) — the independent Agent 90 adversarial review model.
- [PRD governance](../prds/README.md) and [registry](../prds/PRD_REGISTRY.md) — required PRD content, states, and authorization boundary.

Execution also follows the repository [agent instructions](../../AGENTS.md) and [multi-agent protocol](../../MULTI_AGENT_PROTOCOL.md). If documents conflict, follow the authority hierarchy in `AGENTS.md` and stop on a material unresolved conflict.

## Evidence standard

Autonomous delivery reports evidence, known findings, and documented limitations. It never claims perfect security, zero possible defects, or that automated checks prove more than they test.

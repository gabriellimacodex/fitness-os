# Agent Instructions

Read this file before editing the repository.

## Authority hierarchy

1. `PRODUCT_PRINCIPLES.md`
2. Accepted ADRs in `docs/adr/`
3. The current `APPROVED` PRD in `docs/prds/`
4. The current epic specification in `docs/epics/`, when applicable
5. Frozen contracts in `docs/contracts/`
6. The individual agent task

A lower-level instruction may not violate a higher-level decision. Stop and report the conflict instead of improvising.

## Authorization boundary

Follow the [Autonomous Delivery Control Plane](docs/execution/README.md). Standing authority applies only to a current `APPROVED` PRD. A `PROPOSED` roadmap entry never authorizes implementation. PRDs 00–02 are complete; PRDs 03 and 21 are blocked by recorded `ARCHITECTURE_DECISION_REQUIRED` stops; PRD 04 is in progress; PRDs 05–20 and 22–24 remain approved under Autonomous Pilot V1 authorization; PRD 25 remains proposed and must not begin without separate explicit authorization.

The Next.js application is PWA-ready; it is not a full offline-capable PWA. A service worker, offline cache, icon matrix, and advanced install experience remain deferred.

## Required working model

- Follow `MULTI_AGENT_PROTOCOL.md` and its non-overlapping ownership matrix.
- Use an isolated Git worktree for concurrent implementation.
- Modify only files assigned to the agent. Request explicit Orchestrator reassignment before crossing an ownership boundary.
- The implementer who owns a path also owns tests colocated inside that path. QA/Security does not automatically own another implementer's tests.
- Treat every path listed as Orchestrator-coordinated shared ownership in the protocol accordingly.
- Freeze shared contracts before dependent implementations proceed in parallel. Executable contracts live in `packages/schemas`; `docs/contracts` is their human registry and freeze layer.
- Use Node.js `24.18.0` and pnpm `10.24.0`. Enable Corepack and use the repository-pinned pnpm; do not generate a lockfile with another pnpm version.
- Avoid drive-by refactors and unrequested dependency changes.
- Never commit secrets. Stop and report any secret, data-loss risk, conflicting migration, architectural conflict, or contract change that lacks authorization.
- End work with the `AGENT HANDOFF` format defined in the protocol.
- The builder may not be the only reviewer. Use [Agent 90](docs/execution/REVIEWER_AGENT.md) and the release process for independent review.
- Autonomous merge is permitted only under the [charter](docs/execution/AUTONOMOUS_DELIVERY_CHARTER.md) when every required gate passes. Passing gates never authorizes a `PROPOSED` PRD.
- Stop for the enumerated [human-intervention conditions](docs/execution/STOP_CONDITIONS.md), not for ordinary reversible engineering decisions.

## Architecture guardrails

- Browser/PWA, future native clients, and other future clients consume the same Fastify API.
- Next.js is not the canonical backend-for-frontend. Web code, including Server Components, must not import the database package or bypass Fastify for persistence access.
- Runtime workspace packages follow `src → build → dist → package exports`.
- ESLint enforces selected import boundaries. Ownership, contract freeze, worktree use, provider abstraction, and broader architectural intent remain governance-reviewed boundaries; passing lint does not prove the architecture.

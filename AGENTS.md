# Agent Instructions

Read this file before editing the repository.

## Authority hierarchy

1. `PRODUCT_PRINCIPLES.md`
2. Accepted ADRs in `docs/adr/`
3. The current epic specification in `docs/epics/`
4. Frozen contracts in `docs/contracts/`
5. The individual agent task

A lower-level instruction may not violate a higher-level decision. Stop and report the conflict instead of improvising.

## Current scope

Epic 00 creates engineering infrastructure only. Do not implement authentication, real users, student or coach profiles, body scans or photos, measurements, digital twins, real exercises, workout or training engines, runtime AI, Apple integrations, movement/form intelligence, computer vision, evolution features, payments, notifications, or any product feature.

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
- Passing gates does not authorize merge or the next epic.

## Architecture guardrails

- Browser/PWA, future native clients, and other future clients consume the same Fastify API.
- Next.js is not the canonical backend-for-frontend. Web code, including Server Components, must not import the database package or bypass Fastify for persistence access.
- Runtime workspace packages follow `src → build → dist → package exports`.
- ESLint enforces selected import boundaries. Ownership, contract freeze, worktree use, provider abstraction, and broader architectural intent remain governance-reviewed boundaries; passing lint does not prove the architecture.

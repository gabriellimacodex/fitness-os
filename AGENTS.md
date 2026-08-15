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

## Required working model

- Follow `MULTI_AGENT_PROTOCOL.md`.
- Use an isolated Git worktree for concurrent implementation.
- Respect file ownership and request orchestration approval before crossing it.
- Treat root package files, the lockfile, TypeScript/ESLint configuration, CI, and workspace configuration as orchestrator-coordinated shared files.
- Freeze shared contracts before dependent implementations proceed in parallel.
- Avoid drive-by refactors and unrequested dependency changes.
- Never commit secrets. Stop and report any secret, data-loss risk, conflicting migration, architectural conflict, or contract change that lacks authorization.
- End work with the `AGENT HANDOFF` format defined in the protocol.
- Passing gates does not authorize merge or the next epic.

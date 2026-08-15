# Epic 00 — Engineering & Multi-Agent Bootstrap

## Context

Fitness OS needs an engineering factory before product implementation begins. The repository starts with a PWA-first direction, a client-independent backend, and a target of roughly four safe parallel agents.

## Objective

Create a minimal, verified monorepo foundation with explicit boundaries, ownership, contracts, CI, tests, governance documents, worktree practices, handoffs, and controlled integration.

## Scope

- pnpm and strict TypeScript workspace
- Minimal Next.js Foundation screen and shared UI proof
- Minimal Fastify `GET /health` endpoint
- Compileable config, schema, domain, database, and UI package boundaries
- PostgreSQL/Drizzle preparation without infrastructure or product tables
- ESLint, Prettier, Vitest, root scripts, lockfile, and CI
- Product principles, ADRs, architecture, contracts, and multi-agent protocol
- Secret-safe environment baseline and independent QA/security review

## Non-scope

All product features are excluded, including authentication, real users and profiles, body data or scans, photos and measurements, digital twins, real exercise/training functionality, runtime AI, Apple integrations, form or movement intelligence, computer vision, evolution features, payments, and notifications. Epic 01 is not started.

## Architecture

A PWA-ready Next.js client consumes a standalone Fastify API through explicit contracts. The API will later coordinate domain/services, PostgreSQL, object storage, and provider adapters. This epic implements only boundary proofs.

## Acceptance criteria

- Workspace installs from a committed frozen pnpm lockfile.
- Web build renders only the prescribed Foundation content.
- API health injection returns 200 and `{"status":"ok"}`.
- Every baseline package compiles with strict TypeScript.
- `lint`, `format:check`, `typecheck`, `test`, `build`, and `check` pass.
- CI performs one install followed by all required checks and build.
- Required governance and architecture documents exist and agree.
- No secret or product feature is committed.
- Work occurs on `chore/epic-00-bootstrap`, is pushed, and becomes an unmerged PR to `main`.

## Definition of Done

All acceptance criteria pass locally, CI is configured, an independent scope/security review has no unresolved blocker, the branch is pushed, and a pull request is open for external red-team review. Merge and the next epic remain human decisions.

## Result

Expected outcome: a small engineering foundation that supports controlled parallel implementation without claiming any product functionality.

# Fitness OS

Fitness OS is planned as a mobile-first PWA for students and a desktop-friendly web application for coaches. This repository contains the completed Epic 00 engineering foundation and its delivery governance; it does not contain product features.

## Status

**Epic 00 — Engineering & Multi-Agent Bootstrap is complete.** PRDs 01–25 are roadmap proposals and are not authorized for implementation. The autonomous delivery control plane becomes executable for product work only after a subsequent explicit command approves an intended PRD.

## Stack

- pnpm TypeScript monorepo
- Next.js App Router and React for `apps/web`
- Fastify for `apps/api`
- PostgreSQL-ready Drizzle ORM foundation, without a live database
- Zod for shared contracts
- Vitest for automated tests
- ESLint and Prettier for quality checks

Node.js `24.18.0` is pinned in `.nvmrc`, and pnpm `10.24.0` is pinned through `packageManager`. Corepack is required so local agents and CI use the same package-manager release and do not silently rewrite the lockfile with another pnpm version.

## Repository structure

```text
apps/
  web/          Next.js Foundation screen
  api/          Fastify health endpoint
packages/
  config/       Shared tooling foundation
  schemas/      Shared technical contracts
  domain/       Domain package boundary (empty of product domain)
  database/     PostgreSQL and Drizzle foundation
  ui/           Minimal shared UI used by the web app
docs/
  product/      Product documentation index
  architecture/ Architecture overview
  adr/          Accepted architecture decisions
  epics/        Versioned epic specifications
  contracts/    Contract-first coordination rules
  execution/    Autonomous authority, review, stop, and release gates
  prds/         PRD governance and roadmap registry
```

## Prerequisites

- Node.js 24.18.0 (`nvm use`)
- pnpm 10.24.0 through Corepack

## Install and develop

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The web and API development processes run together. Their local URLs are printed by the respective tools.

## Quality and tests

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check` runs lint, formatting verification, type checking, and tests. CI also performs a production build. The web typecheck runs `next typegen` before no-emit TypeScript validation so route types are deterministic in a clean checkout. The current automated tests are smoke tests for narrow baseline behavior; they do not prove complete runtime behavior or architectural compliance. The production Next.js build remains the authoritative production framework gate.

## Architecture

The PWA/browser, future native clients, and other future clients consume the same Fastify API through explicit contracts. Next.js is a client application, not the canonical backend-for-frontend. Web code, including Server Components, never accesses the database directly. The API owns access to domain services, persistence, object storage, and external provider adapters; important rules do not live in React components, and provider-specific details do not leak into the domain.

Runtime workspace packages follow `src → build → dist → package exports`. Executable shared contracts are Zod schemas in `packages/schemas`; `docs/contracts` is the human registry and freeze layer.

See [the architecture overview](docs/architecture/README.md) and the accepted ADRs in [`docs/adr`](docs/adr/).

## Multi-agent engineering

All agents must read [AGENTS.md](AGENTS.md), follow [the multi-agent protocol](MULTI_AGENT_PROTOCOL.md), work in isolated worktrees when concurrent, respect ownership, and freeze shared contracts before coupled work begins. Integration requires architecture, build, type, lint, test, security, and scope gates plus independent review.

The [Autonomous Delivery Control Plane](docs/execution/README.md) defines standing authority for `APPROVED` PRDs, limited human [stop conditions](docs/execution/STOP_CONDITIONS.md), the independent [Reviewer Agent](docs/execution/REVIEWER_AGENT.md), and progressive [release gates](docs/execution/RELEASE_GATES.md). The [PRD Registry](docs/prds/PRD_REGISTRY.md) records state; `PROPOSED` never means approved. Routine merges require every charter gate, including green CI and zero known `BLOCKER` or `HIGH` findings.

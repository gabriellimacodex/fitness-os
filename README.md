# Fitness OS

Fitness OS is planned as a mobile-first PWA for students and a desktop-friendly web application for coaches. This repository currently contains only the Epic 00 engineering foundation; it does not contain product features.

## Status

**Epic 00 — Engineering & Multi-Agent Bootstrap.** The repository is establishing the factory that will build the product. Starting another epic automatically is prohibited.

## Stack

- pnpm TypeScript monorepo
- Next.js App Router and React for `apps/web`
- Fastify for `apps/api`
- PostgreSQL-ready Drizzle ORM foundation, without a live database
- Zod for shared contracts
- Vitest for automated tests
- ESLint and Prettier for quality checks

Node.js 24 LTS is pinned in `.nvmrc`. This LTS line is supported by the selected framework and CI tooling while avoiding a non-LTS runtime.

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
```

## Prerequisites

- Node.js 24 LTS (`nvm use`)
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

`pnpm check` runs lint, formatting verification, type checking, and tests. CI also performs a production build.

## Architecture

The browser communicates with the Next.js application, which consumes the Fastify API through explicit contracts. The API owns access to domain services, persistence, object storage, and external provider adapters. Web code never accesses the database directly, important rules do not live in React components, and provider-specific details do not leak into the domain.

See [the architecture overview](docs/architecture/README.md) and [ADR 001](docs/adr/001-foundation-architecture.md).

## Multi-agent engineering

All agents must read [AGENTS.md](AGENTS.md), follow [the multi-agent protocol](MULTI_AGENT_PROTOCOL.md), work in isolated worktrees when concurrent, respect ownership, and freeze shared contracts before coupled work begins. Integration requires architecture, build, type, lint, test, security, and scope gates plus an independent review when possible.

Completing an epic never authorizes an agent to begin the next one. Epic 01 can start only after external red-team review, human approval, merge, and an explicit new task.

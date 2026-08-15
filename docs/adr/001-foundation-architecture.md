# ADR 001 — Foundation Architecture

- Status: Accepted
- Date: 2026-08-15

## Context

Fitness OS needs a simple web-first baseline that supports independently evolving clients and backend capabilities without premature infrastructure.

## Decision

Use a pnpm TypeScript monorepo. The first client is a PWA-ready Next.js App Router application. The API is an independent Fastify application. Future persistence uses PostgreSQL through Drizzle ORM and Drizzle Kit. Shared validation uses Zod, and the test baseline uses Vitest.

Adopt Node.js 24 LTS because it is an actively supported LTS line compatible with the selected stack. Do not add Turborepo until task orchestration demonstrates a concrete need.

## Alternatives considered

- Native-first clients: rejected until native capabilities earn their cost.
- A single Next.js full-stack application: rejected because the backend must remain client-independent.
- Microservices: rejected as unearned complexity.
- npm or Yarn workspaces: viable, but pnpm is selected for explicit workspace handling and efficient installs.
- Prisma: viable, but Drizzle is selected for a lightweight SQL-oriented persistence layer.

## Consequences

The repository has explicit app/package boundaries and one dependency graph. Shared contracts can be versioned centrally, while deployment topology remains a future decision.

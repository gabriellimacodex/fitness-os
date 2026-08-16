# ADR 004 — Client/API Topology

- Status: Accepted
- Date: 2026-08-16

## Context

Fitness OS needs one backend contract that can serve the PWA and future clients. Server-side execution in Next.js must not become an accidental path around the API boundary.

## Decision

The canonical topology is:

```text
PWA / Browser ───────┐
Future Native Client ├─→ Fastify API → Domain / Services → Persistence / Providers
Other Future Clients ┘
```

Next.js is a client application, not the canonical backend-for-frontend. Web code never accesses PostgreSQL directly. A Next Server Component receives no permission to import `@fitness-os/database` merely because it executes server-side. Future native and other clients consume the same Fastify API.

Epic 00 freezes and enforces boundaries only; it does not add CORS, authentication, product APIs, or deployment topology.

## Consequences

Client-specific rendering remains in the client, while business behavior and persistence access remain behind Fastify and backend boundaries. ESLint enforces selected prohibited imports. API completeness, provider abstraction, and adherence by future code remain governance and review responsibilities.

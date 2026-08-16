# Architecture Overview

The baseline keeps the backend independent from every client and important external systems behind adapters.

```text
PWA / Browser ───────┐
Future Native Client ├─→ Fastify API → Domain / Services → Persistence / Providers
Other Future Clients ┘
```

The Next.js application is the first PWA-ready client; it is not the canonical backend-for-frontend. Browser and server-rendered web code consume the Fastify API through explicit contracts. Web code never imports the database package or accesses PostgreSQL directly, including from a Server Component. Important business rules belong in domain/services rather than React components. Persistence and external providers are reached only through backend boundaries, with provider details behind adapters.

Runtime workspace packages use a uniform dist-first lifecycle:

```text
src → build → dist → package exports
```

The executable Source of Truth for shared API and data contracts is Zod code in `packages/schemas`. `docs/contracts` is the human registry and freeze layer, not a second executable definition.

## Enforcement boundary

ESLint machine-enforces selected prohibited imports between web, API, domain, database, UI, and framework packages. Builds verify emitted package resolution, and smoke tests verify narrow baseline behaviors. The client/API topology, provider abstraction, ownership, contract authorization, and broader architectural intent remain governance-reviewed; lint, builds, and smoke tests do not prove the architecture in full.

Epic 00 implements only the Foundation screen, a health endpoint, package boundaries, and local tooling. The web is PWA-ready, not a full offline-capable PWA. Object storage, live database connections, providers, product domain, service workers, and offline caching are future concerns.

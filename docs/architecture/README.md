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

## Platform HTTP boundary

The API exposes separate liveness (`GET /health`) and readiness (`GET /ready`) signals. Liveness reports that the process responds; readiness evaluates an injected dependency check and can return unavailable without disclosing dependency internals. The API generates correlation identifiers, publishes them through `x-request-id`, and uses the same identifier in schema-backed public error envelopes. Client-provided request identifiers are not trusted or reflected.

Browser access uses an explicit API-owned CORS allowlist with credentials disabled. Requests without an Origin header remain valid for probes and server-to-server traffic. The web API client validates both successful platform responses and public failures through schemas from `packages/schemas`; malformed responses fail closed as protocol errors.

## Enforcement boundary

ESLint machine-enforces selected prohibited imports between web, API, domain, database, UI, and framework packages. Builds verify emitted package resolution, and smoke tests verify narrow baseline behaviors. The client/API topology, provider abstraction, ownership, contract authorization, and broader architectural intent remain governance-reviewed; lint, builds, and smoke tests do not prove the architecture in full.

The current foundation includes the Foundation screen, platform HTTP contracts, package boundaries, and local tooling. The web is PWA-ready, not a full offline-capable PWA. Authentication, object storage, live database connections, product domain, service workers, and offline caching belong to later approved PRDs.

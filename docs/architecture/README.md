# Architecture Overview

The baseline keeps the backend independent from its client and important external systems behind adapters.

```text
Browser / PWA
     ↓
Web Application (Next.js)
     ↓ explicit API contracts
Fastify API
     ↓
Domain / Services
     ↓
PostgreSQL | Object Storage | External Provider Adapters
```

The web application never accesses the database directly. Important business rules belong in domain/services rather than React components. PostgreSQL, object storage, and external providers are reached from backend boundaries, and provider-specific details remain behind interfaces/adapters.

Epic 00 implements only the Foundation screen, a health endpoint, package boundaries, and local tooling. Object storage, real database connections, providers, and product domain are future concerns.

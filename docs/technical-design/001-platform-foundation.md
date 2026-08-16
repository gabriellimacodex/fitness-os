# Technical Design 001 — Platform Foundation

## Status and authority

- Status: Approved after Agent 90 pre-flight Round 2
- PRD: [PRD 01 — Platform Foundation](../prds/001-platform-foundation.md)
- Architecture: existing modular monolith and Fastify client/API topology

## Design summary

PRD 01 adds a narrow HTTP platform layer around the existing Fastify application. Executable schemas are frozen first, then API and web consumers implement against them in isolated ownership boundaries.

```text
packages/schemas (frozen HTTP contracts)
          │
          ├──────────────┐
          ↓              ↓
apps/api platform     apps/web API client
          │              │
          └──────┬───────┘
                 ↓
       integration + QA/review
```

## Components

### Shared schemas

`packages/schemas` exports:

- readiness success and unavailable response variants;
- stable API error codes and the public error envelope;
- inferred TypeScript types.

Zod remains the only executable Source of Truth. The human contract registry references these symbols.

### API platform

`apps/api` adds:

- an injected readiness check with the exact signature `() => boolean | Promise<boolean>` and a default in-process `true` result;
- a `/ready` route that maps check success to 200 and failure/exception to 503 without exposing dependency details;
- centralized not-found and error handlers that emit the shared error envelope;
- a response hook that publishes Fastify's request identifier as `x-request-id`;
- `@fastify/cors` configured from a parsed comma-separated `CORS_ALLOWED_ORIGINS` environment value, with credentials disabled.

`buildApp` receives explicit platform options for tests and composition. Bootstrap owns environment parsing and passes the resulting CORS allowlist. Business/domain logic is not added.

Fastify's client request-ID header option remains disabled. The API always uses Fastify's server-generated `request.id`; it never accepts or reflects a client-supplied request identifier. The response header and error envelope copy only that generated value.

Readiness mapping is exact:

| Check outcome               | HTTP | Payload                                        |
| --------------------------- | ---- | ---------------------------------------------- |
| resolves or returns `true`  | 200  | ready variant                                  |
| resolves or returns `false` | 503  | not-ready variant                              |
| throws or rejects           | 503  | not-ready variant; exception logged internally |

No dependency name, exception message, or stack is included in the response.

### Web API client

`apps/web` adds a small `createApiClient` factory. It accepts an explicit base URL and optional injected `fetch`, performs URL-safe path resolution, validates known successful payloads, validates the shared error envelope for failures, and throws a typed protocol error. It does not access persistence or add UI.

## Request and failure flow

```text
request
  → Fastify request ID
  → explicit CORS decision
  → route / validation / handler
  → schema-backed response
  → x-request-id response header

failure
  → centralized mapping
  → public stable code + safe message + request ID
  → internal error logged with existing redaction
```

## Configuration

- `HOST` and `PORT` retain their existing validated behavior.
- `CORS_ALLOWED_ORIGINS` is optional, comma-separated, trimmed, deduplicated, and defaults to `http://localhost:3000` for local development.
- Empty entries and invalid absolute HTTP(S) origins fail startup configuration validation.
- No credentials are stored in the setting.

`.env.example` documents the local non-secret value.

## Contract freeze and waves

1. Wave 1 — schemas, contract registry, and architecture documentation.
2. Wave 2 — API platform and web client proceed in parallel after the contract commit.
3. Wave 3 — integration, all gates, Agent 90, and independent QA/security.

Write ownership remains consistent with `MULTI_AGENT_PROTOCOL.md`. Shared root files and contracts are Orchestrator-coordinated.

## Test strategy

Every behavior follows one-test Red → minimal Green → refactor:

- schema parsing for every readiness/error variant;
- readiness 200/503 and exception containment;
- not-found, validation, and unexpected-error mapping;
- request-ID header/body correlation;
- CORS allowed/disallowed/no-origin behavior;
- environment parsing defaults and rejection cases;
- web client valid success, typed API failure, malformed success, and malformed failure behavior.

Integration uses Fastify injection and injected fetch/check functions; no live port, external service, database, or credential is required.

## Security and privacy review points

- Verify errors cannot serialize raw exception details.
- Verify logs retain authorization-header redaction.
- Verify CORS never enables wildcard credentials.
- Verify request IDs are server-generated and client-supplied candidates are never reflected.
- Verify client protocol errors do not echo arbitrary response bodies.

## Migration and rollback

No database migration applies. Rollback is a code revert of the platform contracts and consumers before downstream PRDs consume them. Once a later PRD consumes a frozen contract, changes follow the established coordinated contract process rather than unilateral rollback.

## Alternatives considered

- Ad hoc route-local errors: rejected because clients would depend on implicit behavior.
- A generated OpenAPI client now: deferred because the current surface is too small to justify generation infrastructure.
- Live database readiness in PRD 01: deferred until a PRD introduces an authorized database connection.
- A generic shared runtime-config framework: rejected because API and browser environments have different trust boundaries and current needs are narrow.

## Known limitations

- Readiness initially represents an injected platform check and has no live external dependency.
- The web client covers only platform endpoints until later PRDs add frozen product contracts.
- This design improves known failure consistency but does not prove the absence of defects or security weaknesses.

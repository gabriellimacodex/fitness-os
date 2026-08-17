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
- centralized malformed-URL, not-found, parser/validation, and unexpected-error
  handling that emits the shared error envelope;
- a response hook that publishes Fastify's request identifier as `x-request-id`;
- `@fastify/cors` configured from a parsed comma-separated `CORS_ALLOWED_ORIGINS` environment value, with credentials disabled.

`buildApp` receives explicit platform options for tests and composition. Bootstrap owns environment parsing and passes the resulting CORS allowlist. Business/domain logic is not added.

Fastify's client request-ID header option remains disabled and `buildApp`
overrides any conflicting passthrough option. The API always uses an opaque,
server-generated identifier; it never accepts or reflects a client-supplied
request identifier. The response header and error envelope copy only that
generated value, including Fastify's pre-routing malformed-URL path.

Readiness mapping is exact:

| Check outcome                | HTTP | Payload                                        |
| ---------------------------- | ---- | ---------------------------------------------- |
| resolves or returns `true`   | 200  | ready variant                                  |
| any non-literal-`true` value | 503  | not-ready variant                              |
| throws or rejects            | 503  | not-ready variant; exception logged internally |

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
  → malformed URL, recognized Fastify parser/body-limit/validation → 400 BAD_REQUEST
  → all other thrown values, regardless of incidental metadata → 500 INTERNAL_ERROR + log
  → public stable code + safe message + request ID
  → internal error logged with existing redaction
```

Parser/body errors are recognized by Fastify error-class identity. Standard
schema-validation errors are marked in a private per-app `WeakSet` by the
configured schema formatter and recognized by object identity. The app's
`onRoute` policy reapplies that formatter to every route, so route-local options
cannot replace the provenance boundary. Error-controlled fields such as `code`,
`statusCode`, or `validationContext` do not establish client-input provenance.

## Configuration

- `HOST` and `PORT` retain their existing validated behavior.
- `CORS_ALLOWED_ORIGINS` is optional, comma-separated, trimmed, normalized
  through the URL origin serializer, deduplicated, and defaults to
  `http://localhost:3000` for local development.
- Scheme/host casing, a root trailing slash, and default ports are normalized.
  Empty entries and values containing credentials, non-root paths, queries,
  fragments, or invalid/non-HTTP(S) URLs fail startup configuration validation.
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
- malformed-URL, not-found, parser/body-limit, validation, and unexpected-error
  mapping;
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

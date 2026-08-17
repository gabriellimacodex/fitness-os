# Contracts

```text
Executable Source of Truth:
packages/schemas

Human registry:
docs/contracts
```

Zod schemas in `packages/schemas` define executable shared API and data contracts. This directory records their human-readable purpose, ownership, and freeze status; it references those schemas and must never independently redefine them.

A schema modification is a contract modification. Any frozen contract modification requires Orchestrator authorization and coordinated updates to affected consumers, providers, tests, and this registry. Agents may implement coupled components in parallel only after the shared contract is frozen.

## Frozen contract registry

| Contract                          | Executable schema                            | Provider   | Consumers                    | Status |
| --------------------------------- | -------------------------------------------- | ---------- | ---------------------------- | ------ |
| Health response for `GET /health` | `healthResponseSchema` in `packages/schemas` | `apps/api` | Operational checks and tests | Frozen |

### PRD 01 — Platform Foundation

| Contract                            | Executable schema                                                | Provider   | Consumers                                     | Status |
| ----------------------------------- | ---------------------------------------------------------------- | ---------- | --------------------------------------------- | ------ |
| Readiness response for `GET /ready` | `readinessResponseSchema` and its variants in `packages/schemas` | `apps/api` | Operational checks, web API client, and tests | Frozen |
| Public API error codes              | `apiErrorCodeSchema` in `packages/schemas`                       | `apps/api` | Web API client and future clients             | Frozen |
| Public API error envelope           | `apiErrorResponseSchema` in `packages/schemas`                   | `apps/api` | Web API client and future clients             | Frozen |

The platform contracts were frozen before the API provider and web consumer implementation. Provider and consumer tests must validate through these schemas. Public API errors carry the server-generated correlation identifier and must not expose raw exception or dependency details.

The health contract represents an HTTP 200 response whose payload conforms to `healthResponseSchema`. Its API smoke test validates the response through that executable schema. This narrow smoke test demonstrates route/schema compatibility; it does not prove complete runtime behavior or the repository architecture.

### PRD 02 — Student & Coach Domain

| Contract                  | Executable schema                                 | Provider                | Consumers                    | Status |
| ------------------------- | ------------------------------------------------- | ----------------------- | ---------------------------- | ------ |
| Opaque student identity   | `studentIdSchema` / `StudentId`                   | Domain creation service | Domain and database adapters | Frozen |
| Opaque coach identity     | `coachIdSchema` / `CoachId`                       | Domain creation service | Domain and database adapters | Frozen |
| Opaque link identity      | `studentCoachLinkIdSchema` / `StudentCoachLinkId` | Domain creation service | Domain and database adapters | Frozen |
| Student record            | `studentRecordSchema` / `StudentRecord`           | Student repository      | Domain services and tests    | Frozen |
| Coach record              | `coachRecordSchema` / `CoachRecord`               | Coach repository        | Domain services and tests    | Frozen |
| Student-coach link record | `studentCoachLinkSchema` / `StudentCoachLink`     | Link repository         | Domain services and tests    | Frozen |

The three identifiers are distinct nominal UUIDv4 brands and are not
cross-assignable. Record objects are strict. Timestamps use canonical UTC with
millisecond precision, and an ended link must end strictly after it starts.
These data contracts authorize no public route, identity mapping, profile field,
authentication behavior, or deletion policy.

### PRD 03 — Exercise Knowledge Base

| Contract group                   | Executable schemas                                                                       | Provider                          | Consumers                                             | Status |
| -------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- | ------ |
| Catalog identities and lifecycle | Branded ID and lifecycle schemas in `exercise-catalog.ts`                                | Catalog domain/database           | Catalog services, routes, and future frozen consumers | Frozen |
| Taxonomy and provenance          | Taxonomy, provenance, and unassessed-reference schemas in `exercise-catalog.ts`          | Catalog domain/database           | Catalog publication and read providers                | Frozen |
| Exercise reads                   | Summary, detail, immutable revision, and bounded page schemas in `exercise-catalog.ts`   | `apps/api` catalog routes         | API clients and tests                                 | Frozen |
| Catalog route inputs             | Strict list, taxonomy, ID, and revision query/parameter schemas in `exercise-catalog.ts` | `apps/api` catalog routes         | API handlers and clients                              | Frozen |
| Production manifest              | `catalogManifestSchema` / `CatalogManifest`                                              | Deployment-only ingestion command | Catalog ingestion service and Gate A evidence         | Frozen |

All catalog objects are strict and bounded. Public collections use opaque
cursors and never expose an unbounded taxonomy dump. Reference candidates remain
literally `unassessed`; the contracts contain no evidence grade, movement
instruction, training behavior, user data, or public mutation command. The
production manifest is non-empty and contains no generated IDs, caller
timestamps, or hashes; provider logic supplies those values after validation.

### PRD 04 — Movement Library

| Contract                                  | Executable schema                                                                            | Provider                         | Consumers                          | Status |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------- | ------ |
| Movement identity/version                 | `movementIdSchema` and `movementContentVersionSchema`                                        | Movement catalog                 | Domain, API, web client, and tests | Frozen |
| Movement summary/detail                   | `movementSummarySchema` and `movementDetailSchema`                                           | Movement catalog                 | API routes and web rendering       | Frozen |
| `GET /movements` input/output             | `movementEmptyQuerySchema` and `movementListResponseSchema`                                  | `apps/api` movement list route   | Web API client and future clients  | Frozen |
| `GET /movements/:movementId` input/output | `movementDetailParamsSchema`, `movementEmptyQuerySchema`, and `movementDetailResponseSchema` | `apps/api` movement detail route | Web API client and future clients  | Frozen |

Movement objects are strict, text-only, normalized, bounded, and free of
HTML-like markup and control characters. The list contains at most 100 items;
every query key is rejected. These contracts expose no search, pagination,
personalization, PRD 03 taxonomy, persistence, media, suitability decision, or
training prescription. Existing platform error schemas remain the only public
error envelopes.

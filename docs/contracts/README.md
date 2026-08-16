# Contracts

```text
Executable Source of Truth:
packages/schemas

Human registry:
docs/contracts
```

Zod schemas in `packages/schemas` define executable shared API and data contracts. This directory records their human-readable purpose, ownership, and freeze status; it references those schemas and must never independently redefine them.

A schema modification is a contract modification. Any frozen contract modification requires Orchestrator authorization and coordinated updates to affected consumers, providers, tests, and this registry. Agents may implement coupled components in parallel only after the shared contract is frozen.

## Frozen Epic 00 registry

| Contract                          | Executable schema                            | Provider   | Consumers                    | Status |
| --------------------------------- | -------------------------------------------- | ---------- | ---------------------------- | ------ |
| Health response for `GET /health` | `healthResponseSchema` in `packages/schemas` | `apps/api` | Operational checks and tests | Frozen |

The health contract represents an HTTP 200 response whose payload conforms to `healthResponseSchema`. Its API smoke test validates the response through that executable schema. This narrow smoke test demonstrates route/schema compatibility; it does not prove complete runtime behavior or the repository architecture.

No product contract is defined in Epic 00.

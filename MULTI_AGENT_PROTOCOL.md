# Multi-Agent Engineering Protocol

## Purpose

This protocol enables a small group of specialized agents to work concurrently without turning parallelism into overlapping ownership, implicit contracts, or unsafe integration.

## Roles and non-overlapping ownership

Ownership includes implementation and tests colocated under an owned path. Agents may read the whole repository, but an edit outside an assigned boundary requires explicit Orchestrator reassignment or approval and confirmation that no concurrent edit exists.

| Role                                   | Exclusive default write ownership                                                                               | Notes                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent 0 — Orchestrator / Lead Engineer | Orchestrator-coordinated shared files listed below                                                              | Models the dependency graph, freezes contracts, assigns work, integrates branches, runs gates, and produces the final report.                                            |
| Agent 1 — Web/PWA Engineer             | `apps/web/**`, `packages/ui/**`                                                                                 | Owns all tests colocated in these paths.                                                                                                                                 |
| Agent 2 — API/Domain Engineer          | `apps/api/**`, `packages/domain/**`, `packages/schemas/**`                                                      | Owns all tests colocated in these paths. Schema changes are also contract changes and require the contract process below.                                                |
| Agent 3 — Data/Infrastructure Engineer | `packages/database/**`, except the shared `packages/database/README.md`                                         | Owns all database tests colocated in this path and any migrations when a future epic authorizes them. Epic 00 has no product migration.                                  |
| Agent 4 — QA/Security Engineer         | `tests/e2e/**`, except the shared `tests/e2e/README.md`, and explicit QA artifacts assigned by the Orchestrator | Reviews the whole repository but does not automatically own another agent's colocated tests or quality configuration. Reports findings before changing another boundary. |

### Orchestrator-coordinated shared files

The following matrix is exhaustive for the shared paths mandated in Epic 00. A concurrent agent may read them but must not independently edit them without Orchestrator coordination.

| Area                                            | Shared paths                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and runtime                           | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`                                                                                                                                                                             |
| TypeScript and quality                          | `tsconfig*`, `eslint*`, `prettier*`                                                                                                                                                                                                                     |
| Repository and CI                               | `.github/**`, `.gitignore`, `.env.example`                                                                                                                                                                                                              |
| Shared configuration                            | `packages/config/**`                                                                                                                                                                                                                                    |
| Root governance                                 | `README.md`, `AGENTS.md`, `MULTI_AGENT_PROTOCOL.md`, `PRODUCT_PRINCIPLES.md`                                                                                                                                                                            |
| Architecture decisions                          | `docs/adr/**`, including `docs/adr/001-foundation-architecture.md`, `docs/adr/002-multi-agent-engineering-model.md`, `docs/adr/003-workspace-package-build-model.md`, `docs/adr/004-client-api-topology.md`, `docs/adr/005-contract-source-of-truth.md` |
| Architecture, contracts, epic, and product docs | `docs/architecture/**`, `docs/contracts/**`, `docs/epics/**`, `docs/product/**`                                                                                                                                                                         |
| Package and QA documentation                    | `packages/config/README.md`, `packages/database/README.md`, `tests/e2e/README.md`                                                                                                                                                                       |

The specific file entries above remain shared even where a broader implementation owner owns the containing directory. This exception prevents concurrent edits to governance and coordination artifacts while preserving non-overlapping implementation ownership.

Future work may justify Body Intelligence, Digital Twin, Training Intelligence, Movement Engine, Computer Vision, Security Specialist, or Data/Analytics agents. Do not create these roles before a concrete need exists.

## Worktrees and branches

Each concurrent implementer uses a separate Git worktree, conceptually `../fitness-os-web`, `../fitness-os-api`, `../fitness-os-data`, or `../fitness-os-qa`. Focused branches use a clear `agent/<task>` name and integrate into the active epic branch through the Orchestrator.

Agents must verify their branch and worktree before editing. Crossing ownership requires a justification, explicit Orchestrator approval or reassignment, and confirmation that no concurrent edit exists.

## Contract-first parallelism

The executable Source of Truth for shared API and data contracts is Zod code in `packages/schemas`. `docs/contracts` is the human registry, documentation, and freeze layer; it must reference, not independently redefine, executable contracts.

A schema modification is a contract modification. Frozen contract changes require Orchestrator authorization and coordinated updates to affected consumers, providers, tests, and registry documentation. Coupled components may proceed in parallel only after the shared contract is frozen.

## Dependency graph and waves

The Orchestrator represents work as a DAG and does not start a dependent task before its prerequisites. A typical wave is:

```text
Contracts
    ↓
Parallel implementation
    ↓
Integration
    ↓
QA
    ↓
Review
```

Choose throughput, not maximum agent count. Small tasks that overlap shared files run sequentially.

## Enforcement model

Some boundaries are machine-enforced by the existing ESLint configuration:

- `apps/web/**` must not import `@fitness-os/database` or `@fitness-os/domain`.
- `apps/api/**` must not import `@fitness-os/ui`, `next`, or Next.js runtime modules.
- `packages/domain/**` must not import Fastify, Next.js, React, Drizzle, or `@fitness-os/database`.

The ownership matrix, worktree discipline, frozen-contract authorization, canonical client/API topology, package build model, provider abstraction, product scope, and integration order remain governance-enforced and review-verified. Lint, smoke tests, or a successful build do not by themselves prove those broader properties.

## Agent handoff

Every implementation task ends with:

```text
AGENT HANDOFF

Role:
Task:

Implemented:

Files changed:

Contracts consumed:

Contracts changed:

Tests executed:

Results:

Known limitations:

Risks:

Recommended next action:
```

A task is incomplete without this handoff.

## Stop conditions

Stop when acceptance criteria are complete or when encountering an architectural conflict, an unauthorized contract change, a secret, a data-loss risk, a conflicting migration, or ambiguity that materially affects architecture. Report the condition; do not invent a silent workaround.

## Change discipline

No drive-by refactors, unrelated renames, library replacements, unnecessary dependency updates, or repository-wide reformatting. Add a dependency only after checking whether the platform already solves the need and evaluating maintenance and security impact.

When migrations exist, an applied migration is immutable, corrections use a new migration, and exactly one task owns migrations in a wave. Concurrent migration generation is prohibited. Epic 00 creates no product migration.

## Runtime and build discipline

Use Node.js `24.18.0` and pnpm `10.24.0`. Enable Corepack and use the `packageManager` pin; never silently substitute another pnpm release. Runtime workspace packages use a uniform dist-first lifecycle: source builds to `dist`, and public package exports resolve from `dist`. Type checking remains no-emit, while build commands emit the declared artifacts in topological dependency order.

## Integration gates

Every integrated wave must pass from a clean worktree that does not rely on pre-existing `dist` artifacts:

1. Architecture — Product Principles, accepted ADRs, import restrictions, and epic scope remain intact.
2. Build — `pnpm build`, with declared runtime artifacts emitted and resolvable.
3. Types — `pnpm typecheck`.
4. Lint — `pnpm lint`.
5. Tests — `pnpm test`.
6. Security — no secrets, credentials, dangerous debug code, or obvious introduced vulnerability.
7. Scope — no out-of-epic feature.

Current automated tests are smoke tests. They verify narrow baseline behavior such as the health response and schema compatibility; they do not establish complete runtime behavior or prove the architecture. The Next.js production build is the authoritative framework/type validation gate unless the repository explicitly adopts a stable deterministic type-generation command.

QA/Security should be independent from the original implementation when practical to reduce confirmation bias.

## Pull request flow

```text
Spec → implementation branch → isolated agents → integration → CI → pull request
     → external red team → corrections → human approval → merge
```

Never merge automatically. Passing CI ends at a pull request prepared for external red-team review. Never begin a new epic without explicit authorization.

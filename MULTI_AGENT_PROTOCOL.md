# Multi-Agent Engineering Protocol

## Purpose

This protocol enables a small group of specialized agents to work concurrently without turning parallelism into overlapping ownership, implicit contracts, or unsafe integration.

## Roles and default ownership

### Agent 0 — Orchestrator / Lead Engineer

Reads governing documents, models the dependency graph, freezes contracts, assigns non-overlapping work, tracks blockers, coordinates shared files, integrates branches, runs gates, and produces the final report. It should use safe parallelism rather than implementing every task itself.

### Agent 1 — Web/PWA Engineer

Owns `apps/web/**` and `packages/ui/**`: Next.js, PWA readiness, technical UX, responsiveness, frozen-contract consumption, and interface tests.

### Agent 2 — API/Domain Engineer

Owns `apps/api/**`, `packages/domain/**`, and `packages/schemas/**`: Fastify, APIs, services, domain boundaries, frozen API contracts, and backend tests.

### Agent 3 — Data/Infrastructure Engineer

Owns `packages/database/**`, future infrastructure, and migrations: PostgreSQL, Drizzle, integrity, future jobs, and storage infrastructure.

### Agent 4 — QA/Security Engineer

May read the whole repository and primarily owns tests and quality configuration. It independently reviews security, regressions, edge cases, contracts, and scope. It reports findings before changing another agent's implementation and never silently rewrites it.

Future work may justify Body Intelligence, Digital Twin, Training Intelligence, Movement Engine, Computer Vision, Security Specialist, or Data/Analytics agents. Do not create these roles before a concrete need exists.

## Worktrees, branches, and ownership

Each concurrent implementer uses a separate Git worktree, conceptually `../fitness-os-web`, `../fitness-os-api`, `../fitness-os-data`, or `../fitness-os-qa`. The epic branch is `chore/epic-00-bootstrap`; focused branches may use `agent/epic-00-web`, `agent/epic-00-api`, `agent/epic-00-tooling`, and `agent/epic-00-qa` or an equivalent small set.

Agents may read any file and modify only their assigned ownership. Crossing ownership requires a justification, explicit orchestrator approval, and confirmation that no concurrent edit exists. `package.json`, `pnpm-lock.yaml`, workspace config, TypeScript/ESLint config, and CI are orchestrator-coordinated shared files.

## Contract-first parallelism

Coupled components may be implemented in parallel only after the shared contract is frozen. A future API contract records its version, request, response, errors, and permissions before one agent implements the provider and another implements the consumer. Contract changes return to the orchestrator; they are never made silently inside an implementation task.

## Dependency graph and waves

The orchestrator represents work as a DAG and does not start a dependent task before its prerequisites. A typical wave is:

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

Choose throughput, not maximum agent count. Small tasks that overlap critical files run sequentially.

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

## Integration gates

Every wave must pass:

1. Architecture — Product Principles, accepted ADRs, and epic scope remain intact.
2. Build — `pnpm build`.
3. Types — `pnpm typecheck`.
4. Lint — `pnpm lint`.
5. Tests — `pnpm test`.
6. Security — no secrets, credentials, dangerous debug code, or obvious introduced vulnerability.
7. Scope — no out-of-epic feature.

QA/Security should be independent from the original implementation when practical to reduce confirmation bias.

## Pull request flow

```text
Spec → implementation branch → isolated agents → integration → CI → pull request
     → external red team → corrections → human approval → merge
```

Never merge automatically. Passing CI ends at a pull request prepared for external Grok red-team review. Never begin a new epic without explicit authorization.

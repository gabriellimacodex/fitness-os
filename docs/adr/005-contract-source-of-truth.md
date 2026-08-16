# ADR 005 — Contract Source of Truth

- Status: Accepted
- Date: 2026-08-16

## Context

Executable schemas and prose documentation can drift if both independently define the same request or response.

## Decision

`packages/schemas` is the executable Source of Truth for shared API and data contracts, implemented with Zod. `docs/contracts` is the human registry, documentation, and freeze layer. Documentation references executable schemas and never independently redefines them.

A schema modification is a contract modification. Changing a frozen contract requires Orchestrator authorization and a coordinated update to affected consumers, providers, tests, and registry documentation.

## Consequences

Runtime validation and TypeScript inference derive from one executable definition. Human review retains an auditable contract index and change policy without creating a second implementation. Tests may prove specific schema compatibility, but they do not replace the Source of Truth or governance review.

# ADR 002 — Multi-Agent Engineering Model

- Status: Accepted
- Date: 2026-08-15

## Context

Parallel implementation can improve throughput only when dependencies, ownership, contracts, and integration are controlled.

## Decision

Develop through an orchestrator and specialized agents working in isolated Git worktrees. The orchestrator freezes shared contracts, assigns ownership, coordinates shared files, integrates focused branches, and enforces gates. Implementers produce structured handoffs. QA/security review is independent when practical.

## Alternatives considered

- One agent for all work: simpler coordination but lower safe parallel throughput.
- Multiple agents in one working directory: rejected because concurrent edits and Git state are unsafe.
- Unowned file access: rejected because conflicts become implicit and hard to review.

## Consequences

Parallelism is constrained by a task DAG and contract-first waves. There is modest coordination overhead in exchange for auditable changes, controlled integration, and reduced conflict risk.

# ADR 003 — Workspace Package Build Model

- Status: Accepted
- Date: 2026-08-16

## Context

Internal packages mixed source exports with compiled exports, and some build commands succeeded without emitting their advertised runtime artifacts. This made clean-worktree behavior dependent on command order or stale `dist` content.

## Decision

Adopt a uniform dist-first model for `@fitness-os/config`, `@fitness-os/schemas`, `@fitness-os/domain`, `@fitness-os/database`, and `@fitness-os/ui`:

```text
src → build → dist → package exports
```

Runtime exports point to `dist`, builds emit JavaScript and declarations where consumers need them, and type checking remains no-emit. The root build executes workspace builds in dependency order. A fresh clone must build without pre-existing `dist` folders. Package-specific API `predev`, `prebuild`, `pretypecheck`, or `pretest` hooks must not substitute for coherent workspace orchestration.

## Alternatives considered

- Source-first exports: workable with bundler-aware consumers, but inconsistent for the independently executed Node API and easier to couple to consumer-specific transpilation.
- Mixed source-first and dist-first exports: rejected because resolution and clean-build behavior differ across packages.
- Turborepo: deferred because pnpm and TypeScript can express the current dependency order without another orchestration layer.

## Consequences

Build output and package entry points are explicit and reproducible across Node and Next.js consumers. Development may require an orchestrated package build or watcher before an app starts; any watcher must preserve the same dependency order. Generated `dist` artifacts remain build products, not source contracts.

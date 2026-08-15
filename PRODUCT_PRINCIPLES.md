# Product Principles

These principles are constitutional. Every accepted ADR, epic, contract, task, implementation, and review must comply with them.

## PP-01 — PWA first

The first version is Web/PWA. Native clients are added only for a clear product reason.

## PP-02 — Student mobile-first

The student experience is designed primarily for smartphones.

## PP-03 — Coach desktop-friendly

The coach experience works especially well on desktop and tablet.

## PP-04 — Human in the loop

AI may suggest. It may not autonomously alter consequential training decisions when professional judgment requires human approval.

## PP-05 — Measured is not estimated

An estimate is never presented as a measurement. A future metric must carry its value, unit, source, method, confidence, and timestamp.

## PP-06 — History is immutable

Historical student states are preserved. Past snapshots are never silently overwritten.

## PP-07 — Privacy by default

Body photos, body models, measurements, and physical data are private by default.

## PP-08 — Evidence cannot be invented

AI may not invent scientific references. Scientific recommendations derive from a versioned Evidence Base.

## PP-09 — Deterministic before generative

Prefer data, rules, and algorithms when a deterministic solution exists. Generative AI primarily explains, summarizes, or assists within defined contracts.

## PP-10 — Providers behind adapters

Important external providers, including future body, LLM, storage, health, and notification services, remain behind interfaces and adapters and do not contaminate the domain.

## PP-11 — APIs are contracts

Frontend and backend do not rely on implicit knowledge. Requests, responses, enums, and errors have explicit contracts.

## PP-12 — Simple until complexity is earned

Do not add abstractions, microservices, or sophisticated infrastructure without demonstrated need.

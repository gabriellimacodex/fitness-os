# PRD 07 Technical Design Review

## Review identity

- Review type: Independent Agent 90 Technical Design correction review
- Review round: Round 2
- Repository: `gabriellimacodex/fitness-os`
- Candidate branch: `design/prd-07-technical`
- Reviewed base before the PRD 07 document chain:
  `d52b2e3691a706d4f22570e18adcc0e0b6e6a3ce`
- Current `origin/main` observed during review:
  `ec6cddc5a7db5bed320807f8725f5f1acd11228a`
- Detailed PRD source SHA:
  `08da353bccc842b8e91e32778e93a8bfba5bed58`
- Detailed PRD source blob:
  `df14437deeff425825948904b07965c0622d1891`
- Technical Design initial SHA:
  `e6be0652f512595759dfe1786ad359af3e6d3b50`
- Exact reviewed Technical Design SHA:
  `cce7cd54a1938e2a2c8eef5bae41e7ef2c894ba3`
- Exact reviewed Technical Design blob:
  `e9684d1e2c359f34155875a698d51ae70cf41cf7`
- Review date: 2026-08-17
- Disposition: `PASS`
- Final recommendation:
  `PASS TO PROVIDER- AND POLICY-NEUTRAL CONTRACT FREEZE`

The reviewer did not author the PRD 07 Technical Design or its correction.
This record reviews the full corrected design, the actual Round 2 correction
diff, and the complete governing source rather than relying on a builder
summary. The reviewed branch still has the historical merge base above after
`origin/main` advanced; integration against the then-current main remains a
later exact-head gate and is not inferred by this design review.

## Finding summary

| Severity  | Open findings |
| --------- | ------------: |
| `BLOCKER` |             0 |
| `HIGH`    |             0 |
| `MEDIUM`  |             0 |
| `LOW`     |             0 |

There are no deferrals. `PASS` means no known actionable finding remains at
this Technical Design boundary. It does not mean perfect security or privacy,
legal compliance, implementation completion, production readiness, Gate A, or
permission to onboard real users.

## Evidence inspected

The independent review read and cross-checked:

- the complete 1,307-line Technical Design at the exact reviewed SHA;
- the complete correction diff from
  `e6be0652f512595759dfe1786ad359af3e6d3b50` to
  `cce7cd54a1938e2a2c8eef5bae41e7ef2c894ba3`;
- the complete introduced-document chain from the reviewed historical base;
- the complete 1,574-line PRD 07 and its durable independent design pre-flight;
- PRD 02 and Technical Design 002, including the student-before-coach row-lock
  order and the fact that a student-coach link is not authorization;
- `PRODUCT_PRINCIPLES.md`, especially privacy-by-default, immutable history,
  provider adapters, explicit contracts, and simplicity constraints;
- accepted ADRs 001–006;
- the frozen PRD 01 and PRD 02 human contract registry;
- the PRD Registry dependency DAG and the single-migration-owner rule;
- `AGENTS.md`, the Multi-Agent Engineering Protocol, Autonomous Delivery
  Charter, Stop Conditions, Release Gates, and Agent 90 requirements; and
- exact-head worktree state plus the document-specific validation results.

The detailed PRD in the reviewed worktree has the exact same Git blob as the
declared reviewed PRD source. PRD 02 remains PRD 07's sole registry dependency.
PRD 21 is informative future composition context, not a new DAG dependency or
authority for PRD 07 to implement governance policy.

## Prior HIGH correction verification

All three Round 1 `HIGH` findings are resolved at the exact reviewed SHA.

### H1 — Principal-reference rotation is multiversion and fail closed

The corrected design defines one environment-bound closed keyring with one
`active_write_version`, lookup-only versions, and a persisted rotation epoch.
Each verified identity context derives the complete approved candidate set.
Zero matches can establish a first binding only with the active writer; several
aliases for one logical binding converge; matches across different bindings or
principals are corrupt state, cause no command or identity mutation, and fail
readiness.

Rotation is explicitly prepare, cover, prove, then cut over. New bindings gain
old and candidate aliases atomically during preparation, existing coverage uses
the same verified subject context or an independently reviewed equivalent
migration capability, and cutover is prohibited until every active binding is
covered, aliases do not conflict, retained operation-authority aliases remain
resolvable, and every serving replica reports the same keyring epoch. A legacy
lookup version cannot create a binding, win a zero-match fallback, overwrite a
newer alias, or be retired while an operation, retry, or recovery window still
depends on it.

Persistence adds immutable reference aliases and a rotation-control family;
readiness includes active-writer uniqueness, complete candidate coverage,
replica epoch equality, and zero multiple-binding matches. The verification
plan covers same-binding multi-alias resolution, anti-downgrade, conflicting
multiple matches, preparation, interrupted coverage, cutover, retirement,
replica drift, and rotation races without duplicate principals.

### H2 — Attempt progression is forward-only with an atomic successor

The only successful progression is
`policy_pending → ready_to_claim → completed`; either nonterminal state may
move to `terminal`, and no edge returns to `policy_pending`. A policy package
replacement never edits the immutable package/evidence binding or reopens the
attempt. It terminalizes the predecessor, releases the guarded slot once, and
may allocate a new `policy_pending` successor with a new ID, ordinal,
predecessor link, and package binding only while the same invitation remains
claimable.

Predecessor terminalization and successor allocation are one idempotent
operation under the principal/role guard. Failed claimability or integrity
leaves the predecessor terminal and creates no successor; completed history is
untouched. The database transition invariant excludes
`ready_to_claim → policy_pending`, and the verification plan includes direct
bypass rejection, package-supersede/claim races, exact slot accounting,
terminal non-reopen, and successor recovery.

### H3 — Every mutation uses one lock order and fenced reconciliation

Every onboarding mutation now uses PostgreSQL `SERIALIZABLE` isolation and one
global relative order: operation/retry identity; reference rotation,
arbiters, aliases, bindings and principal; principal/role guard; ordered
attempts; invitation; role mappings; policy/evidence and completion/transition;
then PRD 02 student, coach, and exact pair. That final stage preserves TD02's
student-before-coach order. A command may skip an irrelevant stage but may not
acquire an earlier stage after a later one.

First binding is explicitly inside this order. A preliminary invitation-proof
check is read-only and grants no authority or material lock. The transaction
locks the operation first, then rotation/reference and binding identity, then
guard, attempts, invitation, mappings, and effects. Not-yet-existing rows use
their stage's deterministic arbiter; multi-row locks sort stable identifiers.
Routes and reconcilers may not invent a different local order.

Only PostgreSQL `40001` and `40P01` are automatically retried, with a bounded
attempt count and full-jitter backoff. A retry retains the same `OperationId`,
authority, semantic digest, retry-token binding, and fence, restarts the whole
serializable transaction, and reacquires locks from stage one. Exhaustion or
an ambiguous commit triggers a fresh fenced read of the same operation;
committed state replays exactly, while unresolved matching work enters
`operation_reconciling`. Namespace reconcilers inspect authoritative effect
and provenance before resuming the same operation and never blindly duplicate
or infer an effect.

The PostgreSQL plan now exercises lock-order races spanning first binding,
guard, attempts, and invitation; bounded `40001`/`40P01` retries; retry
exhaustion; ambiguous commit; fenced reconciliation; and zero duplicate
effects.

## Required review-area outcomes

| Review area                | Outcome          | Evidence-based conclusion                                                                                                                                                                                                                                                                   |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product and authority      | `PASS`           | The design decomposes approved PRD 07 without expanding the registry outcome, activating a real-user path, changing PRD state, or authorizing PRD 25.                                                                                                                                       |
| Dependency DAG             | `PASS`           | PRD 02 is complete and remains the only registry dependency. PRD 21 is informative and separately authorized; no governance engine is absorbed.                                                                                                                                             |
| Product Principles         | `PASS`           | PWA-first topology, student-mobile and coach-desktop UX, immutable ordinary history, privacy by default, deterministic mechanics, adapters, explicit contracts, and bounded complexity remain explicit.                                                                                     |
| Architecture               | `PASS`           | The modular monolith, Fastify-only backend boundary, domain-owned ports, provider isolation, dist-first packages, stable lock order, and one global migration owner remain consistent with ADRs 001–006.                                                                                    |
| Contracts                  | `PASS`           | Proposed strict Zod responsibilities preserve PRD 02 nominal IDs and the closed result taxonomy, reject caller authority and raw governance payloads, and expressly remain unfrozen pending this review and coordinated freeze.                                                             |
| Identity and sessions      | `PASS`           | Backend-only OIDC Authorization Code plus PKCE shape, opaque rotated application session, CSRF/origin controls, protected multiversion references, atomic first binding, alias continuity, and no callback/read identity creation are closed enough for provider-neutral contracts.         |
| Invitations and attempts   | `PASS`           | Verifier-only high-entropy secrets, terminal invitation states, one exact-scope attempt, fixed cap four, guarded slot release, bounded selection, forward-only attempts, and atomic successors are specified with enumeration-safe results.                                                 |
| Operations and concurrency | `PASS`           | Server-owned operations, canonical semantic digests, continuous pre/post-binding authority aliases, replay/mismatch semantics, serializable global locks, bounded retry, fencing, and namespace reconciliation prevent known duplicate or ambiguous effects.                                |
| PRD 02 claim integration   | `PASS`           | One transaction creates the appropriate PRD 02 record, mapping, completion, event, and student link; failures roll everything back, TD02 row order is preserved, and links remain association rather than authorization.                                                                    |
| Policy isolation and stops | `PASS`           | The gateway carries only protected interaction/package/evidence references. PRD 07 owns no legal copy, participant response, evidence payload, or policy decision; synthetic composition cannot satisfy production readiness.                                                               |
| Persistence plan           | `PASS`           | The proposed additive tables, restrictive foreign keys, database transition/guard invariants, immutable aliases, rotation control, append-only ordinary-role evidence, forward correction, and recovery boundaries match the PRD and introduce no implementation yet.                       |
| Migration validation       | `NOT_APPLICABLE` | This document creates no migration. The future single-owner plan requires the latest integrated head, apply from zero and prior head, exact journal/schema, replay, interruption, forward correction, drift, and unrelated-data preservation before any migration can pass.                 |
| Security and privacy       | `PASS`           | Data minimization, verifier/key separation, least privilege, no provider token/profile storage, enumeration resistance, dual-role/self-coach hard-disable, secret/log exclusions, synthetic production rejection, and a bounded threat model are explicit.                                  |
| Failure and recovery       | `PASS`           | Provider/database outage, lost response, first-binding ambiguity, rotation interruption, guard drift, package replacement, claim races, shutdown, migration failure, operation reconciliation, disablement, and roll-forward recovery have closed behavior.                                 |
| Tests and CI               | `NOT_APPLICABLE` | This correction changes one Technical Design and no executable behavior. Document checks apply now; implementation tests, migration evidence, CI, QA/security, accessibility, production-provider validation, and Gate A remain later exact-head gates.                                     |
| Scope and documentation    | `PASS`           | The complete design matches the approved PRD, records limitations, introduces no profile, broad coach workspace, notification behavior, governance engine, body/training intake, native client, AI behavior, real data, registry change, public admin route, or production provider choice. |

## Validation performed

The reviewer performed these read-only checks at exact source head
`cce7cd54a1938e2a2c8eef5bae41e7ef2c894ba3` before creating this record:

- Node.js `24.18.0` and pnpm `10.24.0` version checks — `PASS`;
- Prettier `--check` for the corrected Technical Design — `PASS`;
- `git diff --check` for both the Round 2 correction and the complete PRD 07
  document chain from the reviewed historical base — `PASS`;
- correction scope check — exactly one modified Technical Design file;
- Markdown heading hierarchy check — `PASS`;
- relative Markdown link target check — `PASS`;
- trailing-whitespace and unfinished-marker scans — none found;
- credential and secret-pattern scan — none found;
- detailed PRD source-blob comparison — `PASS`;
- exact-head and source-blob comparison — `PASS`; and
- clean-worktree verification before this reviewer-owned artifact — `PASS`.

The repository has no dedicated Markdown linter. Runtime lint, build, tests,
CI, contracts, migrations, production recovery, and accessibility are not
inferred from document formatting and remain later gates.

## Known limitations and stop disposition

- This review approves only the provider- and policy-neutral Technical Design
  as an input to coordinated executable contract freeze.
- The reviewed source branch diverged before the current `origin/main` update.
  The Orchestrator must integrate against the current main, preserve unrelated
  governance changes, and rerun all affected exact-head diff and merge gates.
- No executable schema, domain service, database migration, identity provider,
  session adapter, credential, legal policy, public onboarding activation,
  production data, QA/security result, CI run, or Gate A result was introduced
  or validated here.
- Synthetic identity, policy, concurrency, migration, and recovery evidence
  cannot establish production identity assurance, legal sufficiency, provider
  behavior, production recovery, or PRD completion.
- `LEGAL_PRIVACY_DECISION_REQUIRED` remains active for real-user production
  onboarding, including unresolved jurisdiction, eligibility/minors, purpose,
  authority, notice/evidence, lifecycle, sharing, provider processing,
  residency/transfer, and recovery decisions.
- `FOUNDER_DECISION_REQUIRED` independently remains active for real-user
  acquisition of a second role and self-coach linking. Applicable
  `LEGAL_PRIVACY_DECISION_REQUIRED` clearance is also required for the exact
  path; either decision alone is insufficient.
- `ARCHITECTURE_DECISION_REQUIRED` is not active from this Round 2 result. A
  later third meaningful correction round with significant remaining
  architectural instability would activate the governing stop.
- Provider credentials and financial commitments are not required for this
  synthetic design slice. Their exact stops remain independently applicable
  when a current acceptance criterion requires them.
- Contract, implementation, migration, integration, QA/security, CI,
  accessibility, recovery, exact-head Agent 90, Gate A, and PRD-completion
  evidence remain mandatory.

## Final disposition

`PASS TO PROVIDER- AND POLICY-NEUTRAL CONTRACT FREEZE`

The corrected Technical Design is faithful to PRD 07, PRD 02 and TD02, the
Product Principles, accepted ADRs, frozen existing contracts, the dependency
DAG, execution governance, and the synthetic authority granted by the durable
design pre-flight. All three prior `HIGH` findings are resolved, all previously
passing review areas were revalidated, and there is no new open `BLOCKER`,
`HIGH`, `MEDIUM`, or `LOW` finding.

This disposition does not authorize executable work before the coordinated
contract freeze, a production identity provider, real-user onboarding,
dual-role or self-coach activation, legal-policy decisions, PRD 21 governance
implementation, production readiness, Gate A, or PRD 07 completion. The two
named decision stops remain visible and binding.

# PRD 07 Design Pre-flight Review

## Review identity

- Review type: Independent Agent 90 design pre-flight
- Review method: Fresh review of the complete source and governing evidence;
  prior PRD 07 review conclusions were not used as evidence
- Source document: `docs/prds/007-onboarding.md`
- Exact reviewed source SHA: `08da353bccc842b8e91e32778e93a8bfba5bed58`
- Reviewed source blob: `df14437deeff425825948904b07965c0622d1891`
- Candidate branch: `design/prd-07`
- Base branch: `origin/main`
- Reviewed merge base: `5323cf999cc8ff882b2629441d29104abb87d313`
- Review date: 2026-08-17
- Disposition: `PASS`

This record evaluates the detailed PRD at the exact source SHA above. It does
not assert a later integrated SHA, approve implementation, satisfy post-change
Gate A, activate a real-user path, or establish that PRD 07 is complete.

## Finding summary

| Severity  | Open findings |
| --------- | ------------: |
| `BLOCKER` |             0 |
| `HIGH`    |             0 |
| `MEDIUM`  |             0 |
| `LOW`     |             0 |

No finding is deferred. `PASS` means the design pre-flight found the detailed
PRD faithful to its inherited authority, sufficiently closed for Technical
Design, and free of known open `BLOCKER` or `HIGH` findings. It is not a claim
of perfect security, legal compliance, production readiness, or freedom from
future defects.

## Evidence inspected

The independent review read in full and cross-checked:

- the complete 1,574-line PRD 07 at the exact reviewed source SHA;
- PRD 02 as the completed normative registry dependency;
- the current integrated PRD 21 design on `main` at
  `d52b2e3691a706d4f22570e18adcc0e0b6e6a3ce`, as informative context only;
- `PRODUCT_PRINCIPLES.md`;
- `AGENTS.md` and `MULTI_AGENT_PROTOCOL.md`;
- the PRD Registry and Master Execution Plan dependency DAG;
- PRD governance and execution-control-plane README files;
- the Autonomous Delivery Charter, Reviewer Agent rules, Release Gates, and
  Stop Conditions;
- accepted ADRs 001–006;
- the pull-request review instructions; and
- the complete one-file diff from the reviewed merge base to the exact source
  SHA.

The PRD Registry and DAG identify PRD 02 as PRD 07's only registry dependency.
PRD 07 repeats that boundary, treats PRD 21 only as informative integration
context, and neither adds PRD 21 to the DAG nor absorbs its governance engine.
Product Principles, ADRs, frozen platform/domain contracts, and execution
governance remain governing constraints rather than additional PRD nodes.

## Validation performed

The reviewer performed these read-only checks before creating this record:

- verified the required worktree and exact `HEAD` SHA;
- verified the worktree was clean;
- verified the candidate history and merge base;
- verified that the reviewed diff adds only
  `docs/prds/007-onboarding.md`;
- ran `git diff --check` from the merge base through the reviewed source SHA —
  `PASS`;
- ran Prettier 3.9.6 against the PRD — `PASS`;
- checked Markdown heading hierarchy — `PASS`;
- scanned for trailing whitespace and unfinished-work markers — none found;
  and
- scanned introduced Markdown links — none were introduced.

The repository has no dedicated Markdown linter. This document-only pre-flight
does not substitute formatting checks for implementation tests, CI, security,
QA, migration validation, accessibility evidence, or the later integrated
review required by Gate A.

## Required review matrix

| Review area                           | Result | Evidence and disposition                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exclusive dependency: PRD 02          | `PASS` | The header, context, registry-dependency section, and DAG preserve PRD 02 as the only PRD dependency. PRD 21 is explicitly informative and separately authorized.                                                                                                                                                                  |
| Identity and `PrincipalReference`     | `PASS` | The trusted API-side principal context, protected issuer/subject/environment pre-binding reference, immutable external binding, nominal domain mappings, atomic first binding, and no browser acceptance or disclosure are explicit.                                                                                               |
| Dual-role hard-disable                | `PASS` | Storage may represent both mappings synthetically, while real second-role acquisition and self-coach claims are unreachable unless separate attributable founder and legal/privacy decisions both clear. Configuration, adapter, retry, operator, race, and readiness bypasses are required to fail closed.                        |
| Fixed cap four and locks/concurrency  | `PASS` | The cap is fixed per principal/proposed role, cannot be environment- or caller-raised, uses a database-constrained guard and stable lock order, reconciles terminal slots, rejects the fifth attempt without mutation or disclosure, and requires race/drift/bypass tests.                                                         |
| `RetryToken` versus `OperationId`     | `PASS` | Caller tokens are bounded correlation only; the server allocates the branded persisted operation identity, namespace, canonicalization version, and semantic digest. Same-token replay/mismatch, new-token intentional repetition, leases, reconciliation, and authorization rechecks are distinct.                                |
| First-binding alias and replay        | `PASS` | The pre-binding authority remains canonical after principal creation. An immutable alias connects the protected reference to the resulting principal, and lookup/uniqueness span pre- and post-binding scopes so a retry cannot become a new command.                                                                              |
| Atomic invitation claim               | `PASS` | Invitation, principal, mapping, domain record, completion, transition, and initial student–coach link effects are one transactional command with stable locks, database uniqueness/deferred enforcement, injected-failure rollback, and claim/revoke and claim/claim race coverage.                                                |
| Policy gateway without legal decision | `PASS` | `OnboardingPolicyGateway` is a strict interaction-reference/evidence-reference boundary. PRD 07 does not author, serve, proxy, collect, interpret, or persist legal copy or participant responses, and missing/stale/synthetic/blocked policy fails closed.                                                                        |
| Closed result taxonomy                | `PASS` | Operation, attempt/cardinality, governance, command-state, and boundary-failure unions are closed, applicable subsets cannot be renamed or collapsed, and operation status remains distinguishable from the stored command result.                                                                                                 |
| Privacy and security                  | `PASS` | The PRD minimizes identity/invitation data, stores verifier-only claim material, separates privileges, prohibits sensitive logging and real test data, defines enumeration/race/session/CSRF controls, requires a threat model, and preserves all applicable stop conditions.                                                      |
| UX                                    | `PASS` | The student path is mobile-first, the coach path desktop/tablet-friendly, interruption and authoritative resume are explicit, accessibility obligations are testable, secrets are not persisted in the browser, and offline claim is excluded.                                                                                     |
| Acceptance                            | `PASS` | Nineteen criteria bind contract freeze, identity, dual-role, invitation, atomicity, idempotency, cap/concurrency, policy isolation, UX, API, migration, readiness, privacy/security, production decisions, exact-head evidence, independent review, and non-scope.                                                                 |
| Completion                            | `PASS` | Completion requires all criteria, cleared applicable stops, production provider/policy evidence, migration/recovery, CI and full test gates, independent Agent 90 and QA/security review, merged PRs, a current Gate A record, and zero open `BLOCKER`/`HIGH`. Synthetic component PRs cannot be misrepresented as PRD completion. |

## Authorized next slice

`PASS TO TECHNICAL DESIGN AND PROVIDER-/POLICY-NEUTRAL CONTRACT WORK`

The following bounded work may proceed under the reviewed PRD:

1. Produce the identity/session and onboarding Technical Design, threat model,
   migration plan, operation-ledger/reconciliation design, and stop matrix.
2. Freeze strict provider-neutral contracts after independent review, including
   the complete closed result taxonomy and nominal PRD 02/PRD 07 identifiers.
3. Implement synthetic identity and governance adapters, domain state
   machines, local UI states, and disposable PostgreSQL persistence.
4. Prove first-binding convergence and alias replay, the fixed four-attempt
   cap, guarded slot release, invitation claim atomicity, dual-role hard-disable,
   policy handoff isolation, and recovery under retries and races.
5. Run component Gate A for each exact implementation head without claiming
   real-user readiness or PRD completion.

The Technical Design must resolve the concrete identity/session protocol,
database transaction and lock strategy, operation lease/reconciliation
algorithm, schema/API ownership, migration order, and recovery procedure before
executable contract freeze. It may not weaken the PRD's closed invariants or
select a policy or product decision hidden inside implementation detail.

## Stop boundaries

### `LEGAL_PRIVACY_DECISION_REQUIRED`

This stop is active before any real-user path depends on unresolved
jurisdiction, legal role, eligibility/minors, purpose/authority, notice or
evidence, identity assurance, student–coach sharing, provider processing,
withdrawal, retention/deletion, residency/transfer, or recovery/lifecycle
policy. PRD 07 may test strict shapes and fail-closed synthetic mechanics; it
may not invent values, present generated legal copy, collect real-user data, or
represent an affected path as ready or complete.

Production policy composition additionally requires a separately authorized
PRD 21 or equivalent governance evidence interaction. That composition does
not change PRD 07's PRD 02-only registry dependency and does not transfer legal
content, participant responses, or evidence payloads into PRD 07.

### `FOUNDER_DECISION_REQUIRED`

Real-user acquisition of a second role and self-coach linking remain hard-
disabled. They may activate only after an attributable founder product-role
decision defines the exact allowed cases and UX. Where sharing, authority,
notice, or evidence is affected, the independent legal/privacy stop must also
be cleared; either decision alone is insufficient.

### Other applicable boundaries

- `ARCHITECTURE_DECISION_REQUIRED` applies if material identity/session
  architecture remains unstable after three meaningful correction rounds. It
  is not active based on this design review.
- `EXTERNAL_CREDENTIAL_REQUIRED` activates when a current acceptance criterion
  or mandatory gate needs an unavailable least-privilege provider credential,
  key, certificate, tenant, DNS grant, or environment permission. It is not
  active for synthetic work.
- `FINANCIAL_COMMITMENT_REQUIRED` activates before accepting an unapproved paid
  provider, plan, message fee, contract, or reservation. It is not active for
  this provider-neutral design.
- `HUMAN_PERCEPTION_REQUIRED` applies if a material trust or usability
  criterion requires subjective intended-user validation. Automated
  accessibility evidence must not be represented as that human judgment.
- `TECHNOLOGY_VALIDATION_FAILED` and `SAFETY_CRITICAL_UNCERTAINTY` are not
  active for this onboarding design; later evidence may activate them only
  under their governing definitions.

Credential, financial, architecture, or founder clearance never clears an
independent legal/privacy stop.

## Gate disposition and limitations

- Design authority: `PASS` — PRD 07 is `APPROVED` under inherited Autonomous
  Pilot V1 authority and remains within the registry outcome.
- Dependency/DAG: `PASS` — PRD 02 is `COMPLETED` and is the exclusive PRD
  dependency.
- Architecture and Product Principles pre-flight: `PASS`.
- Scope pre-flight: `PASS`.
- Security/privacy design pre-flight: `PASS` within the explicit stop boundary.
- Reviewer independence: `PASS` for this fresh source review.
- Executable contracts, implementation, migrations, implementation tests,
  CI, QA/security, accessibility, production provider validation, and final
  Gate A: `PENDING` and not satisfied by this record.

The autonomous merge policy remains conjunctive. This pre-flight permits the
next bounded design/contract step but is not a Gate A merge record. The commit
that adds this reviewer-owned artifact must itself receive required exact-head
checks before merge; stale evidence for the reviewed source SHA must not be
represented as CI for the later record commit.

## Final recommendation

`PASS`

Proceed to independently reviewed Technical Design and provider-/policy-
neutral contract work. Do not activate real-user onboarding, dual-role or
self-coach paths, a production identity provider, a production policy gateway,
or PRD completion until their exact stop decisions and subsequent implementation
gates are evidenced.

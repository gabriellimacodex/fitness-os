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

Authenticated onboarding also uses the coordinated `UNAUTHENTICATED`,
`FORBIDDEN`, and `CONFLICT` members of `apiErrorCodeSchema`. Existing
`BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, and `SERVICE_UNAVAILABLE`
meanings remain unchanged.
| Public API error envelope | `apiErrorResponseSchema` in `packages/schemas` | `apps/api` | Web API client and future clients | Frozen |

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

### PRD 07 — Onboarding

| Contract group       | Executable schemas                                                                                     | Provider                       | Consumers                           | Status |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------- | ------ |
| Identity             | Nominal principal/binding/mapping IDs and backend-only `principalReferenceSchema` in `onboarding.ts`   | Onboarding domain/API          | Domain services and adapters        | Frozen |
| Invitations          | Invitation IDs, purpose/state, inspect/issue/revoke request and safe result schemas in `onboarding.ts` | Onboarding invitation services | API handlers, web client, and tests | Frozen |
| Attempts             | Attempt IDs, lifecycle, summaries, locators, and detail schemas in `onboarding.ts`                     | Onboarding attempt services    | API handlers, web client, and tests | Frozen |
| Policy handoff       | Reference-only interaction/package/evidence schemas in `onboarding.ts`                                 | Policy gateway adapter         | Attempt/policy refresh handlers     | Frozen |
| Operation protocol   | `retryTokenSchema`, `operationEnvelopeSchema`, and closed operation states in `onboarding.ts`          | Onboarding operation services  | API mutation handlers and tests     | Frozen |
| Commands and results | Browser request schemas and `onboardingCommandResultSchema` / `onboardingOperationResponseSchema`      | `apps/api` onboarding routes   | Web client and tests                | Frozen |

Onboarding IDs are nominally incompatible with PRD 02 `StudentId`, `CoachId`,
and `StudentCoachLinkId`. Public browser requests accept only retry tokens and
body-held claim secrets; they reject caller-owned operation IDs, digests,
principal references, legal content, and raw evidence. `PrincipalReference`
is backend-only and must never appear on a public request or response schema.

### PRD 21 — Privacy & Data Governance

| Contract group                               | Executable schemas                                                                                                                           | Provider                                                                          | Consumers                                                                                                    | Status |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| Operation kinds and canonical profiles       | `privacyOperationKindSchema`, `PRIVACY_CANONICAL_PROFILES`, and profile helpers in `privacy-governance.ts`                                   | Privacy domain / operation ledger                                                 | Domain canonicalization, ledger, and tests                                                                   | Frozen |
| Retention preview set fragment               | `retentionPreviewCanonicalInputSchema` and set-sort helpers in `privacy-governance.ts`                                                       | Retention preview coordinator                                                     | Domain digest/replay and contract tests                                                                      | Frozen |
| Governance lifecycle proof binding           | `governanceLifecycleResultSchema` / `PrivacyLifecycleProofId` in `privacy-governance.ts`                                                     | Governance lifecycle processor                                                    | Public results, ledger, reconciliation, tests                                                                | Frozen |
| Policy package references                    | `privacyPolicyPackageReferenceSchema` in `privacy-governance.ts`                                                                             | Policy package adapter                                                            | Domain evaluation and tests                                                                                  | Frozen |
| Evidence locators                            | `privacyEvidenceReferenceSchema` in `privacy-governance.ts`                                                                                  | Authorization evidence store                                                      | Domain evaluation, ledger, and tests                                                                         | Frozen |
| Withdrawal references                        | `privacyWithdrawalReferenceSchema` in `privacy-governance.ts`                                                                                | Authorization evidence ledger                                                     | Domain evaluation, ledger, and tests                                                                         | Frozen |
| Data-use decisions                           | `privacyDataUseDecisionSchema` / `privacyDataUseDenyReasonSchema` in `privacy-governance.ts`                                                 | Data-use evaluator                                                                | Domain evaluation and tests                                                                                  | Frozen |
| Actor context references                     | `privacyActorContextReferenceSchema` / `privacyAuthorityClaimSchema` in `privacy-governance.ts`                                              | Identity → privacy adapter                                                        | Domain evaluation and tests                                                                                  | Frozen |
| Purpose version references                   | `privacyPurposeVersionReferenceSchema` in `privacy-governance.ts`                                                                            | Purpose registry                                                                  | Domain evaluation and tests                                                                                  | Frozen |
| Subject request references                   | `privacySubjectRequestReferenceSchema` in `privacy-governance.ts`                                                                            | Request coordinator                                                               | Domain evaluation, ledger, and tests                                                                         | Frozen |
| Audit event references                       | `privacyAuditEventReferenceSchema` in `privacy-governance.ts`                                                                                | Privacy audit sink                                                                | Domain evaluation, ledger, and tests                                                                         | Frozen |
| Processor descriptors                        | `privacyProcessorDescriptorReferenceSchema` in `privacy-governance.ts`                                                                       | Runtime processor registry                                                        | Domain evaluation, readiness, and tests                                                                      | Frozen |
| Governance lifecycle proof ledger            | `privacyGovernanceLifecycleProofReferenceSchema` + `PrivacyGovernanceLifecycleLedger` (domain) / `SyntheticPrivacyGovernanceLifecycleLedger` | Governance lifecycle proof registry                                               | Domain ledger tests; not yet wired to any processor; PG via `createPostgresPrivacyGovernanceLifecycleLedger` | Frozen |
| Privacy readiness                            | `privacyReadinessResultSchema` / diagnostic codes in `privacy-governance.ts`                                                                 | Privacy readiness composition                                                     | API readiness adapters and tests                                                                             | Frozen |
| Synthetic data-use evaluate (test seam)      | `privacySyntheticDataUseEvaluateRequestSchema` / response in `privacy-governance.ts`                                                         | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` tests                                                                     | Frozen |
| Subject-request transition history           | `privacySubjectRequestTransitionReferenceSchema` in `privacy-governance.ts`                                                                  | Append-only request history                                                       | Domain/database adapters and tests                                                                           | Frozen |
| Processor step records                       | `privacyProcessorStepReferenceSchema` in `privacy-governance.ts`                                                                             | Append-only per-processor execution attempts (`deriveRequestCompletionFromSteps`) | Domain port/synthetic repository and tests                                                                   | Frozen |
| Expected processor inventory                 | `privacyExpectedProcessorInventorySchema` in `privacy-governance.ts` + `fixtures/privacy/processor-inventory.v1.json`                        | Reviewed inventory metadata                                                       | Domain expected-inventory port and tests                                                                     | Frozen |
| Synthetic subject-data processor             | `privacySyntheticProcessorCommandSchema` / result in `privacy-governance.ts`                                                                 | Synthetic processor simulation (inventory/access/export digests)                  | Domain `SubjectDataProcessor` fakes and tests                                                                | Frozen |
| Synthetic processor execute (test seam)      | `privacySyntheticProcessorExecuteRequestSchema` / response in `privacy-governance.ts`                                                        | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` tests                                                                     | Frozen |
| Synthetic inventory coverage (test seam)     | `privacySyntheticInventoryCoverageRequestSchema` / response in `privacy-governance.ts`                                                       | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` inventory-coverage tests                                                  | Frozen |
| Synthetic expected inventory GET (test)      | `privacySyntheticExpectedInventoryResponseSchema` in `privacy-governance.ts`                                                                 | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` expected-inventory GET                                                    | Frozen |
| Synthetic runtime processors GET (test)      | `privacySyntheticRuntimeProcessorsResponseSchema` in `privacy-governance.ts`                                                                 | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` runtime-processors GET                                                    | Frozen |
| Synthetic processor-step record (test seam)  | `privacySyntheticProcessorStepRecordRequestSchema` / response in `privacy-governance.ts`                                                     | Synthetic API only — HTTP seam for `recordProcessorStepAndAdvanceRequest`         | Disposable `allowSyntheticPrivacy` processor-step-record tests; proves partial-failure resume/completion     | Frozen |
| Onboarding invitation (disposable PG)        | `onboarding_invitation` table + repository in `packages/database`                                                                            | Synthetic onboarding persistence                                                  | Disposable PG tests; `put` issued-only; API still in-memory                                                  | Active |
| Onboarding attempt (disposable PG)           | `onboarding_attempt` table + repository in `packages/database`                                                                               | Synthetic onboarding persistence                                                  | Disposable PG tests; nonterminal put-only; API still in-memory                                               | Active |
| Onboarding operation (disposable PG)         | `onboarding_operation` table + repository in `packages/database`                                                                             | Synthetic onboarding idempotency                                                  | Disposable PG tests; append-only put/replay                                                                  | Active |
| Onboarding role mapping (disposable PG)      | `onboarding_role_mapping` table + repository in `packages/database`                                                                          | Synthetic claim → principal role mapping                                          | Disposable PG tests; claim write-through + hydrate                                                           | Active |
| Principal role mapping port                  | `PrincipalRoleMappingRepository` + synthetic impl in `@fitness-os/domain`                                                                    | Domain onboarding ports                                                           | Unit tests; PG via `asPrincipalRoleMappingRepository`                                                        | Active |
| Onboarding invitation port                   | `OnboardingInvitationRepository` + `SyntheticOnboardingInvitationRepository` in `@fitness-os/domain`                                         | Domain onboarding ports                                                           | Unit tests; PG via `asOnboardingInvitationRepository`                                                        | Active |
| Onboarding attempt port                      | `OnboardingAttemptRepository` + `SyntheticOnboardingAttemptRepository` in `@fitness-os/domain`                                               | Domain onboarding ports                                                           | Unit tests; PG via `asOnboardingAttemptRepository`                                                           | Active |
| Onboarding operation port                    | `OnboardingOperationRepository` + `SyntheticOnboardingOperationRepository` in `@fitness-os/domain`                                           | Domain onboarding ports                                                           | Unit tests; PG via `asOnboardingOperationRepository`                                                         | Active |
| Onboarding trusted clock                     | `TrustedClock` + `FixedTrustedClock` / `SystemTrustedClock` in `@fitness-os/domain`                                                          | Domain onboarding ports                                                           | Unit tests; optional inject in `createOnboardingPgPersistence`                                               | Active |
| Onboarding invitation secret verifier        | `InvitationSecretVerifier` + `HmacInvitationSecretVerifier` in `@fitness-os/domain`                                                          | Domain onboarding ports                                                           | Unit tests                                                                                                   | Active |
| Onboarding readiness probe                   | `OnboardingReadinessProbe` + `SyntheticOnboardingReadinessProbe` in `@fitness-os/domain`                                                     | Domain onboarding ports                                                           | Unit tests; productionReady stays false under LEGAL_PRIVACY                                                  | Active |
| Onboarding policy gateway                    | `OnboardingPolicyGateway` + `SyntheticOnboardingPolicyGateway` in `@fitness-os/domain`                                                       | Domain onboarding ports                                                           | Unit tests; blocks synthetic_in_production                                                                   | Active |
| Onboarding identity session port             | `IdentitySessionPort` + `SyntheticIdentitySessionPort` in `@fitness-os/domain`                                                               | Domain onboarding ports                                                           | Unit tests; denies synthetic_in_production                                                                   | Active |
| Onboarding identity session store            | `IdentitySessionStore` + `SyntheticIdentitySessionStore` in `@fitness-os/domain`                                                             | Domain onboarding ports                                                           | Unit tests; opaque session only                                                                              | Active |
| Onboarding transition sink                   | `OnboardingTransitionSink` + `SyntheticOnboardingTransitionSink` in `@fitness-os/domain`                                                     | Domain onboarding ports                                                           | Unit tests; append-only                                                                                      | Active |
| Onboarding claim repository                  | `OnboardingClaimRepository` + `SyntheticOnboardingClaimRepository` in `@fitness-os/domain`                                                   | Domain onboarding ports                                                           | Unit tests; denies synthetic_in_production                                                                   | Active |
| Onboarding principal binding                 | `PrincipalBindingRepository` + `SyntheticPrincipalBindingRepository` in `@fitness-os/domain`                                                 | Domain onboarding ports                                                           | Unit tests; denies synthetic_in_production                                                                   | Active |
| Onboarding principal reference deriver       | `PrincipalReferenceDeriver` + `SyntheticPrincipalReferenceDeriver` in `@fitness-os/domain`                                                   | Domain onboarding ports                                                           | Unit tests; denies synthetic_in_production                                                                   | Active |
| Onboarding ID/secret factories               | `OnboardingIdFactory` / `OnboardingSecretFactory` + crypto impls in `@fitness-os/domain`                                                     | Domain onboarding ports                                                           | Unit tests                                                                                                   | Active |
| Privacy ordinary-role schema USAGE           | migration `0011_prd21_privacy_ordinary_schema_usage` + live `SET LOCAL ROLE` harness                                                         | Disposable append-only privilege posture                                          | Integration tests (UPDATE/DELETE/TRUNCATE deny; INSERT allow)                                                | Active |
| Synthetic data-use evidence/audit inject     | `PrivacySyntheticOptions.evidence` / `.audit` in `apps/api` privacy routes                                                                   | Synthetic API → disposable ledger ports                                           | Tests inject ledger without in-memory seed                                                                   | Active |
| Synthetic data-use audit unavailable 503     | `POST /v1/privacy/synthetic/data-use-evaluate` when injected audit returns `unavailable`                                                     | Synthetic API → fail-closed denied decision; no `allowed` result                  | Unit inject → HTTP 503 denied `audit_unavailable`                                                            | Active |
| Synthetic data-use registry inject           | `PrivacySyntheticOptions.policies` / `.purposes` / `.processors` in `apps/api` privacy routes                                                | Synthetic API → disposable registry ports                                         | Tests inject registries without in-memory seed                                                               | Active |
| Synthetic withdrawal ledger write-through    | `POST /v1/privacy/synthetic/withdrawal-plan` with injected `evidence` ledger                                                                 | Synthetic API → `appendWithdrawal`                                                | Inject + PG integration; data-use `evidence_withdrawn`                                                       | Active |
| Synthetic subject-request PG HTTP            | `POST /v1/privacy/synthetic/subject-request-transition` via PG `subjectRequests`                                                             | Synthetic API → disposable PG subject-request                                     | Integration `createReceived` + transition history                                                            | Active |
| Synthetic runtime-processors PG GET          | `GET /v1/privacy/synthetic/runtime-processors` via PG `listDescriptors`                                                                      | Synthetic API → disposable processor registry                                     | Integration put → GET                                                                                        | Active |
| Synthetic inventory-coverage PG HTTP         | `POST /v1/privacy/synthetic/inventory-coverage` via PG `listDescriptors` + expected port                                                     | Synthetic API → disposable processor registry                                     | Integration matched + `processor_missing`                                                                    | Active |
| Privacy PG persistence bundle                | `createPrivacyPgPersistence` in `apps/api/src/privacy/pg-persistence.ts`                                                                     | Disposable PG evidence/audit/subject-request/policy/purpose/processor             | Unit mock + integration HTTP composition                                                                     | Active |
| Onboarding PG write-through seam             | `apps/api/src/onboarding/pg-persistence.ts` behind `allowSyntheticOnboarding`                                                                | Synthetic API → disposable PG                                                     | Route write-through + hydrate tests                                                                          | Active |
| Coach-bootstrap non-public issuance          | `issueCoachBootstrapInvitation` in `apps/api/src/onboarding/bootstrap.ts`                                                                    | Restricted operator/deployment entry point (not a Fastify route)                  | Unit tests only; no PG persistence wiring yet                                                                | Active |
| Synthetic subject-request transition         | `privacySyntheticSubjectRequestTransitionRequestSchema` / response in `privacy-governance.ts`                                                | Synthetic API → repository port                                                   | Disposable `allowSyntheticPrivacy` tests                                                                     | Frozen |
| Subject-request opaque scope binding         | `subjectScopeId` on `privacySubjectRequestReferenceSchema` + migration `0012`                                                                | Current pointer identity; immutable across transitions                            | Schema + API conflict + PG disposable tests                                                                  | Active |
| Synthetic withdrawal plan                    | `privacySyntheticWithdrawalPlanRequestSchema` / response in `privacy-governance.ts`                                                          | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` tests                                                                     | Frozen |
| Synthetic retention preview                  | `privacySyntheticRetentionPreviewRequestSchema` / response in `privacy-governance.ts`                                                        | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` tests                                                                     | Frozen |
| Synthetic retention execution authorize      | `privacySyntheticRetentionExecutionAuthorizeRequestSchema` / response in `privacy-governance.ts`                                             | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` tests                                                                     | Frozen |
| Synthetic processor plan (test seam)         | `privacySyntheticProcessorPlanRequestSchema` / response in `privacy-governance.ts`, wrapping domain `buildRequestProcessorPlan`              | Synthetic API only                                                                | Disposable `allowSyntheticPrivacy` tests                                                                     | Frozen |
| Retention rule reference                     | `privacyRetentionRuleReferenceSchema` + `PrivacyRetentionRuleRepository` (domain) / `SyntheticPrivacyRetentionRuleRepository`                | Retention rule registry                                                           | Domain repository tests; not yet wired into `planRetentionPreview` or persisted to PG                        | Frozen |
| -------------------------------------------  | -----------------------------------------------------------------------------------------------------------------------------                | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------   | ------ |
| -------------------------------------------  | ---------------------------------------------------------------------------------------------------------------------                        | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------   | ------ |
| Onboarding schema readiness (disposable PG)  | `checkOnboardingSchemaReadiness` / `requiredOnboardingMigrationHashes` in `packages/database`                                                | Migration/table subset-journal readiness                                          | Disposable PG tests; mirrors `checkCatalogDatabaseReadiness` / `checkPrivacyCoreDatabaseReadiness` pattern   | Active |
| -------------------------------------------  | -----------------------------------------------------------------------------------------------------------------------------                | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------   | ------ |
| -------------------------------------------  | -----------------------------------------------------------------------------------------------------------------------------                | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------   | ------ |
| Onboarding principal binding (disposable PG) | `onboarding_principal_binding` table + repository in `packages/database` (migration `0013_prd07_onboarding_principal_binding`)               | Synthetic external-principal binding persistence                                  | Disposable PG tests; insert-once, resolve-on-race; API still in-memory                                       | Active |
| -------------------------------------------  | -----------------------------------------------------------------------------------------------------------------------------                | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------   | ------ |
| -------------------------------------------  | -----------------------------------------------------------------------------------------------------------------------------                | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------   | ------ |
| Governance lifecycle proof (disposable PG)   | `privacy_governance_lifecycle_proof` table + repository in `packages/database` (migration `0014_prd21_privacy_governance_lifecycle_proof`)   | Synthetic governance-lifecycle proof persistence                                  | Disposable PG tests; append-only, keyed by `operationId`; not yet wired into any processor or API route      | Active |

Privacy readiness responses contain every declared component exactly once.
The synthetic API fails mechanism readiness closed when no complete probe is
injected; production readiness remains false under the active legal stop.

Synthetic data-use evaluation requires the explicit `access` capability, a
processor handler bound by the composition root, an exact reviewed expected
inventory entry binding (descriptor/inventory digests, code owner, synthetic
marker, environment applicability, and mechanism-only readiness), a sealed
`IntegrityVerifier` check of policy/evidence content digests, and a sealed
`AttributionVerifier` check that opaque synthetic actor/subject digests match
admitted policy/evidence bindings (`policy_unattributed` on failure — not
technical unavailability). The mandatory audit must be accepted before that
handler executes; denial and audit-unavailable paths never invoke it.

Option A foundation plus reference-only policy/evidence/withdrawal/actor/purpose/
request/audit/processor locators, tagged data-use decisions, and fail-closed
readiness: every declared operation kind has exactly one versioned canonical
profile; `retention_preview` declares `/approvedExceptionIds` as a set-like path
with UTF-8 bytewise sort before digest; `completed` and `partially_failed`
lifecycle results require `proofId`, and `denied` rejects it. Actor context binds
principal identity by digest and closed authority claims only — no raw token,
student/coach ID, or legal role. Purpose versions bind allowed
operations/categories without legal purpose text. Subject requests carry
engineering type/state and verification digests only — not legal entitlement.
Audit events use closed kinds/outcomes and reject free-text metadata. Processor
descriptors declare capabilities/code owner without hosts, regions, or
credentials. Readiness separates `mechanismReady` from `productionReady` and uses
closed diagnostic codes only; compositions under
`LEGAL_PRIVACY_DECISION_REQUIRED` keep `productionReady: false` with
`legal_privacy_decision_required`. Policy/evidence/withdrawal schemas carry
digests and IDs only — no legal copy or participant answers. Withdrawal is
one-way (`withdrawn` only) and never reopens evidence. `DataUseDecision` is a
tagged `allowed` | `denied` union with a closed deny taxonomy — never a boolean
grant. No public Fastify production privacy routes are authorized by this
foundation. Disposable PostgreSQL persistence for Option A policy/purpose/
processor references, subject-request current pointers, append-only
subject-request transition history, and evidence / withdrawal / audit
ledgers may land in additive migrations under `packages/database` for
synthetic test environments only. Append-only / immutable privacy ledgers
are guarded against ordinary UPDATE/DELETE (triggers +
`fitness_os_privacy_ordinary` SELECT/INSERT-only grants). Production
policy activation remains stopped by `LEGAL_PRIVACY_DECISION_REQUIRED`.

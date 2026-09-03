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

| Contract group | Executable schemas | Provider | Consumers | Status |
| Operation kinds and canonical profiles | `privacyOperationKindSchema`, `PRIVACY_CANONICAL_PROFILES`, and profile helpers in `privacy-governance.ts` | Privacy domain / operation ledger | Domain canonicalization, ledger, and tests | Frozen |
| Retention preview set fragment | `retentionPreviewCanonicalInputSchema` and set-sort helpers in `privacy-governance.ts` | Retention preview coordinator | Domain digest/replay and contract tests | Frozen |
| Governance lifecycle proof binding | `governanceLifecycleResultSchema` / `PrivacyLifecycleProofId` in `privacy-governance.ts` | Governance lifecycle processor | Public results, ledger, reconciliation, tests | Frozen |
| Policy package references | `privacyPolicyPackageReferenceSchema` in `privacy-governance.ts` | Policy package adapter | Domain evaluation and tests | Frozen |
| Evidence locators | `privacyEvidenceReferenceSchema` in `privacy-governance.ts` | Authorization evidence store | Domain evaluation, ledger, and tests | Frozen |
| Withdrawal references | `privacyWithdrawalReferenceSchema` in `privacy-governance.ts` | Authorization evidence ledger | Domain evaluation, ledger, and tests | Frozen |
| Data-use decisions | `privacyDataUseDecisionSchema` / `privacyDataUseDenyReasonSchema` in `privacy-governance.ts` | Data-use evaluator | Domain evaluation and tests | Frozen |
| Actor context references | `privacyActorContextReferenceSchema` / `privacyAuthorityClaimSchema` in `privacy-governance.ts` | Identity → privacy adapter | Domain evaluation and tests | Frozen |
| Purpose version references | `privacyPurposeVersionReferenceSchema` in `privacy-governance.ts` | Purpose registry | Domain evaluation and tests | Frozen |
| Subject request references | `privacySubjectRequestReferenceSchema` in `privacy-governance.ts` | Request coordinator | Domain evaluation, ledger, and tests | Frozen |
| Audit event references | `privacyAuditEventReferenceSchema` in `privacy-governance.ts` | Privacy audit sink | Domain evaluation, ledger, and tests | Frozen |
| Processor descriptors | `privacyProcessorDescriptorReferenceSchema` in `privacy-governance.ts` | Runtime processor registry | Domain evaluation, readiness, and tests | Frozen |
| Governance lifecycle proof ledger | `privacyGovernanceLifecycleProofReferenceSchema` + `PrivacyGovernanceLifecycleLedger` (domain) / `SyntheticPrivacyGovernanceLifecycleLedger` | Governance lifecycle proof registry | Domain ledger tests; PG via `createPostgresPrivacyGovernanceLifecycleLedger`; synthetic HTTP seam via `POST /v1/privacy/synthetic/governance-lifecycle-record`, fail-closed behind an exact composition-owned lifecycle binding verifier | Frozen |
| Privacy readiness | `privacyReadinessResultSchema` / diagnostic codes in `privacy-governance.ts` | Privacy readiness composition | API readiness adapters and tests | Frozen |
| Synthetic data-use evaluate (test seam) | `privacySyntheticDataUseEvaluateRequestSchema` / response in `privacy-governance.ts` | Synthetic API only | Disposable `allowSyntheticPrivacy` tests | Frozen |
| Subject-request transition history | `privacySubjectRequestTransitionReferenceSchema` in `privacy-governance.ts` | Append-only request history | Domain/database adapters and tests | Frozen |
| Processor step records | `privacyProcessorStepReferenceSchema` in `privacy-governance.ts` | Append-only per-processor execution attempts (`deriveRequestCompletionFromSteps`) | Domain port/synthetic repository and tests | Frozen |
| Processor execution journal | `privacyProcessorExecutionJournalRecordSchema` + `PrivacyProcessorExecutionJournal` | Durable synthetic/disposable ownership by `operationId`; exact completed replay is readable, while unfinished or ambiguous execution is held for reconciliation and never automatically re-executed | PostgreSQL migration `0023`, guarded repository transitions, domain restart tests, and API PG restart composition; production/destructive execution remains blocked | Active |
| Expected processor inventory | `privacyExpectedProcessorInventorySchema` / `privacyCoveredExpectedProcessorInventorySchema` in `privacy-governance.ts` + `fixtures/privacy/processor-inventory.v1.json` | Reviewed inventory metadata with every governed record family mapped exactly once | Domain expected-inventory port, coverage validation, and tests | Frozen |
| Synthetic subject-data processor | `privacySyntheticProcessorCommandSchema` / result in `privacy-governance.ts` | Synthetic processor simulation (inventory/access/export digests) | Domain `SubjectDataProcessor` fakes and tests | Frozen |
| Synthetic processor execute (test seam) | `privacySyntheticProcessorExecuteRequestSchema` / response in `privacy-governance.ts` | Synthetic API only | Disposable `allowSyntheticPrivacy` tests | Frozen |
| Synthetic inventory coverage (test seam) | `privacySyntheticInventoryCoverageRequestSchema` / response in `privacy-governance.ts` | Synthetic API only | Disposable `allowSyntheticPrivacy` inventory-coverage tests | Frozen |
| Synthetic expected inventory GET (test) | `privacySyntheticExpectedInventoryResponseSchema` in `privacy-governance.ts` | Synthetic API only | Disposable `allowSyntheticPrivacy` expected-inventory GET | Frozen |
| Synthetic runtime processors GET (test) | `privacySyntheticRuntimeProcessorsResponseSchema` in `privacy-governance.ts` | Synthetic API only | Disposable `allowSyntheticPrivacy` runtime-processors GET | Frozen |
| Synthetic processor-step record (test seam) | `privacySyntheticProcessorStepRecordRequestSchema` / response in `privacy-governance.ts` | Synthetic API only — server derives the pinned expected plan, resolves outcome from one exact independent execution receipt, binds request correlation, assigns the trusted timestamp, and derives deterministic transition identity before `recordProcessorStepAndAdvanceRequest` | Disposable `allowSyntheticPrivacy` processor-step-record tests; proves fail-closed plan/receipt/binding checks, exact immutable replay matching, and partial-failure resume/completion; no processor side effect is executed by this seam | Frozen |
| Synthetic governance-lifecycle record (test seam) | `privacySyntheticGovernanceLifecycleRecordRequestSchema` / response in `privacy-governance.ts` | Synthetic API only — exact request/processor/operation/result binding verification before `PrivacyGovernanceLifecycleLedger.append` | Disposable `allowSyntheticPrivacy` tests prove missing, mismatched, ambiguous, or unavailable binding evidence produces zero appends; `synthetic`/`recordedAt` are always server-derived; append-once per `operationId`, replay returns the stored proof as `conflict` | Frozen |
| Onboarding invitation (disposable PG) | `onboarding_invitation` table + repository in `packages/database` | Synthetic onboarding persistence | Disposable PG tests; `put` issued-only; API still in-memory | Active |
| Onboarding attempt (disposable PG) | `onboarding_attempt` table + repository in `packages/database` | Synthetic onboarding persistence | Disposable PG tests; nonterminal put-only; API still in-memory | Active |
| Onboarding operation (disposable PG) | `onboarding_operation` table + repository in `packages/database` | Synthetic onboarding idempotency | Disposable PG tests; append-only put/replay | Active |
| Onboarding role mapping (disposable PG) | `onboarding_role_mapping` table + repository in `packages/database` | Synthetic claim → principal role mapping | Disposable PG tests; claim write-through + hydrate | Active |
| Principal role mapping port | `PrincipalRoleMappingRepository` + synthetic impl in `@fitness-os/domain` | Domain onboarding ports | Unit tests; PG via `asPrincipalRoleMappingRepository` | Active |
| Onboarding invitation port | `OnboardingInvitationRepository` + `SyntheticOnboardingInvitationRepository` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; PG via `asOnboardingInvitationRepository` | Active |
| Onboarding attempt port | `OnboardingAttemptRepository` + `SyntheticOnboardingAttemptRepository` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; PG via `asOnboardingAttemptRepository` | Active |
| Onboarding attempt timeout evaluation | `evaluateAttemptTimeout` in `packages/domain/src/onboarding/attempt.ts` | Domain onboarding ports | Unit tests covering absolute/inactivity boundaries and fail-closed rejection of non-finite/non-positive/backward-clock input; not yet wired into attempt creation/resume routes, `AttemptDetail`, or persisted bounds | Active |
| Onboarding operation port | `OnboardingOperationRepository` + `SyntheticOnboardingOperationRepository` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; PG via `asOnboardingOperationRepository` | Active |
| Onboarding trusted clock | `TrustedClock` + `FixedTrustedClock` / `SystemTrustedClock` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; optional inject in `createOnboardingPgPersistence` | Active |
| Onboarding invitation secret verifier | `InvitationSecretVerifier` + `HmacInvitationSecretVerifier` in `@fitness-os/domain` | Domain onboarding ports | Unit tests | Active |
| Onboarding readiness probe | `OnboardingReadinessProbe` + `SyntheticOnboardingReadinessProbe` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; productionReady stays false under LEGAL_PRIVACY; real clock/id/secret self-tests can be supplied to `createPostgresOnboardingReadinessProbe` | Active |
| Onboarding policy gateway | `OnboardingPolicyGateway` + `SyntheticOnboardingPolicyGateway` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; blocks synthetic_in_production | Active |
| Onboarding identity session port | `IdentitySessionPort` + `SyntheticIdentitySessionPort` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; denies synthetic_in_production | Active |
| Onboarding identity session store | `IdentitySessionStore` + `SyntheticIdentitySessionStore` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; opaque session only | Active |
| Onboarding transition sink | `OnboardingTransitionSink` + `SyntheticOnboardingTransitionSink` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; append-only | Active |
| Onboarding claim repository | `OnboardingClaimRepository` + `SyntheticOnboardingClaimRepository` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; denies synthetic_in_production | Active |
| Onboarding principal binding | `PrincipalBindingRepository` + `SyntheticPrincipalBindingRepository` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; denies synthetic_in_production | Active |
| Onboarding principal reference deriver | `PrincipalReferenceDeriver` + `SyntheticPrincipalReferenceDeriver` in `@fitness-os/domain` | Domain onboarding ports | Unit tests; denies synthetic_in_production | Active |
| Onboarding ID/secret factories | `OnboardingIdFactory` / `OnboardingSecretFactory` + crypto impls in `@fitness-os/domain` | Domain onboarding ports | Unit tests | Active |
| Onboarding claim-secret throttle | `ClaimFailureTracker` + `SyntheticClaimFailureTracker`, `evaluateClaimThrottle`, `checkClaimThrottle` in `@fitness-os/domain`; PG implementation via `createPostgresClaimFailureTracker` and `onboarding_claim_failure` (`0024`) | Domain onboarding ports; wired into `POST /v1/onboarding/invitations/inspect` and `POST /v1/onboarding/attempts` | Unit + disposable PG tests; PG implementation is available for injection but not yet composed by the environment platform helper or server bootstrap | Active |
| Privacy ordinary-role schema USAGE | migration `0011_prd21_privacy_ordinary_schema_usage` + live `SET LOCAL ROLE` harness | Disposable append-only privilege posture | Integration tests (UPDATE/DELETE/TRUNCATE deny; INSERT allow) | Active |
| Synthetic data-use evidence/audit inject | `PrivacySyntheticOptions.evidence` / `.audit` in `apps/api` privacy routes | Synthetic API → disposable ledger ports | Tests inject ledger without in-memory seed | Active |
| Synthetic data-use audit unavailable 503 | `POST /v1/privacy/synthetic/data-use-evaluate` when injected audit returns `unavailable` | Synthetic API → fail-closed denied decision; no `allowed` result | Unit inject → HTTP 503 denied `audit_unavailable` | Active |
| Synthetic data-use registry inject | `PrivacySyntheticOptions.policies` / `.purposes` / `.processors` in `apps/api` privacy routes | Synthetic API → disposable registry ports | Tests inject registries without in-memory seed | Active |
| Synthetic withdrawal ledger write-through | `POST /v1/privacy/synthetic/withdrawal-plan` with injected `evidence` ledger | Synthetic API → `appendWithdrawal` | Inject + PG integration; data-use `evidence_withdrawn` | Active |
| Synthetic subject-request PG HTTP | `POST /v1/privacy/synthetic/subject-request-transition` via PG `subjectRequests` | Synthetic API → disposable PG subject-request | Integration `createReceived` + transition history | Active |
| Synthetic runtime-processors PG GET | `GET /v1/privacy/synthetic/runtime-processors` via PG `listDescriptors` | Synthetic API → disposable processor registry | Integration put → GET | Active |
| Synthetic inventory-coverage PG HTTP | `POST /v1/privacy/synthetic/inventory-coverage` via PG `listDescriptors` + expected port | Synthetic API → disposable processor registry | Integration matched + `processor_missing` | Active |
| Privacy PG persistence bundle | `createPrivacyPgPersistence` in `apps/api/src/privacy/pg-persistence.ts` | Disposable PG evidence/audit/subject-request/policy/purpose/processor/processor-step/execution-journal/governance-lifecycle/retention-preview/retention-rule | Unit mock + disposable PG integration; `createPrivacyPlatformFromEnv` composes the bundle, lifecycle verifier, and base PG readiness helper, but server bootstrap and exact inventory/runtime injection remain open | Active |
| Onboarding PG write-through seam | `apps/api/src/onboarding/pg-persistence.ts` behind `allowSyntheticOnboarding` | Synthetic API → disposable PG | Route write-through + hydrate tests; full issue→claim chain, invitation revoke/replay, and attempt resume/abandon/replay verified end-to-end against disposable Postgres | Active |
| Coach-bootstrap non-public issuance | `issueCoachBootstrapInvitation` in `apps/api/src/onboarding/bootstrap.ts` | Restricted operator/deployment entry point (not a Fastify route) | Unit tests; PG write-through verified via disposable-PG integration test | Active |
| Synthetic subject-request transition | `privacySyntheticSubjectRequestTransitionRequestSchema` / response in `privacy-governance.ts` | Synthetic API → repository port | Disposable `allowSyntheticPrivacy` tests | Frozen |
| Subject-request opaque scope binding | `subjectScopeId` on `privacySubjectRequestReferenceSchema` + migration `0012` | Current pointer identity; immutable across transitions | Schema + API conflict + PG disposable tests | Active |
| Synthetic withdrawal plan | `privacySyntheticWithdrawalPlanRequestSchema` / response in `privacy-governance.ts` | Synthetic API only | Disposable `allowSyntheticPrivacy` tests | Frozen |
| Synthetic retention preview | `privacySyntheticRetentionPreviewRequestSchema` / response in `privacy-governance.ts` | Synthetic API only | Disposable `allowSyntheticPrivacy` tests; optional `retentionRuleSelection` request field additively routes through `planRetentionPreviewWithRetentionRule` via an injectable `retentionRules` port (defaults to an unseeded `SyntheticPrivacyRetentionRuleRepository`, fail-closed `no_active_retention_rule`); omitting it preserves the prior unconditional `planRetentionPreview` behavior exactly; a rule-aware planned preview's `retentionRuleDigest`/`retentionRuleVersionId` are response-only and are not persisted by the `retentionPreviews` write-through, which still writes only the frozen `privacyRetentionPreviewRecordSchema` shape | Frozen |
| Synthetic retention execution authorize | `privacySyntheticRetentionExecutionAuthorizeRequestSchema` / response in `privacy-governance.ts` | Synthetic API only; caller supplies `operationId`, `productionMode`, `requestedSelectionDigest`, and explicit `previewTtlMs`; exact replay input is canonically bound to selection digest + TTL | Disposable `allowSyntheticPrivacy` tests; legacy caller-supplied state/digest booleans are rejected; responses distinguish first `executed`, identical-input `idempotent_replay`, and reused-operation/input `conflict` | Frozen |
| Retention execution persisted-preview lookup | `resolveRetentionExecutionAuthorization` in `packages/domain`, composed by `POST /v1/privacy/synthetic/retention-execution-authorize` | Loads the exact preview, current inventory/processor digests, and trusted time before atomically marking the preview executed; no destructive processor action occurs | Domain tests cover authorization and synthetic transition/replay; API tests cover trusted-port execution, replay/conflict, legacy rejection, production deny with zero reads, missing evidence, and 503 failures | Active |
| Synthetic processor plan (test seam) | `privacySyntheticProcessorPlanRequestSchema` / response in `privacy-governance.ts`, wrapping domain `buildRequestProcessorPlan` | Synthetic API only | Disposable `allowSyntheticPrivacy` tests | Frozen |
| Retention rule reference | `privacyRetentionRuleReferenceSchema` + `PrivacyRetentionRuleRepository` (domain) / `SyntheticPrivacyRetentionRuleRepository` | Retention rule registry | Domain repository tests; exact active-rule selection and opaque digest binding are wired into the synthetic retention-preview route via optional `retentionRuleSelection` and injectable `retentionRules`; the default registry is unseeded and fail-closed | Frozen |
| Retention rule (disposable PG) | `privacy_retention_rule` table + `createPostgresPrivacyRetentionRuleRepository` in `packages/database` (migrations `0018_prd21_privacy_retention_rule` + `0019_prd21_privacy_retention_rule_guard`) | Reuses the frozen `privacyRetentionRuleReferenceSchema` unmodified; append-only UPDATE/DELETE guard with ordinary-role SELECT/INSERT only | Disposable PG integration tests, including live ordinary-role access; immutable per `ruleVersionId`, conflict on repeat; available for injection but not the default in server bootstrap | Active |
| Processor step (disposable PG) | `privacy_processor_step` table + `createPostgresPrivacyProcessorStepRepository` in `packages/database` (migration `0014_prd21_privacy_processor_step`) | Reuses the frozen `privacyProcessorStepReferenceSchema` (Option A) unmodified | Disposable PG integration tests; append-only guard; wired into `apps/api`'s `createPrivacyPgPersistence` bundle (`processorSteps`) | Active |
| Onboarding schema readiness (disposable PG) | `checkOnboardingSchemaReadiness` / `requiredOnboardingMigrationHashes` in `packages/database` | Migration/table subset-journal readiness | Disposable PG tests; mirrors `checkCatalogDatabaseReadiness` / `checkPrivacyCoreDatabaseReadiness` pattern | Active |
| Onboarding readiness probe (disposable PG) | `createPostgresOnboardingReadinessProbe` in `packages/database` | Wraps a base probe; replaces `schema` plus invitation/attempt/operation/role-mapping repository components with real schema evidence and optionally replaces clock/id/secret components with supplied self-tested instances; recomputes `mechanismReady` | Disposable PG tests; `createOnboardingPlatformFromEnv` supplies the same mechanism instances used by routes, but the helper is not wired into server bootstrap; `productionReady` stays false | Active |
| Onboarding principal binding (disposable PG) | `onboarding_principal_binding` table + repository in `packages/database` (migration `0013_prd07_onboarding_principal_binding`) | Synthetic external-principal binding persistence | Disposable PG tests; insert-once, resolve-on-race; composed into `createOnboardingPgPersistence` (`apps/api`), not the default in server bootstrap | Active |
| Governance lifecycle proof (disposable PG) | `privacy_governance_lifecycle_proof` table + repository in `packages/database` (migration `0015_prd21_privacy_governance_lifecycle_proof`) | Synthetic governance-lifecycle proof persistence | Disposable PG tests; append-only, keyed by `operationId`; wired into `apps/api`'s `createPrivacyPgPersistence` bundle (`governanceLifecycle`); reachable via `POST /v1/privacy/synthetic/governance-lifecycle-record` only when both the ledger and a trusted exact-binding verifier are composed | Active |
| Governance lifecycle binding verifier (disposable PG) | `createPostgresPrivacyGovernanceLifecycleBindingVerifier` in `packages/database` | `PrivacyGovernanceLifecycleBindingVerifier` (domain port); post-persistence lookup against the real append-only proof ledger, not a pre-append authority when pointed at that same target | Disposable PG integration tests covering exact match, missing operation, mismatched proofId/outcome/requestId/processorId, and a sealed denied outcome; not composed as the route's pre-append verifier | Active |
| Governance execution receipt source | `PrivacyGovernanceExecutionReceiptSource` + `createPrivacyGovernanceExecutionReceiptVerifier` in `packages/domain`; optional `governanceExecutionReceipts` API composition | Read-only, plural lookup from an execution/coordinator authority or explicitly separate evidence source; structurally distinct from the append-target lifecycle ledger; an explicit verifier takes precedence | Domain tests cover exact, absent, mismatched, ambiguous, and unavailable receipts; API test proves verification against the independent source before append to a separate empty ledger | Active |
| Processor execution receipt source | `privacyProcessorExecutionReceiptSchema` + `PrivacyProcessorExecutionReceiptSource` + `createPrivacyProcessorExecutionReceiptVerifier`; optional `processorExecutionReceipts` API composition | Independent read-only outcome evidence; exact request/processor/capability/operation/correlation binding is required before processor-step append | Domain and synthetic API tests cover exact, absent, mismatched, ambiguous, and unavailable receipts; caller-supplied outcome is rejected; no processor execution side effect | Active |
| Synthetic processor coordinator (test seam) | `privacySyntheticProcessorCoordinateRequestSchema` / response + `PrivacyProcessorExecutionCoordinator` + `coordinateSyntheticProcessorStep` | Synthetic API only; stable pinned plan selects the next non-destructive processor/capability, a descriptor-bound execution authority exposes the outcome through a separate receipt source, and an optional durable journal reserves before execute | Domain/API tests cover server-selected execution, exact in-process and durable restart replay without re-execution, ambiguous-result reconciliation, descriptor mismatch, caller-authority rejection, and production/destructive hard-disable; automated reconciliation and production remain open | Frozen |
| Privacy readiness probe | `PrivacyReadinessProbe` + `SyntheticPrivacyReadinessProbe` in `@fitness-os/domain` | Domain privacy-governance ports | Unit tests; productionReady stays false under LEGAL_PRIVACY | Active |
| Privacy schema readiness (disposable PG) | `createPostgresPrivacyReadinessProbe` in `packages/database`, wrapping core/lifecycle/recovery checks and optional expected-inventory/runtime comparison | Overrides `migrations`/`repositories`/`audit_sink`/`governance_lifecycle`/`recovery`; optionally binds `expected_inventory`/`runtime_processors`; identity boundary and policy package mirror the base probe | Disposable PG integration tests; `createPrivacyPlatformFromEnv` composes the base PG probe but does not yet supply exact inventory/runtime ports and is not wired into server bootstrap | Active |
| Onboarding transition (disposable PG) | `onboarding_transition` table + sink in `packages/database` (migration `0016_prd07_onboarding_transition`) | Synthetic onboarding transition evidence | Disposable PG tests; append-only, dedup on exact-tuple repeat; composed into `createOnboardingPgPersistence`'s `transitions` field (`apps/api`) as an injectable `transitionSink`, not the default in server bootstrap | Active |
| Retention preview record | `privacyRetentionPreviewRecordSchema` in `privacy-governance.ts` | Retention preview persistence | Domain/database adapters and tests | Frozen |
| Retention preview (disposable PG) | `privacy_retention_preview` table + repository in `packages/database` (migrations `0017`, `0020`–`0022`) | Synthetic retention preview persistence plus nullable-at-rest operation/input binding, unique operation ownership, and staged `NOT VALID` guards that preserve unattributed legacy executed rows while validating every new write | Disposable PG tests cover upgrade from `0019`, atomic compare-and-set, exact-input replay, cross-input conflict, and concurrent winners; API composition remains behind `allowSyntheticPrivacy` | Active |
| Retention preview repository port | `PrivacyRetentionPreviewRepository.markExecuted` + synthetic and PostgreSQL adapters | Atomic `planned` → `executed`, first trusted `executedAt`, and one winning `operationId` bound to the canonical selection-digest/TTL input digest; unknown digest, replay, and conflict are typed | Domain unit tests and disposable PG integration tests; no deletion/transformation side effect | Active |

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

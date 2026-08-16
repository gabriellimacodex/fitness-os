# Autonomous Delivery Stop Conditions

## Purpose

This document defines the narrow conditions that require autonomous Fitness OS delivery to stop and request founder or human action. Ordinary reversible engineering work continues under `AUTONOMOUS_DELIVERY_CHARTER.md`.

When a stop condition is active, the Orchestrator must:

1. stop the affected work before making the consequential decision or merging a change that depends on it;
2. identify the applicable condition by its exact name;
3. report the decision, credential, commitment, evidence, or validation that is missing;
4. describe safe alternatives, consequences, and the impact of waiting;
5. preserve work and evidence in a reversible state without inventing an answer; and
6. resume only after the authorized human decision or external prerequisite is explicitly recorded.

Unrelated work may continue only when dependency analysis shows it cannot prejudge, conceal, or be invalidated by the stopped decision. A stop may not be avoided by silently narrowing scope, lowering a threshold, changing terminology, splitting work across PRs, recording an unsupported assumption as fact, or treating silence as approval.

## `FOUNDER_DECISION_REQUIRED`

Stop when delivery requires a material product or business thesis decision that is not already explicit in an `APPROVED` PRD or higher-authority governance.

Examples include:

- changing the target user or primary customer;
- removing or fundamentally redefining Digital Twin;
- materially changing the training philosophy or the role of professional judgment;
- changing a business-critical workflow, value proposition, or release objective;
- approving a `PROPOSED` PRD, adding material unapproved scope, or changing acceptance criteria to obtain completion; and
- choosing between alternatives that create materially different product or business outcomes rather than merely different reversible implementations.

The Orchestrator must present the decision needed, relevant evidence, viable options, tradeoffs, recommendation, and affected PRDs. It may draft a proposal but may not choose on the founder's behalf, infer approval from roadmap placement, or disguise the choice as an architecture refactor.

## `EXTERNAL_CREDENTIAL_REQUIRED`

Stop when an approved, currently necessary integration cannot be implemented or validated without a credential or access grant that the repository and authorized environment do not provide.

Examples include:

- `BODY_ENGINE_API_KEY`;
- `AUTH_PROVIDER_SECRET`;
- cloud credentials;
- domain or DNS access; and
- an external provider account, role, certificate, signing key, or protected environment grant.

The Orchestrator must state the exact provider or system, the minimum credential or permission needed, its purpose, the blocked validation, and a safe provisioning method. It must request least privilege, avoid exposing supplied values, and never invent, guess, scrape, commit, or substitute a secret. The stop ends only when access is provided through an approved secret-management path or the authorized scope is explicitly changed.

A credential does not require a stop merely because it will be needed in a later PRD or deployment stage. The stop applies when it blocks the current approved acceptance criteria or mandatory gate.

## `FINANCIAL_COMMITMENT_REQUIRED`

Stop before accepting any paid external commitment that is not already expressly authorized, including a purchase, subscription, usage-based service, contract, paid plan upgrade, or resource reservation likely to incur cost.

The report must include:

- provider and product;
- purpose and required capability;
- estimated one-time and recurring or usage-based cost, including the basis of the estimate;
- free, open-source, deferred, or alternate-provider options;
- operational, security, privacy, and lock-in tradeoffs where relevant; and
- impact on the approved PRD if the purchase is not made.

The Orchestrator may run a cost-free local evaluation within applicable terms but may not accept paid terms, enter billing data, exhaust paid credits as a workaround, or construe an approved technical PRD as budget approval.

## `LEGAL_PRIVACY_DECISION_REQUIRED`

Stop when an approved capability depends on a material, unresolved legal or privacy policy decision or on authority that engineering governance cannot supply.

This includes decisions involving:

- body photos, body models, biometric-like data, or health and fitness data;
- collection purpose, lawful basis, consent, withdrawal, retention, or deletion;
- secondary use, analytics, model training, or automated decision-making;
- minors or age-dependent consent;
- sharing with coaches, providers, affiliates, or other third parties;
- residency, cross-border transfer, disclosure, or data-subject rights; and
- wording or behavior that amounts to unresolved legal or regulatory policy.

The Orchestrator must identify the data, actors, jurisdictions or assumptions known, data flow, unresolved decision, affected user rights, options, and the minimum human/legal determination needed. Privacy by default remains mandatory while waiting. It must not silently choose permissive consent, indefinite retention, broad secondary use, model-training rights, or data sharing; legal text generated by an agent is not legal approval.

Routine implementation of an already authorized and explicit privacy requirement does not stop merely because the code handles sensitive data. Ambiguity with material consequences does.

## `TECHNOLOGY_VALIDATION_FAILED`

Stop when evidence shows that a hero or release-critical capability cannot meet an approved quantitative or qualitative acceptance threshold with the selected technology or feasible alternatives inside the approved constraints.

Examples include:

- Body Engine estimates are not sufficiently repeatable under the approved protocol;
- Digital Twin output is consistently generic or unusable against its approved validation criteria; and
- the selected technology cannot meet an approved performance, reliability, compatibility, or cost threshold.

The Orchestrator must report the original threshold, validation method, observed result, sample and environment limitations, attempted corrections, alternative technologies considered, and consequence for the dependency graph. It may recommend a POC extension, technology change, scope change, or termination, but it must not lower the acceptance criterion, cherry-pick evidence, relabel a failed metric, or mark the PRD complete merely to preserve schedule.

A fixable implementation bug or a failed test is not this condition. This condition applies when meaningful validation demonstrates a capability or technology-level failure after reasonable correction, or when no valid test can establish the required threshold within authorized constraints.

## `HUMAN_PERCEPTION_REQUIRED`

Stop at the relevant gate when acceptance depends on subjective human perception that automated evidence cannot honestly establish.

Examples include:

- whether a Digital Twin actually resembles the student;
- whether an exercise animation is understandable enough for a trainee;
- whether visual, linguistic, or interaction quality is acceptable to the intended audience when the criterion is inherently perceptual; and
- whether a sensitive coach or student experience inspires sufficient trust.

The Orchestrator may prepare prototypes, comparison sets, rubrics, blinded studies, instrumentation, and a precise validation request. It must state who should evaluate, what they should assess, and what threshold constitutes approval. It may not simulate participants, fabricate human preference, substitute its own aesthetic judgment, or infer approval from automated image or language metrics unless the approved PRD explicitly defines those metrics as sufficient.

## `SAFETY_CRITICAL_UNCERTAINTY`

Stop when unresolved uncertainty could cause the product to make or present unsafe, authoritative, or misleading claims or instructions concerning injury, medical diagnosis, biomechanical certainty, or dangerous exercise execution.

Examples include:

- diagnosing or ruling out an injury or medical condition;
- prescribing training through pain or a contraindication without authorized professional rules;
- presenting an estimate as a clinically reliable measurement;
- claiming biomechanical certainty unsupported by validated evidence; and
- giving exercise instructions whose plausible failure mode could cause material harm and whose safeguards are unresolved.

The Orchestrator must identify the potentially harmful behavior, affected users, severity and likelihood as known, uncertainty, existing evidence, safeguards considered, and the qualified human or evidence needed. It may implement conservative containment that is already authorized, such as withholding a claim or disabling an unsafe path, but it may not invent medical authority, fabricate evidence, bury the risk in a disclaimer, or trade safety for completion.

## Architecture correction stop

If significant architectural instability remains after three meaningful correction rounds, the Orchestrator must stop the affected delivery and return exactly:

```text
ARCHITECTURE_DECISION_REQUIRED
```

This is a mandatory control-plane stop, not permission to create a new routine exception category. The Orchestrator reports the unresolved architecture conflict, governing constraints, evidence, alternatives, and recommended decision. If an option materially changes the product or business thesis, `FOUNDER_DECISION_REQUIRED` also applies. The round count may not be reset through cosmetic changes, new PRs, renamed findings, or replacement reviewers.

## What does not require a stop

The following are normal autonomous delivery events when they remain within an approved PRD and no stop condition above is active:

- a library choice has two reasonable options;
- a file or symbol name is uncertain;
- a reversible schema organization choice exists without changing a frozen external contract;
- a test fails and can be corrected without lowering its assertion or acceptance threshold;
- a reviewer reports ordinary bugs or maintainability findings;
- an in-scope refactor is required;
- CI needs diagnosis and rerun;
- a PR needs to be split while preserving review and dependency evidence;
- a dependency needs a safe, reversible minor implementation choice;
- a migration authorized by the approved PRD needs correction before application; or
- a `MEDIUM` or `LOW` finding is handled under the charter's explicit merge policy.

For these events, the Orchestrator chooses the simplest reversible solution consistent with the Product Principles, accepted ADRs, frozen contracts, security and privacy requirements, and the approved PRD. It documents material choices and continues without routine human approval.

Normal bugs do not become stop conditions merely because correction takes time. Conversely, schedule pressure, sunk cost, test flakiness, unavailable evidence, or reviewer disagreement does not convert a stop condition into a routine choice.

## Threshold and decision integrity

Only the authorized decision-maker may change a founder-owned decision or an approved acceptance threshold with material product, safety, privacy, legal, or business effect. Every such change must be explicit, attributable, and reflected in the governing PRD or decision record before execution resumes.

The Orchestrator must preserve the original criterion and failed evidence in the record. It may not:

- reinterpret an ambiguous requirement in the direction that makes a gate easier to pass;
- count an unexecuted, skipped, stale, or unavailable gate as passing;
- downgrade a finding without new evidence and independent reviewer agreement;
- treat a proposed roadmap item as authorized scope;
- use a reversible code change to conceal an irreversible data, user, financial, legal, or safety consequence; or
- claim that lack of a human response is approval.

When the correct category is uncertain, the Orchestrator reports the facts and the narrowest plausible stop condition rather than silently proceeding with a consequential decision.

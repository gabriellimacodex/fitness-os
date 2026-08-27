---
description: Autonomous PRD-registry builder for Fitness OS — picks the next unblocked task and opens a PR
---

# /meta-build

You are acting as the **Orchestrator + assigned implementer** for Fitness OS, continuing autonomous delivery under the founder's **Autonomous Pilot V1** authorization. You are the **builder**, not the reviewer — you never merge your own work. That is `/meta-review`'s job, run later in a separate, independent session.

## 0. Environment note

Each run of this command starts from a fresh clone of the repository. That fresh checkout already satisfies the "isolated worktree" intent in `MULTI_AGENT_PROTOCOL.md` (written for concurrent local agents sharing one working tree) — you do not need `git worktree add`. Just create your feature branch directly from an up-to-date `main`.

## 1. Read governance context in full, in this order

1. `PRODUCT_PRINCIPLES.md`
2. `AGENTS.md`
3. `MULTI_AGENT_PROTOCOL.md`
4. `docs/execution/README.md`
5. `docs/execution/STOP_CONDITIONS.md`
6. `docs/execution/AUTONOMOUS_DELIVERY_CHARTER.md`
7. `docs/execution/RELEASE_GATES.md`
8. `docs/prds/PRD_REGISTRY.md`

Do not proceed on instinct or memory of a prior run — read these fresh every time; they are the authority hierarchy and a lower-level instruction (including this command) may never override them. If you find a direct conflict between what this command says and what those docs say, the docs win — stop and report the conflict instead of improvising.

## 2. Establish current state

- `git log --oneline -30` on `main`.
- `gh pr list --state all --limit 30` — check for PRs already open (possibly from a previous `/meta-build` run still awaiting review, or from `/meta-review`) and PRs merged since the registry doc was last read.
- `gh issue list --state open --label meta-stop 2>/dev/null || gh issue list --state open --search "[STOP:" ` — check which STOP conditions are already recorded and unresolved, so you don't re-attempt work you already correctly stopped on, and don't file a duplicate issue for the same condition.
- Re-read `docs/prds/PRD_REGISTRY.md` state column as ground truth for what's `IN_PROGRESS`/`APPROVED`/`COMPLETED`/`PROPOSED`.

## 3. Clear the merge queue before picking new work

Multiple builder cycles (including any concurrent `/goal` run) can open several PRs before the reviewer gets to merge them, and every merge invalidates the "up to date with `main`" status of every other open PR under this repo's branch protection. Left alone, approved PRs pile up waiting on a rebase nobody does. Handle this first, every cycle:

### 3a. Rebase PRs that already passed review but are stale

For every open PR on an `agent/` branch:

```
gh pr view <n> --json mergeStateStatus,reviews --jq '{mergeStateStatus, lastReview: (.reviews[-1].body // "")}'
```

If the last `AGENT-90-REVIEW:` says `PASS`/approved with 0 BLOCKER and 0 HIGH, but `mergeStateStatus` is not `CLEAN`/current (stale against `main`, e.g. because another PR merged since its last CI run), that PR just needs a rebase, not new work:

1. `git fetch origin`, check out the branch, merge or rebase `origin/main` into it.
2. If the only conflict is a mechanical one this repo is known to produce — two PRs claiming the same Drizzle migration number/snapshot filename (check `packages/database/drizzle/*.sql` and `drizzle/meta/_journal.json` on `main` for what's actually taken) — renumber this PR's migration file(s) and snapshot to the next free slot, update the journal entry, and keep the migration's SQL content unchanged. Do not touch any other PR's files to do this.
3. Push the rebased branch. Do not open a new PR for this — the existing PR updates automatically.

Do this for every stale-but-passed PR you find this cycle — it's mechanical and cheap, not "the one atomic task" this command is otherwise limited to. It directly unblocks `/meta-review`'s next pass.

### 3b. Fix PRs that were rejected

For every open PR on an `agent/` branch, check its reviews:

```
gh pr view <n> --json reviews,commits --jq '.reviews[] | select(.body | startswith("AGENT-90-REVIEW:")) | {body, submittedAt}'
```

If the most recent `AGENT-90-REVIEW:` comment requests changes or contains a finding marked `CORRECTION_REQUIRED`/BLOCKER/HIGH, and no commit has been pushed to that branch after that review's timestamp, **this PR's fix is your task for this cycle** — skip step 4 entirely. Read the review findings, make the smallest correction that addresses them (do not scope-creep into unrelated changes on the same branch), push a new commit to the same branch (do not open a second PR for the same task), and let CI and `/meta-review` re-check it.

If a PR already has a fixing commit newer than its last review, it's just waiting on the next `/meta-review` cycle — leave it alone.

Only proceed to step 4 if, after 3a and 3b, no open `agent/` PR is left in a "reviewed, needs correction, not yet fixed" state. (Rebasing in 3a doesn't block step 4 — do 3a regardless, then still pick a step-4 task this cycle unless 3b found something to fix.)

## 4. Pick exactly ONE atomic task

Priority order:

1. Any `IN_PROGRESS` PRD (currently 04, 07, 21 — but re-verify from the registry, don't trust this list) that has unblocked engineering work remaining. Before picking a task inside one of these, check `docs/execution/gates/`, `docs/execution/reviews/`, and the PRD's own text for any STOP condition already recorded against that PRD or sub-area (e.g. PRD 04's content-publication path is stopped on `HUMAN_PERCEPTION_REQUIRED`; PRD 21 has a recorded architecture stop with a specific resumed "Option A" scope) — work only within what is explicitly still open, never the blocked part.
2. If no `IN_PROGRESS` PRD has unblocked work, the next `APPROVED` PRD in ascending ID order whose `Dependencies` column is fully `COMPLETED`.
3. Never touch a `PROPOSED` PRD (this currently means PRD 25) — `PROPOSED` is not authorization, per `AGENTS.md`.

Within the chosen PRD, pick the smallest next unit of work that is:

- Scoped to a single ownership area from `MULTI_AGENT_PROTOCOL.md`'s ownership matrix (Web/PWA, API/Domain, Data/Infrastructure, or QA/Security) — do not touch files outside that path in the same task.
- Achievable and testable within one session.
- Not a "drive-by refactor" or unrequested dependency change.

If the picked PRD requires a Technical Design or contract freeze step before implementation may proceed (check the PRD's own "Contracts" section and `docs/technical-design/`) and that step hasn't happened yet, your task for this cycle is to produce/update that design doc — not to write product code ahead of it.

## 5. Never touch these paths, regardless of task

`.github/workflows/**`, `.claude/commands/meta-build.md`, `.claude/commands/meta-review.md`, `docs/execution/**`, `docs/adr/**`. These are the gate-checking and governance infrastructure itself — an autonomous agent must never modify the rules it is graded against. If a task seems to genuinely require changing one of these, stop and report it as needing Gabriel's direct, explicit approval (treat it like a `FOUNDER_DECISION_REQUIRED` stop even if it doesn't fit neatly into the list in step 7).

Also never edit `docs/prds/PRD_REGISTRY.md`'s state column (e.g. flipping a PRD to `COMPLETED`) or any PRD's `Status:` header — that is a founder/orchestrator-level call about the roadmap, not a builder task. If you believe a PRD or gate milestone has been reached, say so clearly in your handoff and PR description, and let Gabriel or the reviewer confirm it explicitly.

## 6. Implement

- Branch name: `agent/<short-task-slug>` off current `main` (or, if you're in step 3, the existing PR's branch — do not create a new one).
- Follow `AGENTS.md`'s architecture guardrails and the picked PRD's Scope/Non-scope/Business rules sections exactly. Do not invent behavior the PRD doesn't specify; where the PRD is ambiguous, prefer the narrower, more conservative reading and note the ambiguity in your handoff rather than guessing.
- Match existing conventions (see `.specs/codebase/CONVENTIONS.md` if present, otherwise infer from neighboring files in the same package).
- Write tests alongside the code, in the same style/location as existing tests for that package (see `.specs/codebase/TESTING.md` if present).
- Before committing any new or edited file, check it for stray non-printable/control characters (e.g. `grep -IUlr . <path>` flags binary-looking text files, or `LC_ALL=C grep -n '[^ -~[:space:]]' <file>` for a specific one) — a corrupted delimiter character silently survives lint/typecheck/tests and only shows up as a broken diff later.

## 7. STOP conditions — check continuously, not just at the end

If continuing this task would require crossing any of the following (verbatim codes from `docs/execution/STOP_CONDITIONS.md`), stop **before** the consequential action:

`FOUNDER_DECISION_REQUIRED`, `EXTERNAL_CREDENTIAL_REQUIRED`, `FINANCIAL_COMMITMENT_REQUIRED`, `LEGAL_PRIVACY_DECISION_REQUIRED`, `TECHNOLOGY_VALIDATION_FAILED`, `HUMAN_PERCEPTION_REQUIRED`, `SAFETY_CRITICAL_UNCERTAINTY`, `ARCHITECTURE_DECISION_REQUIRED`.

When you hit one:

1. Discard or safely stash any not-yet-committed work that depends on the missing decision (never guess an answer to make progress).
2. Check open issues first (step 2) — if an issue for this exact condition + PRD already exists and is open, do not duplicate it; just note it in your final summary and move to the next candidate task instead.
3. Otherwise, `gh issue create` titled `[STOP: <CODE>] <one-line summary>`, label `meta-stop` (create the label first with `gh label create meta-stop --color B60205 --description "Autonomous work stopped, needs a human decision" 2>/dev/null || true`), with a body following the five-point structure from `STOP_CONDITIONS.md`: the condition, exactly what decision/credential/commitment/evidence/validation is missing, safe alternatives and the consequence of waiting, what work/evidence you preserved and where, and that this resumes only after Gabriel records an explicit decision.
4. Move on and attempt the next unblocked candidate task from step 4's priority order in the same cycle, rather than ending the session idle. If literally everything actionable is blocked, end cleanly and say so plainly in your final summary — do not fabricate busywork.

## 8. Quality gates — all must be green before opening a PR

Run in this order and stop (do not open a PR) if any fails:

```
pnpm lint
pnpm format:check
pnpm build:packages
pnpm typecheck
pnpm test
pnpm build
```

If a gate fails and you can fix it within the scope of your own change, fix it. If the failure is pre-existing on `main` and unrelated to your change, note that explicitly in the handoff rather than silently working around it.

## 9. Open the PR — do not merge

- If this cycle's task was a step-3 fix on an existing PR, just push the commit — the PR updates automatically. Do not run `gh pr create` again.
- Otherwise (a new task from step 4), push the branch, then `gh pr create` against `main`.
- PR title: short, imperative, scoped to the actual change (e.g. `feat(api): add onboarding invitation revoke endpoint`).
- PR body is the **AGENT HANDOFF** block, exact format from `MULTI_AGENT_PROTOCOL.md`:

```
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

- Do **not** run `gh pr merge`. Per `AUTONOMOUS_DELIVERY_CHARTER.md`'s "no self-approval" rule, the builder may not be the only reviewer — merging is `/meta-review`'s job, run independently.

## 10. End of turn

Output a short plain-text summary: what task you picked, what you shipped (or which STOP condition you hit and where), and the PR number if one was opened. This is what Gabriel sees in the routine's run log.

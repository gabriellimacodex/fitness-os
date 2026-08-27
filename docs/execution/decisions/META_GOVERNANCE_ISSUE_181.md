# Meta-tooling governance — Recorded Decision

- Status: `RECORDED`
- Decision date: 2026-08-27
- Decision maker: Founder (Gabriel Lima), working live with Claude Code
- Source stop: [GitHub issue #181](https://github.com/gabriellimacodex/fitness-os/issues/181)
- Implementation: resolved

## What happened

Commit `1cebd7d` (PR #180, "make /meta-build rebase stale-but-approved PRs")
modified `.claude/commands/meta-build.md` — a path that file's own step 5
tells autonomous agents never to touch without the founder's direct approval
— and was merged directly to `main` with zero independent review, bypassing
the Autonomous Delivery Charter's no-self-approval rule. The founder authored
and merged it directly, live, while setting up the autonomous builder/reviewer
pipeline this repository now runs.

An autonomous `/meta-build` session subsequently discovered this on its own,
correctly declined to treat a plausible-looking change as self-authorizing,
and filed issue #181 rather than improvising a fix or staying silent. Two
independent retroactive Agent 90 reviews then found the change also had a real
technical defect: renumbering a colliding Drizzle migration by renaming the
file and hand-editing the journal tag left the snapshot's `prevId` and
cumulative `tables` map wrong, since those are computed by drizzle-kit, not
hand-written. PR #179's real 0013→0016 rename under this rule had already
produced exactly that broken chain.

## Decision

Two things are recorded here, not one:

1. **The specific historical bypass (`1cebd7d`/PR #180) is accepted as
   founder-authorized and not reverted.** It reflects an actual decision made
   live by the founder, not an autonomous agent acting alone. No corrective
   action is required beyond what already happened: the technical defect it
   introduced was fixed in PR #184, which — this time — went through two
   rounds of independent Agent 90 review (including one that empirically
   reproduced the fix against the real colliding branches, not just read the
   instructions) before the founder merged it.
2. **This does not create standing authority for autonomous agents, or for
   future live sessions, to edit `.claude/commands/meta-build.md`,
   `.claude/commands/meta-review.md`, `docs/execution/**`, or `docs/adr/**`
   without going through independent review first.** `meta-build.md` step 5's
   forbidden-path rule and `meta-review.md`'s matching rule are unchanged and
   remain binding. The gap this incident actually exposed was not "the founder
   touched a forbidden path" — that is always the founder's prerogative — it
   was that the change merged without the independent review Gate A already
   requires for everything else. The fix going forward is procedural, not a
   loosening of the path restriction: changes to these files, however
   authorized, get an independent review pass before merge, the same as any
   other PR.

## Evidence

- Issue #181 and its full comment thread (two retroactive reviews, one with
  an empirical drizzle-kit regeneration reproduction against PRs #170/#179).
- PR #184 (`chore(meta): fix step 3a's unsafe migration renumber and
  stale-review filter`) — CI green, two independent review rounds, both
  MEDIUM findings from the second round addressed before merge.
- PR #179's `0016` snapshot was the concrete evidence of the technical defect;
  the migration-slot collisions it and sibling PRs hit afterward (`#170` at
  `0013`, `#179` at `0014`) resolved through ordinary sequential merges once
  PR #184's corrected step 3a was live, with no further hand-edited snapshots.

## Explicitly not decided here

- No change to the ownership matrix, the STOP condition list, or any PRD's
  scope.
- No general policy on live founder sessions vs. autonomous sessions beyond
  the one procedural fix above.

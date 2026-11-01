---
name: run-plan
description: Manual-only — runs when the user types `/run-plan`. Executes an approved Implementation Plan through the rest of the Spec Driven Development pipeline — implementer phases, one verify run, review rounds (plan-verifier ∥ architecture-reviewer ∥ code-review) with fix iterations until no blocking finding is open, a live check and docs — then hands over to `/pr-self-review`. spec-creator and implementation-planner run separately, before it.
disable-model-invocation: true
argument-hint: plan:<.devdigest/plans/NN-slug.md> [spec:<path>] [brief:"…"|<path>] [design:<figma-url|png>]… [verifier:opus] [rounds:<n>]
---

# /run-plan — the SDD pipeline from an approved plan

Arguments: $ARGUMENTS

You are the orchestrator: you run the agents, keep the ledger and ask the user. You write no product code
yourself (single-agent mode excepted). `spec-creator` and `implementation-planner` are NOT part of this
command — the user runs them before it. Templates for every prompt, the ledger, plan amendments, the state
file and the final report: [references/templates.md](references/templates.md) — Read the part you need
when you reach it.

## Arguments

| argument | meaning |
|---|---|
| `plan:` | required — `.devdigest/plans/<NN-slug>.md`, first line `PLAN: READY` |
| `spec:` | optional — else the spec on the plan's §0 `Source:` line, if any |
| `brief:` | optional — extra requirements, text or a path; checked against the plan in Stage 1 |
| `design:` | optional, repeatable — Figma URLs or PNG paths; for UI phases and the live check |
| `verifier:opus` | optional — run `plan-verifier` on opus (default: its `sonnet`); for schema / shared-contract plans |
| `rounds:` | optional — review rounds before asking the user, default 3 |

`<slug>` is the plan's file name without `.md`. Every artifact goes to `.devdigest/plans/` (git-ignored)
under that slug.

## Context budget — the main session is the most expensive context here

It lives through every stage and every round. So:
- Never Read the plan file. Use `node scripts/plan.mjs lint|slice|files`, `grep -n '^### Phase' <plan>`, and
  `sed -n '/^## Summary for the caller/,/^## 0\./p' <plan>` for the summary.
- Every agent gets `out:` and returns only a head; pass paths, never paste a report into a prompt. Read a
  report file only to triage a specific ID (Grep it).
- Run `scripts/verify.mjs` with `run_in_background` — it takes minutes.
- Give the user one progress line per stage, not narration.

## Stage 0 — state

`<slug>.impl.json` exists → AskUserQuestion: resume from its `stage` (default) or restart (the code stays;
only the state resets). Update the state file after every stage and every phase.

## Stage 1 — preflight (stop on any failure and say why)

1. `node scripts/plan.mjs lint <plan>` — an ERROR other than `L-SIZE` on a plan that already has
   amendments → stop: the plan needs another `implementation-planner` pass.
2. `grep -n "Execution mode:" <plan>` — `ASK` or missing → ask the user. `single-agent` → see the end.
3. Spec: `Status: draft` → ask: continue on a draft, or stop until it is approved.
4. Git: on `main` → stop. Uncommitted files at start → ask once whether to continue (they join every
   review's scope — root `INSIGHTS.md`, 2026-10-24).
5. `brief:` → compare each requirement with the plan summary and §0. Constraints on HOW → pass as
   `notes:` to every implementer. A requirement no step covers → ask: add an amendment phase `B1` (you
   write its steps, template "Amendment"), keep it as notes only, or stop and re-plan. Either way the brief
   goes verbatim to `plan-verifier` as `brief:` (its `U-n` rows).
6. `design:` → a PNG path is used as is. A Figma URL: `create_session`, `get_metadata` to list the frames,
   `get_screenshot` per frame (`maxDimension` ≤ 1600), then `curl -sSfL -o .devdigest/plans/<slug>.design/<node>.png "<url>"`.
   Figma unavailable → ask for PNG exports or continue without designs.

## Stage 2 — phases

- Phases: the list in the lint head (`phase(s) [P1, P2, …]`), minus phases done in the state and fix
  phases (`F*`, `V*`). A phase whose heading says "main session" is yours — do it yourself.
- Run phases in plan order. Two run in parallel only when they touch different packages and neither's
  steps `Depend on` the other.
- One `implementer` per phase (template "implementer"); `design:` only for phases whose slice touches
  `client/`; the previous phase's report only when the phase depends on it.
- `DONE` → next. `PARTIAL` / `BLOCKED` → ask the user with the blocker lines (decide, skip the step, stop);
  a decision re-runs the same phase with `notes:` naming the done steps and the decision.

## Stage 3 — verify

`node scripts/verify.mjs --out .devdigest/plans/<slug>.verify.json` (background). Edit nothing — docs and
`INSIGHTS.md` included — while it runs: any change makes its record stale and forces a re-run. `OK` → Stage 4.
`FAIL` → a fix phase `V<n>` (template "Amendment", one step per failing lane, its tail quoted from the
JSON) → implementer → verify again. Still failing after `V2` → ask the user.

## Stage 4 — review round k

**Round 1 — full.** `git fetch -q`, `node scripts/diff-index.mjs > .devdigest/plans/<slug>.diff-index.md`,
`node scripts/tree-snapshot.mjs save .devdigest/plans/<slug>.r1.snap.json`. Then, in ONE message,
`plan-verifier` and `architecture-reviewer` (templates, round 1), and while they run, invoke the
`code-review` skill yourself at effort `medium` on the current diff.

**Round k > 1 — only what the fix round changed.**
`node scripts/tree-snapshot.mjs changed .devdigest/plans/<slug>.r<k-1>.snap.json --paths` is the scope;
save `r<k>.snap.json`; then `plan-verifier` with `rows:` (ledger rows still open + every row of the steps
`F<k-1>.*`) and `previous:`, `architecture-reviewer` with `scope:` and `previous:` (templates, delta), and
`code-review` (`medium`) on the scope files only — skip it when the scope holds no production code.

## Stage 5 — triage into the ledger `<slug>.review.md`

One row per finding (template "Ledger"). Decide by this table — the user approved it; do not re-ask:

| source | finding | decision |
|---|---|---|
| plan-verifier | NOT MET · PARTIALLY MET | fix |
| plan-verifier | EXTRA | a test or doc a step implies → accept it under `## Accepted extras` in the plan, with the reason; anything else → ask: revert or accept |
| plan-verifier | DEVIATED | ask the user |
| plan-verifier | NOT VERIFIABLE · "Rows without test evidence" | no fix — the final report (`test-writer` is off) |
| architecture-reviewer · code-review | CRITICAL · WARNING | fix |
| architecture-reviewer · code-review | SUGGESTION | ask — ONE multi-select question per round with all of them |
| any | the fix would change scope, a public contract, the DB schema or a package the plan does not touch | ask |

Before a fix, verify the finding: Read the cited lines. Code not there, rule not applicable (e.g.
`onion-architecture` §6 "Do not fix these"), or already handled → `rejected: <reason, path:line>`. Never drop
a finding silently. Round k > 1: `resolved` → `verified`; `open` → stays `open`, attempts +1;
`regressed` → `reopened`.

## Stage 6 — exit or fix round

**Exit** to Stage 7 when no ledger row decided `fix` is `open` or `reopened`.

**Ask the user** (another round · accept the rest as known issues · stop) when any holds:
- k = `rounds` and rows are still open;
- a row was reopened twice — the fix and the reviewer disagree; show both sides;
- the number of open fix rows did not drop since the previous round.

**Fix round k:** append the amendment `## Amendment — review round k` with `### Phase F<k>` and one step
`### F<k>.<n> <ledger id>: …` per row (template "Amendment"); split into `F<k>a` / `F<k>b` above ~12
files or across packages. `node scripts/plan.mjs lint <plan> --max-kb 96` (amendments grow the plan) and
fix any other error. Then `implementer` (`phase: F<k>`), Stage 3, and review round k+1.

## Stage 7 — live check

Only when a spec AC's Verify is a UI or API action, or §7 has `live check:` rows.
- `curl -sf http://localhost:3001/health` and `http://localhost:3000` — down → ask: start
  `./scripts/dev.sh` in the background, or skip the live check.
- Drive the app with the `run` skill; walk each such AC and §7 row; with designs, compare each screen with
  its PNG (layout, states, texts).
- A failure → a ledger row (source `live`) → one fix round (it counts toward `rounds`) → re-check only the
  failed ACs.

## Stage 8 — docs and hand-over

1. `doc-writer` (template) with the plan, the spec and the last verifier report.
2. Write `<slug>.impl-report.md` (template "Final report") and show the user its head (≤ 25 lines):
   phases, rounds, ledger counts, known gaps, what to run by hand (e.g. the integration lane without Docker).
3. Invoke `engineering-insights` with the agents' "Worth recording" candidates.
4. Invoke `workflow-retro` with `since:` = the time Stage 1 started, and put its report path and
   top three findings in the hand-over.
5. Ask the user to run `/pr-self-review` — you cannot invoke it. Never commit, push or open a PR.

## Single-agent mode (plan §0)

Implement every phase yourself: invoke the skills of the plan's Skill map, run each `done when`, write
files with Edit / Write only. Above 3 phases, `/compact` at every phase boundary. Write the docs and the
`INSIGHTS.md` entries before Stage 3 — an edit after `verify.mjs` makes its record stale. Then Stage 3,
Stage 7 and `workflow-retro` (as in Stage 8 step 4). No subagents, so no review rounds and no
`doc-writer` — that is what the mode trades away; `/pr-self-review` stays mandatory.

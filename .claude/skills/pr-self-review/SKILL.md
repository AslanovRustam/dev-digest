---
name: pr-self-review
description: Manual-only pre-PR review gate — runs when the user types `/pr-self-review` (auto-invocation is off). Reviews the local change set (committed-but-unmerged work and the uncommitted working tree) before `gh pr create` / `gh pr merge`, routes each file to the skills that own it, and writes the report the PreToolUse gate checks. If the gate denies one of those commands, or the user asks "is this ready to merge", ask the user to run `/pr-self-review` — the agent cannot invoke it itself.
disable-model-invocation: true
---

# PR self-review

Reviews the whole local change set before it becomes a PR, routes each changed file to the
project skills that own it, and blocks the merge on any CRITICAL finding.

**Manual invocation only.** `disable-model-invocation: true` keeps this skill out of the agent's
reach: it runs only when the user types `/pr-self-review`. A full run fans out to several subagents
and costs real tokens, so the user decides when to spend them. When the gate denies `gh pr create`
/ `gh pr merge`, or a PR is about to be opened without a fresh report, **ask the user to run
`/pr-self-review`** — do not try to invoke it, and do not run the scripts below piecemeal as a
substitute. Once the user has invoked it, follow every step below.

Run every step with the working directory at the repo root. All artefacts land in
`.devdigest/pr-self-review/`.

**This is a self-review, not branch protection.** Anyone can push by hand or open a PR in the
browser. Say so if asked — do not present it as an enforced guarantee.

## 1. Collect (Phases 0–1)

```bash
node .claude/skills/pr-self-review/scripts/collect.mjs
```

Runs the git preflight and writes `plan.json` + `diff.patch`. Exits non-zero and stops the run if
you are on the base branch or there is no merge base — report the reason and stop.

Flags: `--base <branch>` (default `main`), `--offline` (skip `git fetch`).

## 2. Invariants (Phase 2)

```bash
node .claude/skills/pr-self-review/scripts/invariants.mjs
```

Deterministic repo rules — see `references/invariants.md`. No judgement involved.

## 3. Verification lane + fail-fast gate (Phase 3)

```bash
node .claude/skills/pr-self-review/scripts/checks.mjs
```

Runs what CI would run for the packages in the diff. **Exit code 1 means stop**: a deterministic
CRITICAL already exists, so skip steps 4–5 entirely and go to step 6 with
`--stopped-at deterministic`. Reviewing code that does not compile is money thrown away.

Flags: `--skip` (no commands — the report can then never be a PASS), `--force-review` (continue to
the fan-out anyway).

## 4. Fan out to the owning skills (Phase 4)

```bash
node .claude/skills/pr-self-review/scripts/cache.mjs plan
```

Prints `routes_to_run` — the skills with files that are **not** cache hits. A skill with no fresh
files gets no subagent. If `routes_to_run` is empty, skip to step 6.

Dispatch **one `Explore` subagent per route**, in batches of 4, all calls in a single message per
batch. `Explore` is read-only, so a reviewer cannot start editing the code it reviews.

Write every returned finding into `.devdigest/pr-self-review/agent-findings.json` as one flat JSON
array, then persist the cache:

```bash
node .claude/skills/pr-self-review/scripts/cache.mjs store
```

### Subagent prompt — fill in the four slots, keep the rest verbatim

> You are reviewing a pull-request diff for the `<SKILL>` skill.
>
> Read `<SKILL_PATH>` first, plus its `references/` or `examples.md` if present. Those rules are
> your entire mandate — do not review anything they do not cover.
>
> Review exactly these files, nothing else:
> `<FILE LIST>`
>
> The unified diff is at `.devdigest/pr-self-review/diff.patch`. Read the surrounding source when
> you need context, but only report on the files listed above.
>
> Read `.claude/skills/pr-self-review/references/finding-format.md` and return **only** a JSON
> array in that shape. Set `source_skill` to `<SKILL>`. `failure_scenario` is mandatory on every
> CRITICAL.
>
> Rules that override your instincts:
> - Only flag what this diff introduced or made worse. Pre-existing code is out of scope unless
>   the change directly amplifies it.
> - `start_line`/`end_line` must intersect a real hunk in the patch. A finding whose lines do not
>   exist in the diff is discarded.
> - Honour your skill's own false-positive list before reporting: `onion-architecture` §6 "Do not
>   fix these", `frontend-ui-architecture` "What is not a rule", `security` "Do NOT flag".
> - Placement, naming, folder structure, barrels and import direction belong to
>   `frontend-ui-architecture`; hooks, state and rendering belong to `react-best-practices`. Never
>   report the disagreement between the two as a finding.
> - Precision over volume. Zero findings is a valid and good answer. Do not pad.
>
> `<EXTRA>`

Fill `<EXTRA>` per skill:

| Skill | `<EXTRA>` |
|---|---|
| `security` | This repo is Fastify + Postgres + Drizzle. Your skill's examples are Express + MongoDB + JWT — apply the principles, never the examples. |
| `onion-architecture` | Set `rule_id` to the R1–R13 id from `references/rules.md`. A PR that adds a line to `.dependency-cruiser-known-violations.json` is already reported — do not duplicate it. |
| anything else | (omit) |

## 5. Verify the CRITICAL candidates (Phase 5)

```bash
node .claude/skills/pr-self-review/scripts/report.mjs
```

Read `pending_verification` in the output. For **each** id, dispatch one `Explore` subagent whose
job is to *disprove* the finding:

> Finding: `<TITLE>` at `<FILE>:<LINES>`.
> Claimed mechanism: `<RATIONALE>`
>
> Read the actual code and decide whether this is real. Give a concrete input and the concrete
> wrong result or failure it produces. If you cannot, it is not a CRITICAL.
>
> Return only: `{"id": "<ID>", "real": true|false, "reason": "...", "failure_scenario": "..."}`

Collect the objects into `.devdigest/pr-self-review/verification.json` and re-run `report.mjs`.
Anything not proven is demoted to WARNING with the reason recorded.

Blocking a merge on a hallucination is the one failure this skill cannot recover from — do not
skip this step because the findings "look obviously right".

## 6. Report and gate

```bash
node .claude/skills/pr-self-review/scripts/report.mjs [--fail-on critical|warning|any|never] \
  [--stopped-at deterministic] [--checks-skipped] [--override "<reason>"]
```

Writes `report.json` and `pr-body-section.md`. End your turn with the one-line summary it prints:

```
PR self-review: BLOCKED — 2 blocking
PR self-review: PASS — 0 🔴 · 4 🟡 · 7 🔵
```

If BLOCKED: list the blocking findings and **do not create or merge the PR**. Offer the two exits
below; never suggest disabling the hook.

## 7. Opening the PR

The body must carry the self-review section or the gate denies the command:

```bash
gh pr create --title "<title>" --body-file .devdigest/pr-self-review/pr-body-section.md
```

To write your own body, append the contents of that file to it — the marker
`<!-- pr-self-review:<hash> -->` is what the gate looks for.

## Escape hatches

Both leave a visible trace. That is the point: an invisible override is how a gate dies.

| Situation | Exit |
|---|---|
| One finding is wrong | `// pr-self-review-ignore: <rule_id> — <reason>` on the line or the line above. **The reason is mandatory** — without it the directive does not parse. |
| Genuinely need to ship now | `report.mjs --override "<reason>"`. The reason is recorded in `report.json` and printed in the PR body under `⛔ Self-review overridden`. |

## Red flags — stop and re-read this file

- About to run `gh pr create` without having run step 1 in this session.
- About to remove the `PreToolUse` hook from `.claude/settings.json` because it denied something.
- About to mark a finding CRITICAL without a `failure_scenario`.
- About to skip step 5 because the findings look obvious.
- About to report a finding whose lines are not in the diff.

## Quick reference

| File | What |
|---|---|
| `references/routing.md` | glob → skill table, precedence clause, cost controls |
| `references/invariants.md` | the deterministic rules and the secret patterns |
| `references/finding-format.md` | JSON contract + severity rubric |
| `scripts/cache.mjs clear` | force a full re-review |
| `config.json` | `fail_on`, `gate_on_push`, `base` |

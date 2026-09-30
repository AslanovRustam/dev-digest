---
description: Review the local change set before opening a PR; blocks on any CRITICAL finding
---

Run the `pr-self-review` skill over the current change set (branch vs base, plus the working
tree), following `.claude/skills/pr-self-review/SKILL.md` step by step.

Arguments: $ARGUMENTS

Pass them through to the scripts:

- `--base <branch>` / `--offline` → step 1 (`collect.mjs`)
- `--no-checks` → step 3 as `checks.mjs --skip`, and step 6 as `report.mjs --checks-skipped`
- `--force-review` → step 3, continue to the fan-out even if deterministic checks already failed
- `--no-cache` → run `cache.mjs clear` before step 4
- `--fail-on <never|critical|warning|any>` / `--override "<reason>"` → step 6 (`report.mjs`)

With no arguments, run the full flow with the defaults from `config.json`.

Finish with the one-line verdict the report prints, and — if BLOCKED — the list of blocking
findings and the two escape hatches. Do not create the PR while the verdict is BLOCKED.

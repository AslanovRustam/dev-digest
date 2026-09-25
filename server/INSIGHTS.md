# Insights — server

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`. repo-intel lessons go to `src/modules/repo-intel/INSIGHTS.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._
- **2026-09-24** · Don't verify run-level UI (timeline, trace drawer, cost/tokens) on seeded data — why:
  `seed.ts` inserts a review for PR #482 but no `agent_runs` / `run_traces`, so those surfaces render empty;
  run a real review via `./scripts/dev.sh` instead. · ref: `src/db/seed.ts`

## Codebase Patterns

_None yet._
- **2026-09-24** · Run cost is already computed; don't re-implement pricing — read `outcome.costUsd` in
  `run-executor.ts` (destructure at ~L213 drops it) and persist it. why: `d45ab0d` removed only the
  `agent_runs.cost_usd` column + contract fields; `reviewer-core` still returns `ReviewOutcome.costUsd`
  (OpenRouter `usage.cost` → `PriceBook` → `adapters/llm/pricing.ts`). · ref: `src/modules/reviews/run-executor.ts:213`
- **2026-09-24** · Runs of one "Run Review" click share no id — `runReview` inserts one `agent_runs` row per
  agent with nothing linking them, so "the latest review" can't be queried; add a column (plan: `batch_id`)
  instead of guessing with a `ran_at` time window. `multi_agent_runs` has no FK from `agent_runs` and belongs
  to a later lesson. · ref: `src/modules/reviews/service.ts:117-129`, `src/db/schema/runs.ts`
- **2026-09-25** · To scope anything to "the latest review" on the PR list, use `latestReviewIdsByPr`
  (`pulls/findings.ts`): the newest run's `batch_id` → the reviews whose `run_id` is in it, falling back to the
  PR's newest review — why: seeded PR #482's review has `run_id = null` and there are no runs, so a strict batch
  join returns nothing and the FINDINGS column would read "—". The cost column has no such fallback (legacy → `null`).
  · ref: `src/modules/pulls/findings.ts`, `src/modules/pulls/routes.ts`
- **2026-09-25** · Supersedes 2026-09-25: the PR list's COST and FINDINGS are PR totals over ALL runs and
  reviews (`totalReviewCost`, `openFindingsByPr`); `latestReviewIdsByPr` and `PrMeta.latest_review_ids` are
  gone. Don't reintroduce a "latest batch" scope for list columns — why: the user reads the list as "what this
  PR has cost / what is still open", and a clean LLM re-run (same agent, same diff, `findings: []`, grounding
  `0/0`) made earlier findings look deleted. Only SCORE stays latest-review. · ref: `src/modules/pulls/cost.ts`

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

- **2026-09-23** · **Symptom:** `dev.sh` logs "applying migrations" and `pnpm db:migrate` / `db:seed` exit 0,
  yet the DB has no tables → API fails with `relation "users" does not exist` (Windows).
  **Cause:** the CLI guard `import.meta.url === \`file://${process.argv[1]}\`` never matches on Windows
  (`D:\...` + raw spaces vs `file:///D:/...%20...`), so the body is skipped silently.
  **Fix:** compare with `pathToFileURL(process.argv[1]).href`; use the same guard for any new CLI entrypoint.
  · ref: `src/db/migrate.ts`, `src/db/seed.ts`
- **2026-09-24** · **Symptom:** on Windows the unit lane shows 6 failures in `test/indexer-pipeline.test.ts`
  (`ENOENT … repo-intel-full-*\src\util.ts`), unrelated to your change. **Cause:** the test's file-writer
  finds the parent dir with `full.lastIndexOf('/')`, but `full` is a backslash path on Windows, so `mkdir` is
  skipped. Passes on Linux CI. **Fix:** treat as pre-existing when judging your diff (or split with
  `path.dirname`). · ref: `test/indexer-pipeline.test.ts:142`

## Session Notes

_None yet._

## Open Questions

_None yet._

# Insights — server

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`. repo-intel lessons go to `src/modules/repo-intel/INSIGHTS.md`.

## What Works

_None yet._

## What Doesn't Work

- **2026-09-29** · Never write `import * as t from '../../db/schema.js'` just to spell
  `typeof t.repos.$inferSelect` — import the alias from `src/db/rows.ts` instead. why: static analysis
  cannot tell that namespace import is type-only, so it counts as a VALUE import of the data layer and
  trips `sql-only-in-repository` / `domain-files-are-pure`. The same shape between `helpers.ts` and
  `repository.ts` also fabricates a dependency CYCLE (helpers →(type) repository →(value) helpers) that
  `no-circular` reports. Fixing 5 files this way took `pnpm arch` from 35 violations to 23.
  · ref: `src/db/rows.ts`, `src/modules/repos/helpers.ts`

_None yet._
- **2026-09-24** · Don't verify run-level UI (timeline, trace drawer, cost/tokens) on seeded data — why:
  `seed.ts` inserts a review for PR #482 but no `agent_runs` / `run_traces`, so those surfaces render empty;
  run a real review via `./scripts/dev.sh` instead. · ref: `src/db/seed.ts`
- **2026-09-30** · To amend a not-yet-applied migration, don't delete its `.sql` and re-run
  `pnpm db:generate` — change the schema and generate a FOLLOW-UP migration instead. why: drizzle-kit
  keeps the entry in `meta/_journal.json` and `meta/NNNN_snapshot.json`, so after the delete the journal
  points at a missing file and the next generate diffs against the stale snapshot; `drizzle-kit drop` is
  interactive and hand-editing `meta/` is forbidden. Recovery used: restore the `.sql` byte-for-byte,
  then generate. · ref: `src/db/migrations/0011_puzzling_amazoness.sql`, `0012_hesitant_the_captain.sql`
- **2026-09-30** · Don't trust a zip's central-directory sizes as the zip-bomb guard — they are
  self-declared. `NodeZipReader.readZip` also sums the bytes inflation actually produced (plus
  `inflateRawSync({ maxOutputLength })` per entry); without it, headers that under-report passed the 2 MB
  total and decoded ~50 MB. · ref: `src/adapters/archive/index.ts`, `test/archive-adapter.test.ts`

## Codebase Patterns

- **2026-09-29** · A repo function that must compose into a `db.transaction()` takes `DbOrTx`,
  not `Db` (`src/db/client.ts` exports `Tx` and `DbOrTx`). Drizzle’s transaction handle is a
  `PgTransaction`, not assignable to `PostgresJsDatabase`, so a `Db`-typed parameter cannot accept `tx`.
  Pattern: keep the single-statement functions, add a wrapper that opens the transaction and passes
  `tx` to both. · ref: `src/modules/reviews/repository/review.repo.ts` (`insertReviewWithFindings`)
## Codebase Patterns

_None yet._
- **2026-09-29** · Backend layering is now MACHINE-checked, not prose: `pnpm arch` (dependency-cruiser,
  `.dependency-cruiser.cjs`, 13 ring rules) plus `test/architecture.test.ts`, which runs the same config in
  the unit lane. `.dependency-cruiser-known-violations.json` is a debt LEDGER for `polling`/`settings`/
  `workspace` (+2 `adapters → repo-intel/constants` inversions) — entries may only be removed, and a PR that
  grows it is wrong. Those modules' inline-SQL routes are debt, NOT a pattern to copy; `pulls` was migrated
  out of that set as the worked example. why: the same rules had been prose in `AGENTS.md` and were violated
  ~30 times. · ref: `.dependency-cruiser.cjs`, `.claude/skills/onion-architecture/`
- **2026-09-29** · Ring-boundary rules live in ONE place. `eslint.config.mjs` used to carry three
  `import/no-restricted-paths` zones at `warn` (so CI never failed on them); they were folded into the
  dependency-cruiser ruleset, which also expresses what ESLint could not — routes ↛ persistence, SQL only in
  a repository, SDKs only in adapters, and the `type-only` carve-out. Don't re-add zones to ESLint; two
  half-overlapping definitions drift invisibly. · ref: `eslint.config.mjs`, `.dependency-cruiser.cjs`
- **2026-09-29** · A service is ring 2 and cannot import Fastify, so it cannot use `app.log`. Pass a
  callback (`type WarnFn = (meta, msg) => void`, bound in `routes.ts`) or use `platform/run-logger.ts`.
  Importing `FastifyBaseLogger` as a type to satisfy the checker keeps the coupling and only hides it.
  This is the main friction when extracting a service from a route handler — `pulls/routes.ts` had 6
  `app.log.warn` calls. · ref: `src/modules/pulls/service.ts`
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

- **2026-09-30** · To find runs whose prompt carried a skill, test the trace document with
  `run_traces.trace @> jsonb_build_object('prompt_assembly', jsonb_build_object('skill_blocks',
  jsonb_build_array(jsonb_build_object('skill_id', <uuid col>::text))))` — why: `skill_blocks[].skill_id` is
  a JSON string, so without `::text` the uuid never matches; a run with no trace yields NULL, which
  `count(*) filter (where …)` treats as false, so a LEFT JOIN is safe. · ref: `src/modules/skills/repository.ts`

## Tool & Library Notes

_None yet._
- **2026-09-29** · dependency-cruiser's PROGRAMMATIC api does not validate unless you pass
  `validate: true` explicitly — the CLI sets it for you. Without it `summary.violations` is silently `[]`
  and an architecture test passes while proving nothing. Call it as
  `cruise(['src'], { ...config.options, ruleSet: config, validate: true })`. It is also ESM-only: `require()`
  throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. · ref: `test/architecture.test.ts`
- **2026-09-29** · For depcruise on this repo, `tsConfig: { fileName: 'tsconfig.json' }` +
  `tsPreCompilationDeps: true` are both mandatory: the first resolves `.js` specifiers back to `.ts` and
  follows the tsconfig `paths` aliases, the second supplies the `type-only` dependency flag. Aliased packages
  (`@devdigest/shared`, `@devdigest/reviewer-core`) resolve with `dependencyTypes: ['undetermined']`, so write
  rules against the resolved `path`, never `dependencyTypes: ['npm']`. Baseline flow:
  `pnpm arch:baseline` writes the ledger, `pnpm arch` honours it via `--ignore-known`.
  · ref: `.dependency-cruiser.cjs`

- **2026-09-30** · Drizzle 0.38 leaves column names UNQUALIFIED inside a `` sql`…` `` fragment when the outer
  select has a single table: a correlated `` sql`(select count(*) … where ${t.agentSkills.enabled})` `` inside
  `db.select().from(t.agents)` renders `"enabled"` and Postgres fails with `column reference "enabled" is
  ambiguous` (500 on every `/agents` route). Use a grouped subquery (`.groupBy().as('x')`) + `.leftJoin(...)`
  instead — with a join Drizzle qualifies columns. · ref: `src/modules/agents/repository.ts`

- **2026-09-30** · VS Code (bundled TypeScript 6) flags `tsconfig.json` with "The common source directory
  of 'tsconfig.json' is '..'. The 'rootDir' setting must be explicitly set" while `pnpm typecheck` (tsc 5.7)
  passes — the `paths` alias to `../reviewer-core/src` pulls sources outside `server/`. `rootDir: ".."` fixes
  it without changing TS 5's computed output layout. · ref: `tsconfig.json`

## Recurring Errors & Fixes

- **2026-09-29** · **Symptom:** 6 tests in `test/indexer-pipeline.test.ts` fail on Windows with
  `ENOENT: no such file or directory` on a path under `%TEMP%`. **Cause:** the local `writeFileAt` helper
  derived the parent directory with `full.lastIndexOf('/')`, but `join()` emits `\` on Windows, so the
  search returned -1 and `mkdir` never ran. **Fix:** `dirname(full)` from `node:path`. The same helper in
  `test/indexer-walk.test.ts` hid the bug — `slice(0, -1)` quietly created a junk directory and the test
  still passed. Never split a path by hand; `dirname`/`basename` are platform-correct.
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

- **2026-09-25** · **Symptom:** "findings disappeared". A re-run of the same agent on the same diff shows
  `approved` / 0 findings while the previous run found some. **Cause:** usually the model, not the code:
  OpenRouter `deepseek-v4-flash` answers differently even at `temperature: 0` (`reviewer-core/src/llm/openrouter.ts:72`).
  **Fix:** check first — `GET /runs/:id/trace` → `raw_output.findings` and `stats.grounding`. `0/0` means the
  model returned none; `k/N` with k < N means grounding dropped N−k. Only the second case is a code question.
  · ref: `src/modules/reviews/routes.ts` (`GET /runs/:id/trace`)

## Session Notes

_None yet._

### 2026-09-29 — onion-architecture skill + ring enforcement
Added `.claude/skills/onion-architecture/`, `server/.dependency-cruiser.cjs` (13 rules) with a committed
baseline, `test/architecture.test.ts`, `reviewer-core/test/purity.test.ts`, and a CI step in
`server-unit.yml`. Migrated `pulls` from a 357-line route-only module to routes(59)/service/repository with
zero test edits; baseline went 20 → 16.
Baseline-testing the skill on subagents: agents already get ports and layering right in modules that HAVE a
service/repository, and get it wrong by copying the neighbouring broken module — one justified inline SQL
with "this module deliberately has no service.ts/repository.ts: its convention is a thin route that talks to
container.db". The failure mode is contagion from existing violations, not ignorance.

## Open Questions

_None yet._

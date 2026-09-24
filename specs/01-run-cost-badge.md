# Run Cost Badge

**Status:** implemented (lesson L01), not yet committed. This spec is the source of truth for scope.

## Context

A review run costs real money, and the studio does not show how much. You cannot answer
"what did reviewing this PR cost?" without opening the OpenRouter dashboard, and you cannot
compare agents or models on cost.

The data already exists. `reviewer-core` computes cost on every run:
`OpenRouterProvider.completeStructured` (`reviewer-core/src/llm/openrouter.ts`) requests
`usage: { include: true }`, prefers OpenRouter's own `usage.cost`, and falls back to the injected
`estimateCost` (`server/src/platform/price-book.ts` → `server/src/adapters/llm/pricing.ts`).
The value reaches `ReviewOutcome.costUsd` and is then **discarded one line before persistence**
in `server/src/modules/reviews/run-executor.ts`.

Commit `d45ab0d` removed the persistence of run cost (column `agent_runs.cost_usd`, contract
fields) while deliberately keeping the pricing engine. `58c6ac7` stripped the usage line from the
run timeline. This feature restores both and adds the PR-list column and the verdict-banner line.

## Scope

Cost and token usage for every **completed** run, on four surfaces:

| Surface | Shows | Component |
|---|---|---|
| PR list: `COST` column, between STATUS and UPDATED | `$0.014`, the sum of the latest review | `PRRow` |
| Run timeline ("Agent runs" tab): under the run time | `$0.0013 · 8.2K→1.3K` | `RunHistory` |
| Run trace drawer: `COST` stat beside Duration / Tokens / Findings | `$0.06` | `TraceBody` |
| Verdict banner on PR detail: under the summary | `$0.014 · 8.2K→1.3K` | `VerdictBanner` |

**Business decisions**

- **PR-list cost = sum of the latest review.** One "Run Review" click starts several agents in
  parallel. The column sums `cost_usd` over every run of that one click (a *batch*). This matches
  the neighbouring `SCORE` column, which also reflects the latest review.
- **Cost source = `outcome.costUsd`, as is.** Priority: OpenRouter's real `usage.cost` → PriceBook
  (live OpenRouter model price) → static pricing table → `null`. This feature does not change
  the calculation.
- **Failed and cancelled runs persist `cost_usd = NULL` and show no price.** `reviewer-core` throws
  on failure, so no `ReviewOutcome` exists to read from.

**Not in scope:** cost aggregation per repo, per agent, or over time; budgets or alerts;
historical backfill of runs that predate the column (they stay `NULL` and render `—`); any change to
how cost is calculated; partial usage of failed runs (LLM calls paid for before the failure).
Capturing that partial usage needs a `reviewer-core` change and is a separate task.

## Approach

### Constraint: zero additional model calls

Cost is read from values already produced during the run. Nothing in this feature calls a model,
a pricing API, or the OpenRouter dashboard.

### Server

- **Schema** (`db/schema/runs.ts`, `agentRuns`): add two nullable columns, then run `pnpm db:generate`
  to produce migration `0010`. Never hand-write the migration.
  - `cost_usd double precision`: USD per run.
  - `batch_id uuid`: no FK. `ReviewService.runReview` generates one id per click and passes it to
    every `createAgentRun`. Today the runs of one review share nothing. Without this column,
    "the latest review" could only be guessed with a fragile time window. `multi_agent_runs`
    belongs to a later lesson and is left untouched.
- **Persistence:** `run-executor.ts` stops discarding `outcome.costUsd`. It flows through
  `completeAgentRun` → `run.repo.ts` → `agent_runs.cost_usd`, and into `trace.stats.cost_usd`.
  The failure, cancel and pre-work `failAll` paths persist `null`.
- **Contracts:** hand-port the same change to **both** `vendor/shared` copies (server and client).
  There is no sync script, and divergence type-checks clean.
  - `RunStats.cost_usd` and `RunSummary.cost_usd`: `z.number().nullish()`. Use `nullish` because
    older `run_traces` jsonb documents lack the field.
  - `PrMeta.cost_usd`: `z.number().nullish()`, list endpoint only, like `score`.
- **`GET /pulls/:id/runs` and `GET /runs/:id/trace`** carry cost once the above is in place.
- **`GET /repos/:id/pulls`** gains one `inArray` query over `agent_runs` for the page's PRs
  (workspace-scoped, newest first). It mirrors the existing latest-review `score` block and is
  folded by a pure helper, `modules/pulls/cost.ts` → `latestReviewCost(runs)`:
  1. A PR's latest batch is the `batch_id` of its newest run. A legacy run with `batch_id = NULL`
     is its own batch.
  2. If any run in that batch is `running`, the result is `null`, so no half-finished sum is shown.
  3. Otherwise the result is the sum of `cost_usd` over the batch's `done` runs with a non-null
     cost. If there are none, the result is `null`.

### Client

- **`client/src/lib/format.ts`** holds the shared formatters, so the same run reads identically
  on every surface.
  - `formatCost(usd)`:
    - `null`/`undefined` → `—`
    - `0` → `$0.00`
    - below $1 → `toPrecision(3)`, trailing zeros trimmed, at least two decimals
    - `≥ $1` → `toFixed(2)`
  - `formatTokens(in, out)`: `8.2K→1.3K`; values below 1000 have no suffix. It replaces the
    folder-local helper in `RunTraceDrawer/helpers.ts`, which renders small counts as `0k`.
- **`client/src/components/run-cost-badge/`** (`RunCostBadge`, kebab-case folder like its siblings) is the one new component. It has two variants:
  - `compact` → `$0.012`: PR list.
  - `full` → `$0.014 · 8.2K→1.3K`: run timeline, verdict banner. With no tokens it shows cost only.
- **Surfaces:**
  - PR list: add a `cost` key to `COLUMN_KEYS` and a width to `GRID` in `pulls/constants.ts`.
    The two lists must stay the same length. `PRRow` renders the cell.
  - Timeline: `RunHistory` renders the badge under `ran_at` for settled `done` runs only.
    Error and running cards show no price.
  - Drawer: `TraceBody` adds a fourth `Stat`, `trace.stat.cost`, between Tokens and Findings.
  - Verdict banner: `VerdictBanner` takes optional `costUsd / tokensIn / tokensOut`. The values come
    from matching `review.run_id` against the `prRuns` the PR detail page **already fetches**,
    passed down through `FindingsTab` → `ReviewRunAccordion`. There is no extra request.
- **i18n:** add `prReview.json` → `list.columns.cost` and `runs.json` → `trace.stat.cost`.

### Two rules that carry the design

**`null` is not `$0`.** An unknown cost renders `—`. A cost is unknown when there is no completed
run, the model is missing from the price book, or map-reduce collapsed to `null` because one chunk
was unpriced. A genuinely free run (`z-ai/glm-4.7-flash`) renders `$0.00`.

**Fixed decimals destroy these numbers.** Real runs cost roughly **$0.0004–$0.02**. The
`toFixed(2)` helper deleted in `d45ab0d` rendered nearly every run as `$0.00`. Hence
significant-digit formatting.

## Verification

**Automated**

- **server:**
  - `test/contracts.test.ts`: the fixture carries `cost_usd`.
  - New `test/pulls-cost.test.ts` covers `latestReviewCost`: batch sum; running → `null`; failed
    runs excluded; legacy `NULL` batch; all-null → `null`.
  - `test/reviews.it.test.ts` (`run cost (L01)`): after a review, `agent_runs.cost_usd` is set (from
    the `MockLLMProvider`) along with a `batch_id`. The same cost appears in `GET /pulls/:id/runs`,
    in `stats.cost_usd` of `GET /runs/:id/trace`, and in `GET /repos/:id/pulls`. A second review
    gets a new `batch_id` and replaces the first in the list (latest, not lifetime). Multi-agent
    batch sums are covered by the pure `pulls-cost` unit test, so the integration test never runs
    the seeded agents (which could reach a real LLM).
- **reviewer-core:** `test/openrouter-cost.test.ts`: `usage.cost` from the response wins over `estimateCost`; with neither, the cost is `null`.
- **client:**
  - `lib/format.test.ts` pins every formatter case below.
  - `RunCostBadge`, `PRRow`, `RunHistory`, `RunTraceDrawer` and `VerdictBanner` tests each assert
    their own surface.
- `pnpm typecheck` in server and client, and `npm run typecheck` in reviewer-core. The engine
  type-checks against the server `shared` copy.

**Manual**

1. `cd server && pnpm db:migrate`. Migrations do not run on boot.
2. Run `./scripts/dev.sh` (Git Bash), then run a review with 2–3 agents on any PR.
3. Check the PR list:
   - that PR shows the batch sum;
   - a never-reviewed PR shows `—`;
   - a PR whose review is still running shows `—`.
4. Check the PR detail page:
   - each `done` timeline card shows `$X · N.NK→N.NK`;
   - an errored card shows no price;
   - the verdict banner shows the same line for its run;
   - the trace drawer shows a `COST` stat.
5. Cross-check one run's figure against the OpenRouter dashboard. They should match, because
   `usage.cost` is used.

**Formatter cases:** `0.012 → $0.012`, `0.0013 → $0.0013`, `0.06 → $0.06`,
`0.00039347 → $0.000393`, `1.234 → $1.23`, `0 → $0.00`, `null → —`; `8200/1300 → 8.2K→1.3K`,
`15000/1200 → 15K→1.2K`, `640/90 → 640→90`.

**Design parity:**
- PR list: `$0.014` `$0.041` `$0.003` `$0.028` `$0.012` `$0.022` `—`
- Timeline: `$0.0013` `$0.0014` `$0.0012`
- Drawer: `$0.06`

One deliberate deviation from the mockups: the timeline renders `$0.0013 · 8.2K→1.3K` instead of
`9 119 tok · $0.0013`. This way one run reads the same in the timeline and in the verdict banner,
and the badge keeps the two variants the lesson asks for.

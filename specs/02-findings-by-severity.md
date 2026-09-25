# Findings by Severity

**Status:** implemented (lesson L01, part 2). This spec is the source of truth for scope.

## Context

L01 on the README roadmap is "Run cost badge · severity filter on findings". The cost part is
`specs/01-run-cost-badge.md`; this spec covers the severity part.

The PR detail page already renders every finding: "Agent runs" tab → "Review runs" section →
one `ReviewRunAccordion` per run → `VerdictBanner` + `FindingsPanel` → `FindingCard`. What is
missing is a way to see the severity mix at a glance and narrow the list to one level, and any
preview of findings outside that section:

- On the PR page you cannot answer "how many criticals?" without scrolling every accordion.
- The run timeline shows only "N finding(s)" per run.
- The PR list shows no findings at all. `GET /repos/:id/pulls` returns only `score` and `cost_usd`.

## Scope

| Surface | Shows | Component |
|---|---|---|
| PR detail, above the Review runs accordions | `3 CRITICAL · 5 WARNING · 2 SUGGESTION` + "Hide low confidence"; a click on a level filters every accordion to it | `SeverityFilterBar` |
| Run timeline ("Agent runs" tab) | per-run severity counts (icon + number); hover → preview card; click → opens that run's accordion | `RunHistory` |
| PR list: `FINDINGS` column, between SCORE and STATUS | severity counts of the latest review batch; hover → preview card | `PRRow` |

**Preview card** (hover or keyboard focus): "N FINDINGS" header, then each finding with severity
icon, title, category, `file:line` link, confidence and a two-line excerpt of the rationale, ordered
by severity, then by confidence.

**Business decisions**

- **Detail-page counters count what the list would show.** They cover all runs' findings after
  the "Hide low confidence" filter, so the number on a level always equals what clicking it
  shows. Dismissed findings stay in the list, marked with their tag, so they are counted.
- **Single-select filter.** A click on a level shows only that level. A click on the active level
  clears the filter. The filter lives in the URL (`?severity=CRITICAL`), like `?tab=`. A level with
  zero findings is shown muted and cannot be selected.
- **"Hide low confidence" is page-wide.** It moves from each accordion's toolbar into the
  counter bar, because the counters depend on it.
- **Timeline and PR-list counts are open findings**: dismissed findings are excluded, the same rule
  as the accordion's blocker count.
- **PR-list scope is the latest review batch**, the same scope as the COST column. It covers
  every review whose `run_id` belongs to the batch of the PR's newest agent run. **Fallback:** if no
  review in that batch has a `run_id` (legacy or seeded rows), the PR's newest review is used.
  `findings: null` means the PR has never been reviewed.
- **The preview's findings load lazily.** The PR list fetches `GET /pulls/:id/reviews` only
  when the card opens, and keeps the reviews listed in `latest_review_ids`.

**Not in scope:** the Learn and Reply finding actions, which need their own server logic; per-agent
or historical severity aggregation; multi-select filtering; severity-based sorting of the PR list.

## Approach

### Constraint: no schema change

Counts are computed on read from `findings.severity`. No per-severity columns are added to `agent_runs`.

### Contract (both `shared` copies)

`PrMeta` gains two fields, both nullish and returned by the list endpoint only:

- `findings: { critical, warning, suggestion }`: open findings of the latest review batch.
- `latest_review_ids: string[]`: which reviews those counts came from, so the preview can match them.

### Server

- `modules/pulls/findings.ts`: the pure `latestReviewIdsByPr(reviews, runs)`, newest-first input,
  applying the batch rule and its fallback. It sits beside `cost.ts`.
- `modules/pulls/routes.ts`: selects review `id` and `run_id` alongside the score. It adds one
  IN-query for `findings {reviewId, severity}` with `dismissed_at IS NULL`, then folds the result
  with the existing `rollupSeverities`.

### Client

- `lib/findings.ts`: severity order, `countBySeverity`, `liveFindings`, `sortForPreview`, `lineLabel`,
  `plainExcerpt`.
- Cross-route components in `components/`:
  - `severity-tally/SeverityTally`: the icon + count row.
  - `hover-card/HoverCard`: a generic rich tooltip, portalled and fixed-positioned, so it escapes
    the table's `overflow: hidden`. It opens and closes with a delay, flips above the trigger near
    the viewport bottom, and closes on Escape and on scroll.
  - `findings-preview/FindingsPreviewList`: the card's content.
- Route components:
  - `[number]/_components/SeverityFilterBar`: the counters and the confidence toggle.
  - `pulls/_components/PRRow/_components/FindingsCell`: the list cell.
- `usePrReviews(prId, enabled)` supports lazy loading. `useFindingAction` also invalidates `["pulls"]`,
  so a dismiss updates the list counts.

## Tests

- **Server unit** (`test/pulls-findings.test.ts`): batch pick, legacy fallback, never-reviewed
  PR, several PRs.
- **Server integration** (`test/reviews.it.test.ts`): the list returns `findings` and
  `latest_review_ids`, and a dismiss lowers the count.
- **Client**:
  - `lib/findings`, `HoverCard`, `FindingsPreviewList` + `SeverityTally`, `SeverityFilterBar`;
  - updated `FindingsPanel`, `RunHistory` and `PRRow` tests.
- **e2e** (`08-findings-severity`): on seeded PR #482, clicking "1 CRITICAL" and then "1 WARNING"
  updates `?severity=` and shows that level's finding.

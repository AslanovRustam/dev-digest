# Smart Diff

**Status:** approved (lesson L04). This spec is the source of truth for scope.

## Context

The **Files changed** tab lists files in the order GitHub returned them, so a lock file sits next to
business logic. The agent's findings live on a separate tab (**Agent runs**), so matching a finding to
its code means jumping between tabs. **Smart Diff** does two things:

1. **Orders the PR's files by role** — `core` (business logic) first, then `tests`, `wiring`
   (configuration, barrel files), `docs`, and `boilerplate` (lock files, generated code, snapshots) last.
2. **Shows the review result inside the diff** — the group header shows how many of its files have
   findings, the file card shows a findings indicator, and the finding itself is rendered as a comment
   under the code line it points to, looking like the finding card on the Agent runs tab.

The Agent runs tab stays as it is (it shows whole runs).

## User stories

- Open a PR, go to **Files changed**, and see the files grouped by role
  `core → tests → wiring → docs → boilerplate`, each group with its role label and file count.
- `docs` and `boilerplate` are collapsed on open; the lock file is in `boilerplate`.
- Run **Run review**; when it finishes, the group header shows the count of files with findings, and each
  such file card shows a dot indicator.
- Expand such a file and see the finding comment under the right line, visually like the finding card on
  the Agent runs page (reuse the same component).
- Switch to **Original order** to get GitHub's usual order back.

## What already exists (reuse, do not rewrite)

The fork has changed since L01 — search first; some of this may look different or already exist.

- **Server data.** `GET /pulls/:id` returns `files[]` (`PrFile`: `path`, `additions`, `deletions`,
  `patch` — unified diff, may be null). `GET /pulls/:id/reviews` returns reviews with `findings[]`
  (`file`, `start_line`, `end_line`, `severity` CRITICAL|WARNING|SUGGESTION, `title`, `rationale`,
  `suggestion`, `confidence`, `accepted_at`, `dismissed_at`). There is no `line` field — anchor to
  `start_line`.
- **Client hooks.** `client/src/lib/hooks/reviews.ts`: `usePrReviews(prId)` (findings) and
  `useFindingAction()` (accept / dismiss). FindingsTab already uses them; the query is cached, so reading
  it again from Files changed costs nothing.
- **Contract.** Zod `SmartDiff` in `server/src/vendor/shared/contracts/brief.ts` (identical copy in
  `client/src/vendor/shared/contracts/brief.ts`): `groups[{ role, files[{ path, additions, deletions,
  finding_lines[], pseudocode_summary? }] }]` + `split_suggestion { too_big, total_lines,
  proposed_splits[] }`. `SmartDiffResponse` is already declared in `review-api.ts`. The route that serves
  it does not exist yet. `SmartDiffRole` is `z.enum(['core','wiring','boilerplate'])` — only three values.
- **Components.** `DiffTab` renders `DiffViewer` (`client/src/components/diff-viewer/`). `FileCard`
  collapses, auto-expands files up to 200 lines (`AUTO_EXPAND_MAX_LINES` in `constants.ts`) and already
  shows a comment counter in its header — the findings dot goes next to it, following the same pattern.
  `parsePatch` in `helpers.ts` yields lines with `oldNo`/`newNo` (no new diff parser). In `comments.ts`,
  `keysForLine(ln)` gives the line key (`RIGHT:<new line>` or `LEFT:<old line>`) and `partitionThreads`
  splits threads that found their line from those that did not; `CodeLine` renders them under the line.
  A finding anchors the same way: key `RIGHT:${finding.start_line}`.
- **Finding card.** `FindingCard` in `_components/FindingCard/` (Agent runs tab) — reuse it or make a
  simpler copy: severity, title, rationale, Accept / Dismiss.
- **Severity colours / icons** live in one place: `SEV` and `SeverityBadge` in
  `client/src/vendor/ui/primitives/Badge.tsx`. Use their colour and word for the line label — no new palette.
- **UI strings.** `client/messages/en/prReview.json`, key `smartDiff`: `coreLabel`, `wiringLabel`,
  `boilerplateLabel`, `groupedByRole`, `filesCount`, `findingLines`.

## Requirements

### R1 — Classifier
- Pure function `classifyFile(path): SmartDiffRole` in the server (e.g.
  `server/src/modules/reviews/smart-diff/` or a separate `smart-diff/` module). Patterns and role order
  live in **one** `constants.ts`.
- Independent of the route: on L08 the same classifier becomes a filter before prompt assembly, so it must
  import and run without an HTTP request.
- Table-driven unit test `path → role` written first; the order of rules is an explicit, tested decision.
- First matching rule wins. Check order and starter patterns:
  1. **boilerplate** — `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/**`, `build/**`,
     `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`
  2. **tests** — `**/*.test.ts(x)`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/test/**`, `**/tests/**`,
     `**/__tests__/**`, `e2e/**`
  3. **wiring** — `index.ts` / `index.js` (barrels), `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`,
     `docker-compose*.yml`, `.github/**`, `.claude/**`
  4. **docs** — `**/*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE`
  5. **core** — everything else
- The test table must include the three order-sensitive cases:
  - `__tests__/__snapshots__/x.snap` → `boilerplate` (snapshot rule is above the tests rule);
  - `.claude/skills/security/SKILL.md` → `wiring` (markdown here configures agent behaviour, so `.claude/**`
    is above docs);
  - `e2e/README.md` → `tests` under this order (if changed, record the decision in the test).

### R2 — Contract
- Extend `SmartDiffRole` to five values `core | tests | wiring | docs | boilerplate` in **both** copies of
  `brief.ts`; the two files must stay identical.
- Add `testsLabel` and `docsLabel` to `client/messages/en/prReview.json` → `smartDiff`.

### R3 — Route `GET /pulls/:id/smart-diff`
- Takes the PR's files and the findings of the **latest** review, groups files in the fixed role order,
  builds `finding_lines` from `start_line`, returns `SmartDiff` (validated by the contract).
- `split_suggestion` minimal: `too_big: false`, `total_lines = Σ(additions + deletions)`,
  `proposed_splits: []`.
- No LLM call. Grouping works before the first review (empty `finding_lines`).

### R4 — Groups on Files changed
- A header per role with its label and file count, in the order core → tests → wiring → docs → boilerplate.
- `docs` and `boilerplate` collapsed by default; the others follow the existing `AUTO_EXPAND_MAX_LINES` rule.
- A **Smart order / Original order** toggle; Original order restores GitHub's order (the current view).

### R5 — Findings in the diff
- Findings come from `usePrReviews(prId)` in `DiffTab` and are passed into `FileCard` next to `commenting`.
- **Group header:** a dot with a number on the right, before "N files". The number is how many files in the
  group have findings, not how many findings (two files with five findings → `● 2`).
- **File card:** a dot next to the path, no number. The existing comment counter (message icon, counts
  human GitHub comments) is a different thing — keep both, do not merge them.
- **Code line:** under it a finding comment — severity, title, rationale, Accept / Dismiss — looking like the
  finding card on Agent runs. The line itself gets a coloured bar on the left and a label on the right:
  CRITICAL → `blocker`, WARNING → `warning`, SUGGESTION → `suggestion` (colours from `SEV`).
- Line lookup via `keysForLine`, key `RIGHT:${finding.start_line}`.

## Acceptance criteria

### P1 — blocking
1. An open PR's Files changed shows five groups in the order core → tests → wiring → docs → boilerplate,
   each with its role label and file count.
2. The lock file is classified `boilerplate`; `docs` and `boilerplate` are collapsed on open.
3. After Run review, the group header shows the count of files with findings.
4. A file card with findings shows a dot indicator.
5. In an expanded file, the finding comment (severity, title, rationale) is under the right line.
6. The Original order toggle restores GitHub's order.

### P2 — non-blocking
1. Patterns and role order in one constants file; unit test of the classifier on a `path → role` table,
   including the three order-sensitive cases.
2. The route's response passes `SmartDiff` validation; the enum is extended in both copies of `brief.ts`.
3. Viewing Smart Diff makes no new model call; grouping works before the first review.
4. The finding line has a coloured bar and a severity label, as in the prototype.
5. Accept / Dismiss in the comment work and change the finding's state.
6. A finding whose line is not in the patch is shown as a separate block at the end of the file, not lost.
7. Finding comments can be hidden by the same toggle that hides GitHub comments, to keep the diff clean.
8. The PR description lists which subagents were used and what plan-verifier checked.

### P3 — nice to have
1. The group header sticks to the top while scrolling, as in the prototype.
2. A finding comment can be collapsed to one line.
3. Empty state "review not run yet" instead of zero counters.
4. Counters and indicators update after Run review without a page reload.
5. Group names and other labels come from `client/messages/en/prReview.json` (`smartDiff`), not hard-coded.

## Test PR (manual check)

A PR in the user's DevDigest fork, added to DevDigest as a repository, containing at least: one lock file
(`pnpm-lock.yaml` appears whenever a dependency is added), one logic file in `server/src/` or `client/src/`,
one test, and one config or barrel file. After Run review there is at least one finding in a `core` file
(pick a stronger model in the agent settings for a stable result).

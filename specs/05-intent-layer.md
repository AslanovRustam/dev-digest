# Intent Layer

**Status:** approved (lesson L03, part 1). Decisions / Data model / API / UI below describe what was built.
This spec is the source of truth for scope.

## Context

The reviewer sees a diff but not *why* the PR exists, so it comments on things the author never meant
to change and misses where the change falls short of its goal. The **Intent Layer** derives the PR's
motivation from its title, description, linked ticket / issue, and any plan or spec the description
links to, stores it per PR, shows it to the user, and feeds it into the review prompt next to the diff.

```
COLLECT SOURCES (code) → CLASSIFY (one cheap LLM call) → STORE (per PR) → SHOW (intent card)
                                                                       → INJECT (review prompt)
```

## Requirements

### R1 — Intent classifier
- A **separate** call to a cheap, flash-class model via OpenRouter returns
  `Intent { summary, in_scope[], out_of_scope[] }` plus a confidence level and the list of sources used.
- Input: PR title and description, linked issue / ticket, available plan or spec, and the list of
  changed files **with hunk headers only**. Full change bodies (diff hunks) are **never** sent.
- Empty description ⇒ intent is derived from the title, file names and hunk headers, and is marked
  with **lower confidence**.
- A ticket, issue, plan or spec referenced in the description **must** be fetched and added to the
  intent sources.
- An unreachable reference is never silently replaced by a guess: the intent records the missing
  context (which reference, why it failed) and confidence drops accordingly.

### R2 — Persistence
- Intent is stored per PR.
- When the PR is updated, the user can re-run intent classification explicitly (the stored intent
  shows which PR head it was derived from, so a stale intent is visible).

### R3 — Injection into review
- The structured intent is added to the reviewer's prompt.
- Findings outside the intent's scope are filtered out, **except** that a serious problem outside the
  PR's scope survives as a single signal (one finding, not a list). "Serious" = severity `CRITICAL`
  (user decision 2026-10-07). Full-file kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) and
  findings on lines the PR adds are never filtered.

### R4 — UI
- The PR page shows an **intent card** above / before the review results so the user can check that
  the system understood the task: summary, in scope, out of scope, **risk areas**, confidence, sources
  (incl. missing ones), and a "re-derive intent" action.
- Risk areas (user decision 2026-10-07) come from the classifier (inferred from file paths, hunk
  headings and linked docs) plus code-derived entries — new dependencies parsed from `package.json`
  diffs on the server; only the dependency names reach the model, never diff lines.

### R5 — Model setting
- The cheap classification model is selectable in Settings, **separately** from the main review
  model. Default: an OpenRouter flash-class model.

### R6 — Observability
- Log the prompt composition (which sections, their sizes), the chosen model, token estimate and the
  intent sources.
- Never log secrets (API keys, tokens) and never log diff content beyond file names / hunk headers.
- A review run produces **two distinct LLM calls** in the logs: the cheap intent classifier and the
  main review.

## Acceptance checks

1. The intent card correctly describes the PR's goal.
2. The classifier runs on a separate cheap model (visible in logs and Settings).
3. The classifier request contains no full change bodies.
4. A plan or spec linked from the PR description is actually used as an intent source.
5. Read-only agents (planner, researcher, plan-verifier, architecture-reviewer) cannot modify files.
6. The log shows the prompt composition with no secrets and no excess code.

## Decisions

- **D1 — Module.** New server module `intent` (routes / service / repository / helpers / constants / types).
  `reviews` reaches it only through `container.intent` (`IntentFacade` in `intent/types.ts`).
- **D2 — Sources collected by code.** Title, description, same-repo issues (`getIssue`), same-repo plan /
  spec docs (`getFileAtRef` at the **PR head sha**, doc extensions only, path-normalised, <= 1 MB), and
  the file list with hunk headers. At most 5 references are fetched; extras are recorded as `skipped`.
  Jira / Linear keys and URLs are `no_credentials`; Google Docs / Notion / Confluence and cross-repository
  references are `unsupported`. Ticket keys are detected only at the title start or branch, never in body text.
- **D3 — No change bodies.** The classifier receives paths, `(+a/-d)` counts and `@@` headers (with the
  heading text after `@@`). `diff.raw` is read by code in exactly one place: `package.json` sections, to find
  added dependencies; only their **names** reach the model.
- **D4 — Confidence is capped by code.** `min(model, cap)`: empty description -> `low`; any issue / plan /
  ticket not `used` -> `medium`; else `high`. Truncation does not lower it (recorded per source).
- **D5 — Unreachable references** become `sources[]` entries with a reason plus `missing_context[]` lines,
  both created by code; the prompt lists them under "Missing context".
- **D6 — Stored per PR with the head sha** (`pr_intent`); `stale = stored.head_sha != pull.head_sha`.
  Explicit `POST` re-derives. A review run reuses a stored intent **even when stale** (logged `STALE`, badge
  on the card), otherwise derives once before the agent loop.
- **D7 — Failure never fails a review.** `forReview` swallows any error (missing OpenRouter key included),
  logs `reviewing without intent`, and the prompt is byte-identical to the intent-off prompt.
- **D8 — Scope filter (R3, user decision: CRITICAL only).** reviewer-core `applyIntentScope` runs between
  grounding and scoring and only when an intent was rendered: full-file kinds and findings touching an
  **added line** are never filtered; `scope:"out"` candidates are dropped except exactly one `CRITICAL`
  (highest confidence), kept with the prefix "Outside this PR's stated scope". The score is recomputed after.
- **D9 — Prompt.** Intent block is wrapped `<untrusted source="intent">` after the PR description; the
  trusted scope rule sits outside the wrapper; `INJECTION_GUARD` is unchanged.
- **D10 — Model setting.** `review_intent` defaults to OpenRouter `deepseek/deepseek-v4-flash` (server
  contract, client contract and `client/src/lib/feature-models.ts`).
- **D11 — Observability.** `platform/llm-call-log.ts` builds each LLM-call record from an allowlist (section
  names/sizes/tokens, sources, model, cost, latency); every string is secret-redacted and URL queries are
  stripped. A review run logs `call=intent` then `call=review`. The existing `prompt_assembly.user` trace
  (which holds the review prompt) is unchanged.
- **D12 — Not an agent run.** No `agent_runs` / `run_traces` row for the classifier (it would appear as an
  unnamed review); cost lives on `pr_intent`, and intent cost is not added to the PR-list COST column.
- **Risk areas (R4).** `IntentRiskArea { kind, label, origin: 'model'|'code' }`. Code-derived
  `New dependency: <name>` entries (from `package.json` diffs; same-name +/- pair = version bump, ignored)
  come first, then up to 5 model entries (labels <= 80 chars), deduped by lower-cased label.
- **Contract key.** The contract key stays `intent` (= R1 `summary`); the UI label is "Summary".
- **Port changes** (`DiffHunk.addedLineNumbers/heading`, `GitHubClient.getFileAtRef`) are applied to the
  server copy of `shared` only; the client never uses those types.

## Data model

`pr_intent` (migration `0018`, additive): `pr_id` (PK, FK cascade), `intent`, `in_scope`, `out_of_scope`
(existing) plus `head_sha` text NOT NULL, `confidence` text NOT NULL default `low` (CHECK high|medium|low),
`sources` jsonb, `missing_context` jsonb, `risk_areas` jsonb (all NOT NULL default `[]`), `provider`,
`model` text NOT NULL, `tokens_in` / `tokens_out` / `duration_ms` integer NOT NULL default 0,
`cost_usd` double precision NULL (null = unknown), `derived_at` timestamptz NOT NULL. Integer tokens /
double-precision cost mirror `agent_runs`. No `workspace_id`: reads are scoped through `pull_requests`.
The table had no writer before, so NOT NULL columns were safe (0 rows verified).

## API

- `GET /pulls/:id/intent` -> `PrIntentResponse { intent: PrIntentRecord | null, pr_head_sha, stale }`.
  Always 200, never calls a model. Unknown PR -> 404.
- `POST /pulls/:id/intent` -> `PrIntentResponse`. Rate-limited 10/min. Missing OpenRouter key ->
  `config_error`; classifier failure -> `intent_derivation_failed` (502).
- Contracts (both `shared` copies): `Intent` gains `confidence`, `sources`, `missing_context`, `risk_areas`
  (nullish, so `PrBrief` stays valid); `PrIntentRecord`, `PrIntentResponse`; `Finding.scope`
  (`in | out`, not persisted); `PromptAssembly.intent`.

## UI

`IntentCard` sits above the tab content on the Overview and Findings tabs of the PR page: confidence badge,
"derived from <sha7> - <model>", STALE badge, quoted summary, In scope / Out of scope columns, a Risk areas
chip row (hidden when empty; icon by kind), Sources with status chips and a Missing context list, and a
Derive / Re-derive button. Strings live in `messages/en/intent.json`; hook `lib/hooks/intent.ts`. The run
trace drawer shows the intent block of the prompt.

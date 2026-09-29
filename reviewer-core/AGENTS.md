# reviewer-core — `@devdigest/reviewer-core` (review engine)

Pure review logic: diff → prompt → LLM → structured output → grounding → `Review`.
Only consumer in the starter is `server/` (`modules/reviews/run-executor.ts`).

## Before answering
- Read `src/review/run.ts` (`reviewPullRequest`) — every change flows through it.
- Changing a signature exported from `src/index.ts`? Find its callers in `server/src` too
  (including the shims in `server/src/platform/`) and plan both edits.
- Changing `Review` / `Finding` shapes? Those live in `server/src/vendor/shared`, not here.

## Stack
TypeScript source only (never emits JS) · Zod 3 · `openai` SDK (OpenRouter provider) · vitest 2.

## Commands (npm — NOT pnpm)
- Install: `npm ci` · Test: `npm test` · Typecheck (= build): `npm run typecheck`

## Map
- `src/index.ts` — the public API; export anything new from here
- `src/review/run.ts` — entrypoint, strategy selection · `src/review/reduce.ts` — merge partials, score
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate vs the diff
- `src/llm/structured.ts` — Zod → JSON Schema, parse-with-repair · `src/llm/openrouter.ts` — provider
- `src/output/to-review.ts` — GitHub review payload, blocker counting (CI, lesson L06)

## Conventions (non-default)
- No I/O: no DB, filesystem, GitHub, or env reads. The only side effect is the INJECTED `LLMProvider`.
- Everything the caller resolves (skills, memory, specs, repo map) arrives as plain strings.
- Grounding is mandatory: a finding must intersect a diff hunk or it is dropped.
- The score is recomputed from surviving findings — never trust the model's number.
- Prompt-injection defense is the single `INJECTION_GUARD` rule + `wrapUntrusted` fencing.
  Do not add keyword/denylist scanning of untrusted text.
- Optional prompt slots are omitted when empty — "feature off" must yield the identical prompt.
- Cancellation: call `checkCancelled()` before each LLM call; the engine never defines the error type.

## Gotchas
- `@devdigest/shared` resolves to `../server/src/vendor/shared` (tsconfig `paths`).
- `zod` is pinned to this package's `node_modules` → a second zod instance at runtime in the server.
- The server imports this raw source: without `reviewer-core/node_modules` the API crashes at boot.
- The server uses `single-pass`; map-reduce, `skills`/`memory`/`specs` slots and `toReviewPayload`
  are wired for later lessons — keep them working even though nothing calls them yet.
- CI: edits here also trigger the server lanes; `shared` edits trigger this lane.

## Docs
| Doc | Use when |
|-----|----------|
| `README.md` | need the pipeline diagram or the public API list |
| `docs/` | need deeper engine design notes / ADRs |
| `specs/` | implementing an engine feature that has a spec (new slot, strategy, gate) |
| `INSIGHTS.md` | the engine misbehaves unexpectedly; entries are added via the `engineering-insights` skill |
| `../server/README.md` → "Review context" | need to know what the server actually feeds the engine |

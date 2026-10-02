# Insights — reviewer-core

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-09-29** · Any code that filters `Finding[]` must exempt `kind` in `{secret_leak,
  lethal_trifecta, phantom, hook}` from line-level diff grounding: those come from full-file
  scanners and only require the FILE to be present in the diff, not a `[start_line, end_line]`
  intersection with a hunk. A naive "drop findings that miss a hunk" filter deletes every secret
  leak silently. · ref: `reviewer-core/src/grounding.ts:16` (`FULL_FILE_KINDS`)

- **2026-10-02** · Generated files (lockfiles, drizzle `migrations/meta/*.json`, `*.min.js|css`, `*.map`) are dropped
  from the diff at the top of `reviewPullRequest` — before strategy selection, prompting AND grounding — and the run log
  says `Skipped N generated file(s): …`. Extend `GENERATED_PATTERNS` rather than filtering in the server, so the CI
  runner gets the same behaviour. · ref: `src/review/generated.ts`

## Tool & Library Notes

_None yet._

- **2026-10-02** · The openai SDK's `timeout` (client option) does NOT bound a request whose server sends headers
  at once and then keeps the body open — verified: a local server answering `200` and writing a space every 50 ms kept
  a `timeout: 200` call alive past 5 s. OpenRouter does exactly this on long non-streaming generations, so a PR review
  hung for 20+ minutes. Bound calls with `create(body, { signal: AbortSignal.timeout(ms) })`, which also aborts the
  body read; `OpenRouterProvider` now does (`deadlineMs`, default 240 s, one retry; a request's `timeoutMs` overrides).
  The cause was NOT prompt size: replaying the same ~67k-token prompt with `stream: true` finished in 74 s (7.5k
  reasoning tokens) on another upstream — OpenRouter picks a provider per request (Venice, StreamLake, AtlasCloud seen
  for `deepseek-v4-flash`), and one stalled. Hence the retry: it is usually routed elsewhere.
  · ref: `src/llm/openrouter.ts`, `test/openrouter-deadline.test.ts`

- **2026-10-02** · openai SDK v4 streaming quirks (verified against local SSE servers): when the request `signal`
  aborts, `for await (const chunk of stream)` just ENDS — no throw — so check `signal.aborted` after the loop or a
  timeout looks like an empty answer; and a chunk carrying `{ error: { message } }` makes the SDK throw an `APIError`
  with that message itself. OpenRouter's `: OPENROUTER PROCESSING` SSE comments are skipped by the SDK, so they do not
  reset an idle timer — only real chunks (content or `delta.reasoning`) do. · ref: `src/llm/openrouter.ts` (`streamCompletion`)

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

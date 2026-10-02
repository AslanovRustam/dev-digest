# Insights — reviewer-core

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._

- **2026-10-02** · `OpenRouterProvider`'s `timeout: 90_000` does NOT bound a review call: a single-pass review of
  PR #6 (100 files, 23.5k diff lines — 18.7k of them drizzle `migrations/meta/*_snapshot.json`) kept ONE HTTPS
  connection to openrouter.ai open for 19+ minutes (checked with `Get-NetTCPConnection` on the API pid), far past
  90 s × 3 SDK attempts. The UI just shows "Review in progress…"; Cancel frees the run (DB + RunBus) but the request
  keeps running. · ref: `src/llm/openrouter.ts:51-56`

## Codebase Patterns

- **2026-09-29** · Any code that filters `Finding[]` must exempt `kind` in `{secret_leak,
  lethal_trifecta, phantom, hook}` from line-level diff grounding: those come from full-file
  scanners and only require the FILE to be present in the diff, not a `[start_line, end_line]`
  intersection with a hunk. A naive "drop findings that miss a hunk" filter deletes every secret
  leak silently. · ref: `reviewer-core/src/grounding.ts:16` (`FULL_FILE_KINDS`)

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

- **2026-10-02** · Why does the 90 s SDK timeout not fire on long OpenRouter calls? Likely: openai-node clears its
  timer once response headers arrive, and OpenRouter answers non-streaming requests early and keeps the body alive with
  whitespace while the model generates. Verify, then pass an overall `AbortSignal.timeout(...)` as `signal` (it also
  aborts body reading). Separately, generated files (migration snapshots, lockfiles) should be filtered out of the
  review diff before prompting.

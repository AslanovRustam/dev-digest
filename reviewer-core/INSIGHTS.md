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

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

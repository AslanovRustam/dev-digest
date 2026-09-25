# Insights — client

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._
- **2026-09-25** · For any rich tooltip or popover, reuse `components/hover-card/HoverCard` (portal + fixed
  position) instead of an absolutely-positioned panel — why: `@devdigest/ui` has no Tooltip/Popover, and the
  PR list's `tableCard` has `overflow: hidden`, which clips absolute panels. Keep its `stopPropagation` on the
  card: React bubbles portal events through the COMPONENT tree, so a click inside the card would still reach
  `PRRow`'s `onClick` and navigate. · ref: `src/components/hover-card/HoverCard.tsx`, `src/app/repos/[repoId]/pulls/styles.ts`

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

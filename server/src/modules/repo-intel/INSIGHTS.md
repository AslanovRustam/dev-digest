# Insights — repo-intel

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`. General server lessons go to `server/INSIGHTS.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._

- **2026-10-01** · Don't treat `getTopFilesByRank` / `getConventionSamples` order as "most central first" on every repo — on
  dev-digest itself all 312 `file_rank.rank` values are identical (0.00321), so the "top N" is effectively path order
  (12 siblings from `client/src/app/agents/`). Callers that need a representative sample must widen the pool and
  spread it themselves. why: verified with `select split_part(file_path,'/',1), max(rank) from file_rank where repo_id=…`.
  · ref: `src/modules/conventions/helpers.ts` (`diversifySample`)

## Codebase Patterns

_None yet._

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

- **2026-10-01** · Why is `file_rank` flat for the multi-package dev-digest repo? Unverified guess: no `file_edges` resolve
  across `server/`, `client/`, `reviewer-core/` (per-package tsconfig `paths`), so PageRank degenerates to uniform.
  Check `select count(*) from file_edges where repo_id=…` and the depgraph tsconfig resolution.

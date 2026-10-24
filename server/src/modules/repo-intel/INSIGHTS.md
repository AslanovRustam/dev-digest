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

- **2026-10-24** · Don't read `getBlastRadius().degraded/reason` as the index state: the facade only ever reports
  `reason: 'no_data'` (ripgrep fallback), returns `degraded: false` for a `partial` index and never sets `flag_off`.
  Consumers that must show an honest state read `getIndexState()` + `config.repoIntelEnabled` themselves — why: the
  persistent path (`tryPersistentBlast`) accepts `full` and `partial` alike · ref: `src/modules/blast/helpers.ts`
  (`blastDegradation`), `src/modules/repo-intel/service.ts` (`getBlastRadius`)
- **2026-10-24** · A consumer module's ring-0 `helpers.ts` may not even type-import `repo-intel/types.ts` (`pnpm arch`
  rule `domain-files-are-pure`): declare a local structural interface for the facade fields it reads, and let the
  module's `service.ts` pass the facade result in · ref: `src/modules/blast/helpers.ts` (`BlastInput`)

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

- **2026-10-24** · Supersedes 2026-10-01 (Open Questions, flat `file_rank`). Not tsconfig `paths`: on Windows the
  depgraph adapter dropped every edge (`\` vs `/` paths), so `file_edges` was empty and PageRank uniform. Fixed in
  `src/adapters/depgraph/index.ts`; after a resync this repo has 854 edges. See `server/INSIGHTS.md` (2026-10-24).

## Session Notes

_None yet._

## Open Questions

_None yet._

- **2026-10-01** · Why is `file_rank` flat for the multi-package dev-digest repo? Unverified guess: no `file_edges` resolve
  across `server/`, `client/`, `reviewer-core/` (per-package tsconfig `paths`), so PageRank degenerates to uniform.
  Check `select count(*) from file_edges where repo_id=…` and the depgraph tsconfig resolution.

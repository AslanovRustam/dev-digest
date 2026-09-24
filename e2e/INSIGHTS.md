# Insights — e2e

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

- **2026-09-23** · If `./scripts/e2e.sh` cannot start its Postgres on :5433, rerun with
  `E2E_PG_PORT=5440 E2E_API_PORT=3201 E2E_WEB_PORT=3200 ./scripts/e2e.sh` — why: other local projects'
  containers (here `classhub-db`) may already publish :5433. Risk seen, not yet hit.
  · ref: `../scripts/e2e.sh`

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

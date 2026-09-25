# Insights — e2e

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._
- **2026-09-25** · Don't write "X is NOT shown" steps in a flow — the runner has no negative check (`Step.assert`
  only supports `stdoutIncludes`, and `wait --text` only waits for presence). Assert the positive state plus
  the URL, and cover the absence in a client component test (e.g. severity filter → `FindingsPanel.test.tsx`).
  · ref: `lib/assert.ts`, `specs/08-findings-severity.flow.json`

## Tool & Library Notes

- **2026-09-23** · If `./scripts/e2e.sh` cannot start its Postgres on :5433, rerun with
  `E2E_PG_PORT=5440 E2E_API_PORT=3201 E2E_WEB_PORT=3200 ./scripts/e2e.sh` — why: other local projects'
  containers (here `classhub-db`) may already publish :5433. Risk seen, not yet hit.
  · ref: `../scripts/e2e.sh`
- **2026-09-25** · `agent-browser` is not installed on this dev machine, so flows can't run locally — for a manual
  UI check use the global `playwright-cli` (Chromium is already in `%LOCALAPPDATA%\ms-playwright`) against the
  dev stack, e.g. `playwright-cli open http://localhost:3000/` then `hover "getByTestId('severity-tally')"`.
  Run it from the scratchpad: it writes `.playwright-cli/` snapshots into the cwd. The web app on :3000 is
  usually already running (`pnpm dev` → EADDRINUSE). · ref: `CLAUDE.md` (Commands)

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

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

- **2026-09-30** · Write `wait --text` values exactly as RENDERED: agent-browser matches `innerText`, which
  applies CSS `text-transform`. The PR-list header renders "FINDINGS" (`textTransform: uppercase`), so
  `wait --text Findings` never matches — flow 08 failed in CI from the day it landed. Playwright's `getByText`
  matches DOM text case-insensitively, so a Playwright replay does NOT catch this; only the real runner does.
  · ref: `specs/08-findings-severity.flow.json`

## Tool & Library Notes

- **2026-09-23** · If `./scripts/e2e.sh` cannot start its Postgres on :5433, rerun with
  `E2E_PG_PORT=5440 E2E_API_PORT=3201 E2E_WEB_PORT=3200 ./scripts/e2e.sh` — why: other local projects'
  containers (here `classhub-db`) may already publish :5433. Risk seen, not yet hit.
  · ref: `../scripts/e2e.sh`
- **2026-09-25** · `agent-browser` is not installed on this dev machine, so flows can't run locally — for a manual
  UI check use the global `playwright-cli` (Chromium is already in `%LOCALAPPDATA%\ms-playwright`) against the
  dev stack, e.g. `playwright-cli open http://localhost:3000/` then `hover "getByTestId('severity-tally')"`.
  Run it from the scratchpad: it writes `.playwright-cli/` snapshots into the cwd. The web app on :3000 is
  usually already running (`pnpm dev` → EADDRINUSE). · ref: `AGENTS.md` (Commands)

- **2026-09-30** · Without `agent-browser`, replay the flows with the Playwright MCP
  `browser_run_code_unsafe`: embed the `specs/*.flow.json` steps and map `open`→`goto`, `wait --url`→
  `waitForURL(includes)`, `wait --text`→`getByText().first().waitFor({state:'visible'})`, `find text … click`,
  `find role … --name`. The script file must live under the repo root (`.playwright-mcp/`, NOT gitignored —
  delete it before committing); `%TEMP%` is rejected. Run it against an isolated stack (throwaway Postgres
  on another port + API/web on 3201/3200) so the dev DB is untouched. · ref: `run.ts`, `specs/`

- **2026-09-30** · Supersedes 2026-09-25 (agent-browser not installed): it is now installed globally. On
  Windows `npm test` fails every step with `spawn agent-browser ENOENT` — `execFile` can't run npm's `.cmd`
  shim. Point the runner at the native binary: `AGENT_BROWSER_BIN="$(npm root -g)/agent-browser/bin/agent-browser-win32-x64.exe"`,
  plus `E2E_BASE_URL` for a non-3000 web port. To mirror CI's keyless API, start it with empty
  `GITHUB_TOKEN`/`*_API_KEY` env vars and `USERPROFILE` pointing at an empty dir (secrets.json lives in `~/.devdigest`).
  · ref: `run.ts`

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._

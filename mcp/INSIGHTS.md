# Insights — mcp

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

- **2026-10-23** · Keep the server opt-in with `mcp/devdigest.mcp.json` + `claude --mcp-config mcp/devdigest.mcp.json`,
  started from the repo root. The relative `args` path `mcp/dist/index.js` resolves against the launch directory.
  Verified headless: `list_agents` returned 5 agents.
  - Do not use a root `.mcp.json`: it makes Claude Code spawn the server in every session in the repo.
  - For the VS Code extension / a persistent setup: `claude mcp add --scope local devdigest -- node "$(pwd -W)/mcp/dist/index.js"`
    in Git Bash. `pwd -W` gives `D:/…`, which `node.exe` accepts; `/d/…` does not work. Verified with
    `claude mcp get devdigest` → ✔ Connected, path with spaces. · ref: `mcp/README.md`
- **2026-10-23** · To read an EXISTING review ("the last security run on PR X"), take the `run_id` from the API
  `GET /pulls/:prId/runs` (fields `run_id`, `agent_name`, `status`, `ran_at`, `findings_count`), then call `get_findings`.
  No MCP tool lists a PR's runs, and `run_agent_on_pr` starts a NEW paid run (10/min limit) instead of reading one.
  - `get_findings` truncates `summary` with "…" even with `response_format: "detailed"`; the full text is in
    `GET /runs/:id/findings`.
  - When `devdigest` is not connected to the session, drive it over stdio: import `Client` and `StdioClientTransport`
    by absolute file URL from `mcp/node_modules/@modelcontextprotocol/client/dist/{index,stdio}.mjs`, spawn
    `node <abs>/mcp/dist/index.js`, `client.callTool(...)`. Verified on PR #10. · ref: `mcp/src/tools/get-findings.ts`, `server/src/modules/reviews/routes.ts:103`

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-10-23** · Keep the tool registry (`TOOLS` array) in `src/server.ts`, not in a `src/tools/index.ts`.
  A barrel inside `tools/` that imports every tool breaks `no-cross-tool-imports` (MR6). For the same reason,
  logic shared by tools goes to `resolve.ts`/`wait.ts`/`format.ts`, never into a sibling tool, and `ToolResult`
  is defined in ring-0 `format.ts` so `format.ts` never imports ring 2. · ref: `mcp/.dependency-cruiser.cjs`, `mcp/src/server.ts`
- **2026-10-23** · dependency-cruiser only sees imports. The globals `fetch(`, `process.env` and `console.log`
  are policed by the grep in `test/architecture.test.ts`, which runs on comment-stripped sources. A new
  I/O global (e.g. `setTimeout` outside `Clock`) needs a pattern added there, not a depcruise rule.
  · ref: `mcp/test/architecture.test.ts`

## Tool & Library Notes

- **2026-10-23** · Supersedes 2026-10-19 (root `INSIGHTS.md` → Open Questions, SDK v1 vs v2). MCP TypeScript SDK v2
  is stable on npm: `@modelcontextprotocol/server` latest is 2.3.1 and depends on `zod ^4.2.0`, while v1
  `@modelcontextprotocol/sdk` stays at 1.32.1. This package uses v2 with a single zod 4 (`npm ls zod`). v2 API shape
  that differs from v1 examples on the web:
  - `Client` is in a separate package, `@modelcontextprotocol/client` (needed for in-memory contract tests).
  - A tool callback is `(args, ctx)`:
    - progress token: `ctx.mcpReq._meta?.progressToken`;
    - progress notifications: `ctx.mcpReq.notify({ method: 'notifications/progress', … })`;
    - cancellation: `ctx.mcpReq.signal` (no `extra`).
  - A raw-shape `inputSchema` is deprecated; pass `z.object(shape)`.
  - Stdio transport: `@modelcontextprotocol/server/stdio`.
  · ref: `mcp/node_modules/@modelcontextprotocol/server/dist/*.d.mts`, `mcp/package.json`

## Recurring Errors & Fixes

- **2026-10-23** · **Symptom:** after tightening a response shape, a tool test fails with the generic "Unexpected API
  response — is the DevDigest server up to date?" text and no API call after the first one. **Cause:** every
  API id that goes into a URL path is `z.uuid()` in `src/contracts.ts` (`Repo.id`, `PrMeta.id`, `runs[].run_id`/`agent_id`).
  A fixture id like `'repo-1'` therefore fails parsing as `bad_shape`. **Fix:** use uuid constants in fake API
  responses (including `test/server-contract.test.ts` fixtures, NOT its pinned §6a strings). · ref: `mcp/src/contracts.ts:20`

## Session Notes

### 2026-10-23 — read the latest Security Reviewer run on PR #10 via devdigest MCP
Server was not connected in the VS Code session; ran it over a stdio client. Run id came from `GET /pulls/:id/runs`
(no MCP tool for it), findings from `get_findings`.

## Open Questions

_None yet._

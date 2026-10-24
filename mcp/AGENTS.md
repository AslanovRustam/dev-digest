# mcp — `@devdigest/mcp` (stdio MCP server `devdigest`)

A thin client over the DevDigest HTTP API (`:3001`): five tools for an MCP client such as Claude Code.
It imports nothing from `server/`, `reviewer-core/` or any `vendor/shared` — it is NOT a `shared` consumer.
Spec: `../specs/07-mcp-server.md` (source of truth for scope).

## Before answering
- Read `src/server.ts` (SDK wiring, `TOOLS` registry) and the tool you change in `src/tools/`.
- Changing any LLM-facing text? See "Pinned texts" first.
- Changing an API route the server exposes? See "API routes used".

## Stack
TypeScript (builds to `dist/`) · MCP SDK **v2** `@modelcontextprotocol/server` 2.3.1 · Zod 4 (one copy, check
`npm ls zod`) · vitest 2 · dependency-cruiser 17. The tool callback is `(args, ctx)`; the test `Client` lives in
the separate `@modelcontextprotocol/client` (devDependency, pinned 2.3.1).

## Commands (npm — NOT pnpm)
- Install: `npm ci` · Typecheck: `npm run typecheck` · Test: `npm test`
- Layering: `npm run arch` (dependency-cruiser, strict, no baseline) · Build: `npm run build` (writes `dist/`)
- Run: `npm start` · Inspector: `npm run inspector` (needs a built `dist/` and the API up)

## Map
- `src/index.ts` — composition root: `loadConfig` → `createHttpApi` → real `Clock` → `createServer` → stdio
- `src/server.ts` — the only SDK user: registers `TOOLS`, maps `ToolResult` → MCP content, progress token/signal
- `src/config.ts` — the only `process.env` reader (Zod, fails fast) · `src/adapters/http-api.ts` — the only `fetch`
- `src/ports.ts` — `ApiClient`, `Clock`, `ProgressSink`, `Config`, `Result`
- `src/contracts.ts` — lenient local Zod response shapes + flat tool input shapes (`.describe()` texts)
- `src/format.ts` — compact/paginate/truncate/counts, `ToolResult` · `src/messages.ts` — every error / `next` text
- `src/constants.ts` — limits and defaults · `src/resolve.ts` — `owner/name` + PR number → ids, API error text
- `src/wait.ts` — `waitForRun` poll loop · `src/tools/*.ts` — `list-agents`, `run-agent-on-pr`, `get-findings`,
  `get-conventions`, `get-blast-radius` (stub), `types.ts` (`ToolDef`, `ToolCtx`)

## Rings (onion applied to `mcp/`; enforced by `npm run arch` + `test/architecture.test.ts`)
Dependencies point inward. Flat files, no `domain/` folder; folders only for `tools/` and `adapters/`.

| Ring | Files | May import |
|---|---|---|
| 0 domain (pure) | `contracts.ts` · `format.ts` · `messages.ts` · `constants.ts` | `zod`, ring-0 siblings |
| 1 ports | `ports.ts` | ring 0 (types) |
| 2 application | `resolve.ts` · `wait.ts` · `tools/*.ts` (+ `tools/types.ts`) | rings 0–1 |
| 3 infrastructure | `adapters/http-api.ts` · `config.ts` | rings 0–1 |
| 4 transport + composition | `server.ts` · `index.ts` | everything |

- Ring 2/3 outward imports are blocked by `application-no-outer-rings` / `infrastructure-no-outer-rings`.
- MR1 `sdk-only-in-transport`: `@modelcontextprotocol/*` only in `server.ts`, `index.ts`. Tools return a plain `ToolResult`.
- MR2 `io-only-in-adapters`: `fetch` / `node:http(s)` only in `adapters/**`; `process.env` only in `config.ts`.
  Globals are invisible to depcruise, so `test/architecture.test.ts` greps for them (and for `console.log|info`, `process.stdout`).
- MR3 `no-concrete-adapters-outside-composition`: `adapters/http-api.ts` and `config.ts` imported only by `index.ts` (and tests).
- MR4 `domain-files-are-pure`: ring 0 imports only `zod` + ring-0 siblings; no `ports`, `tools`, node built-ins.
- MR5 `ports-import-domain-only`: `ports.ts` imports ring 0 only.
- MR6 `no-cross-tool-imports`: a tool never imports another tool; shared logic goes to `resolve.ts` / `wait.ts` / `format.ts`.
  This is why the tool registry lives in `server.ts`, not in a `tools/index.ts`.
- MR7 `no-foreign-packages`: nothing imports `../server`, `../reviewer-core`, `../client` or any `vendor/shared`.
- MR8 `no-circular`.

## Where does it go?
- New tool → `src/tools/<name>.ts` as a `ToolDef`, register it in `TOOLS` in `server.ts`, input shape in `contracts.ts`.
- New API call → response shape in `contracts.ts`; call it through `ApiClient` (`ports.ts`); `adapters/http-api.ts` is the only `fetch`.
- New error / `next` text → `messages.ts` (tools never inline error text; every message names a next step).
- New env var → `config.ts` (Zod) + default/limits in `constants.ts`, and document it here.
- Pure shaping of output (compact fields, pagination, truncation) → `format.ts`.
- Repo / PR lookup, polling → `resolve.ts` / `wait.ts`, never inside a tool.

## Conventions (non-default)
- Never write to stdout (it is the MCP channel): logs go to stderr via `console.error`. A test enforces it.
- Only validated uuids go into URL paths, always through `encodeURIComponent`. The server does not validate `agentId`
  as a uuid, so `run_agent_on_pr` pre-validates it.
- Never echo a 5xx body; no stack traces or paths in tool text. Finding / convention text is untrusted LLM output
  derived from PR content: truncate it and return it as data fields only.
- Outcome, not operation; flat arguments; concise structured output; errors lead forward (name the next tool or action).
- Token rules: tools are deferred in Claude Code, so only the names and `instructions` load at start. Keep tool
  descriptions to 1-2 sentences, input schemas flat (no nesting, `$ref`/`$defs`/`oneOf`), no `outputSchema`, no
  `_meta["anthropic/alwaysLoad"]`; `.describe()` only on the params listed in the spec; `limit` + `cursor` +
  `response_format` (concise by default) on list-like tools; keep one response well under 10k tokens.
- One Zod copy only: a second one breaks types (TS2589). Do not add dependencies casually.

## Pinned texts
LLM-facing texts (server `instructions`, tool titles and descriptions, param `.describe()` texts) are pinned by
`test/server-contract.test.ts`, which holds the expected strings inline. Change them only with the user's approval,
keeping each description at most 2 sentences and 300 chars, and the instructions at most 600 chars; edit
the "LLM-facing texts" section of `specs/07-mcp-server.md` first, then the code, then the test.

## API routes used
| Route | Used by |
|---|---|
| `GET /agents` | `list_agents` |
| `GET /repos` · `GET /repos/:id/pulls` | `resolve.ts` (repo + PR number → ids; the pulls route syncs from GitHub first, so it is slow) |
| `POST /pulls/:prId/review` (`{agentId}`, 10/min rate limit) | `run_agent_on_pr` |
| `GET /runs/:id/findings` | `wait.ts`, `get_findings` |
| `GET /repos/:id/conventions` | `get_conventions` |

A change to one of these (path, status, shape) means updating `src/contracts.ts` and its tests. The server's
`GET /runs/:id/findings` response is `RunFindingsResponse` in `server/src/vendor/shared/contracts/review-api.ts`;
this package keeps its own lenient copy on purpose.

## Gotchas
- Wait cap: `DEVDIGEST_RUN_WAIT_MS` (default 600000, max 1800000) must stay below Claude Code's `MCP_TOOL_TIMEOUT`
  (wall-clock; progress notifications do not extend it). Other env: `DEVDIGEST_API_URL`, `DEVDIGEST_POLL_INTERVAL_MS`
  (5000), `DEVDIGEST_HTTP_TIMEOUT_MS` (30000). An empty value counts as unset.
- Opt-in only. Do NOT add a root `.mcp.json`: Claude Code would spawn the server in every session in this repo.
  `./scripts/dev.sh` must not start it either.
- Connecting it:
  - one session: `claude --mcp-config mcp/devdigest.mcp.json`, started from the repo root, because the entry path
    `mcp/dist/index.js` is relative to the launch directory;
  - persistent, per user: `claude mcp add --scope local` with an absolute path.
  Steps are in `README.md`.
- Rebuild `dist` after every edit (`npm run build`), then reconnect in `/mcp` or start a new session. `dist/` is git-ignored.
- The server itself reads no project files, only env + HTTP, so its own cwd does not matter, only the entry path.
- The API must be running (`./scripts/dev.sh`) and the repo + PR already imported in DevDigest.
- A PR whose repo is not cloned and has no `pr_files` is reviewed with an empty diff (same as in the UI before opening the PR).
- `get_blast_radius` is a registered stub that always returns an error (lesson L04 homework).

## Docs
| Doc | Use when |
|-----|----------|
| `README.md` | need to build, connect (opt-in), use, stop or troubleshoot the server from zero |
| `../specs/07-mcp-server.md` | need scope, the approved LLM-facing texts, tool behaviour and errors |
| `INSIGHTS.md` | the server misbehaves unexpectedly; entries are added via the `engineering-insights` skill |

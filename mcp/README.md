# devdigest MCP server — run it from zero

A local stdio MCP server that gives Claude Code five DevDigest tools: `list_agents`, `run_agent_on_pr`,
`get_findings`, `get_conventions` and `get_blast_radius` (stub). It is a thin client over the DevDigest HTTP API.

It is **opt-in**:
- `./scripts/dev.sh` never starts it.
- There is no root `.mcp.json`, so an ordinary Claude Code session in this repo does not load it.

You connect it to a session only when you need it.

> How a stdio MCP server runs: there is no daemon to start. The MCP client (Claude Code) spawns
> `node mcp/dist/index.js` as a child process when it connects the server to a session, and stops it when
> the session ends. "Starting the server" therefore means "connecting it to a Claude Code session".

## What you need

| Tool | Check | Why |
|---|---|---|
| Node.js ≥ 22 and npm | `node -v` | builds and runs the server |
| Docker, pnpm | `docker -v`, `pnpm -v` | the DevDigest stack (`./scripts/dev.sh`) |
| Claude Code CLI or the VS Code extension | `claude --version` | the MCP client. Tested with 2.1.309 |
| Git Bash (Windows) | — | runs the `.sh` scripts and the commands below |
| An LLM provider key in DevDigest Settings | — | only `run_agent_on_pr` needs it |

## 1. Start DevDigest (the MCP server is not part of this)

From the repo root:

```bash
./scripts/dev.sh               # Postgres (Docker) → migrate → seed → API :3001 + web :3000
```

Keep that terminal open. Check the API:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health/ready   # → 200
```

On Windows, a local PostgreSQL service on :5432 can steal the Docker DB's connections (`ECONNRESET`, or `28P01`
with garbled text). See the root `AGENTS.md` → Gotchas.

## 2. Put the data in DevDigest

The tools only see what DevDigest already knows. Open http://localhost:3000 and:

1. **Add the repo** you want to review. The tools address it as `owner/name`, e.g. `acme/payments-api`.
2. **Open or import the PR** in the UI. The tools address it by its GitHub number, e.g. `482`.
3. Optional: in the repo's **Conventions** tab, extract and accept conventions. Until then, `get_conventions`
   returns an empty list with a hint.
4. For `run_agent_on_pr`: make sure the agent's provider key is set in **Settings**.

## 3. Build the MCP server

Run this once, and again after every change in `mcp/`:

```bash
cd mcp
npm ci
npm run build                  # → mcp/dist/index.js
```

Optional checks: `npm test`, `npm run typecheck`, `npm run arch`.

Quick self-check. With stdin closed, the server starts, logs one line to **stderr** and exits. It never writes to
stdout, because stdout is the MCP channel:

```bash
node dist/index.js < /dev/null
# [devdigest-mcp] ready, API http://localhost:3001
```

## 4. Optional: try it without Claude (MCP Inspector)

```bash
cd mcp
npm run inspector              # = npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a browser UI. Connect, then **Tools → List**, and call `list_agents`. It downloads the Inspector on first use.

## 5. Connect it to Claude Code, only when you need it

### Option A — one session (CLI, recommended)

Start Claude Code **from the repo root**. The entry path in `mcp/devdigest.mcp.json` (`mcp/dist/index.js`) is
relative to the directory you launch from.

```bash
cd "<repo root>"
claude --mcp-config mcp/devdigest.mcp.json
```

- Inside the session, `/mcp` shows `devdigest` as connected.
- When the session ends, Claude Code stops the server.
- A plain `claude` session started later does not have it.
- To load **only** this server and skip your other MCP servers, add `--strict-mcp-config`.

One-off, without an interactive session:

```bash
echo "Call list_agents of the devdigest MCP server and reply AGENTS=<count>." \
  | claude -p --mcp-config mcp/devdigest.mcp.json --allowedTools mcp__devdigest__list_agents
```

Pass the prompt on stdin. `--allowedTools` and `--disallowedTools` take a list of values, so a prompt placed after
them is read as one more tool name.

### Option B — registered for you in this project (VS Code extension, or a persistent CLI setup)

Run this from the repo root in **Git Bash**. `pwd -W` prints a Windows path such as `D:/projects/...`, which
`node.exe` understands. A Git Bash path such as `/d/projects/...` does not work.

```bash
claude mcp add --scope local devdigest -- node "$(pwd -W)/mcp/dist/index.js"
claude mcp get devdigest       # → Scope: Local config … Status: ✔ Connected
```

- `--scope local` stores the entry in your `~/.claude.json` for this project only. Nothing is committed.
- From then on, every new session in this repo connects the server. Turn it off in `/mcp` when you don't need it.
  The toggle is remembered per project. Turn it back on when you do need it.
- To remove the entry: `claude mcp remove devdigest -s local`.
- To pass settings, add `-e KEY=value` before `--`. For example:
  `claude mcp add --scope local -e DEVDIGEST_RUN_WAIT_MS=300000 devdigest -- node "$(pwd -W)/mcp/dist/index.js"`.

Unverified: that the VS Code extension shows the local-scope entry exactly like the CLI. The settings files are
shared, but the docs do not spell out MCP. After adding it, open a new conversation in the extension and ask
"Which DevDigest reviewer agents are configured?". The `list_agents` tool should run.

## 6. Use it

Ask in plain language. Claude picks the tools.

| You ask | Tools Claude calls |
|---|---|
| "Which DevDigest reviewer agents are configured?" | `list_agents` |
| "Run the Security Reviewer on acme/payments-api PR #482 — can it merge?" | `list_agents` → `run_agent_on_pr` |
| "Show the findings of run `<run_id>` with full rationale." | `get_findings` (`response_format: "detailed"`) |
| "What coding conventions does acme/payments-api follow?" | `get_conventions` |
| "What breaks if PR #482 merges?" | `get_blast_radius` → "NOT IMPLEMENTED (L04)" (stub) |

- `run_agent_on_pr` is the only tool that writes. It starts a real review, which costs one LLM review with the
  agent's provider.
- It waits for the review to finish and sends progress while it waits, then returns the verdict and compact findings.
- If the review takes longer than the wait cap (10 min by default), it returns the `run_id`. Ask for
  `get_findings` later.
- Claude Code asks for permission before each tool call unless you allow the tool.

## 7. Configuration

All settings are optional environment variables. The defaults live in `src/constants.ts`.

| Variable | Default | Allowed | Meaning |
|---|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | http(s) URL | where the DevDigest API runs |
| `DEVDIGEST_RUN_WAIT_MS` | `600000` (10 min) | 0–1,800,000 | how long `run_agent_on_pr` waits before returning the `run_id` |
| `DEVDIGEST_POLL_INTERVAL_MS` | `5000` | 1,000–60,000 | how often it polls the run while waiting |
| `DEVDIGEST_HTTP_TIMEOUT_MS` | `30000` | 1,000–120,000 | timeout of one API request |

- An invalid value stops the server at start with
  `Invalid devdigest-mcp configuration — <VAR>: <reason>` on stderr. `/mcp` then shows the server as failed.
- To set a value with Option A, add `"env": { "DEVDIGEST_RUN_WAIT_MS": "300000" }` to the server entry of a copy of
  `mcp/devdigest.mcp.json`, and pass that copy to `--mcp-config`. With Option B, use `-e` (see above).

## 8. Stop

- **MCP server, Option A**: end the Claude Code session.
- **MCP server, Option B**: toggle it off in `/mcp`, or `claude mcp remove devdigest -s local`.

  In both cases there is no process to kill yourself.
- **DevDigest**: press Ctrl-C in the `./scripts/dev.sh` terminal (API + web). Postgres keeps running. Stop it with
  `docker stop devdigest-postgres`.
- Never run `docker compose down -v` casually. It deletes the `devdigest_pgdata` volume with every imported repo and review.

## 9. After changing code in `mcp/`

Run `npm run build` in `mcp/`, then reconnect `devdigest` in `/mcp` or start a new session. The server always runs
from `dist/`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/mcp` does not list `devdigest` (Option A) | Start `claude` from the **repo root** with `--mcp-config mcp/devdigest.mcp.json`. |
| `devdigest` listed but failed | `mcp/dist/index.js` is missing → `cd mcp && npm run build`. Or an env value is invalid (see 7). |
| "DevDigest API not reachable at http://localhost:3001 …" | Start `./scripts/dev.sh` and check `/health/ready`. |
| "Repo X is not in DevDigest — add it in the UI (localhost:3000). Known: …" | Add the repo in the UI, or use one of the listed names. |
| "PR #N not found in X — open/import it in DevDigest first. Known: #…" | Open or import the PR in the UI. |
| "Agent '…' not found — call list_agents for valid ids" | Pass the agent **id** from `list_agents`, not its name. |
| Rate-limit message on `run_agent_on_pr` | The API allows 10 review starts per minute. Wait about a minute. |
| "Run … failed: … Check the agent's provider key in DevDigest Settings …" | Set or fix the provider key, then retry. |
| `run_agent_on_pr` returned `status: "running"` and a `run_id` | The review outlasted the wait cap. Call `get_findings` with that `run_id` later. |
| `get_conventions` returns an empty list with `next` | Extract or accept conventions in the repo's Conventions tab. |
| API `ECONNRESET` / `28P01` on Windows | A local PostgreSQL service owns :5432 (root `AGENTS.md` → Gotchas). |

To measure the token cost, run `/context` in a session without the server and in one started with
`--mcp-config`. Claude Code loads MCP tools lazily (tool search), so the difference at session start is about the
tool names plus the server `instructions` (469 chars).

## See also

- `AGENTS.md`: the architecture (rings, rules), conventions and gotchas for changing this package.
- `../specs/07-mcp-server.md`: scope, the approved LLM-facing texts, tool behaviour and errors.

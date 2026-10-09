# DevDigest

Local-first AI pull-request review. Course starter: exactly one flow works end to end
(add repo → import PR → agent review); lessons L01–L08 add features back.
4 independent packages — NO workspace, NO shared node_modules, mixed package managers.

## Before answering
- Identify which package(s) the task touches, then read that package's `AGENTS.md` first
  (subdirectory auto-load is unreliable in the VS Code extension — do not rely on it).
- Agent instructions live in `AGENTS.md`; the `CLAUDE.md` next to it is a one-line `@AGENTS.md`
  import stub for Claude Code — always edit `AGENTS.md`, never the stub.
- Skim root `INSIGHTS.md` + the package `INSIGHTS.md` for known traps before a non-trivial change.
- If the task changes a Zod contract, plan the edit in BOTH copies of `shared` (see below).
- If a `specs/` file exists for the feature, it is the source of truth for scope.

## Map
| Path             | What                                                  | PM   | Port |
|------------------|-------------------------------------------------------|------|------|
| `server/`        | Fastify 5 API + Drizzle, Postgres 16 + pgvector       | pnpm | 3001 |
| `client/`        | Next.js 15 / React 19 studio                          | pnpm | 3000 |
| `reviewer-core/` | pure engine: diff → prompt → LLM → grounded findings  | npm  | —    |
| `e2e/`           | deterministic agent-browser flows                     | npm  | —    |
| `scripts/`       | `dev.sh` (full stack) · `e2e.sh` (hermetic e2e stack) · `diff-index.mjs` (review scope map) | —    | —    |

## Commands (Windows: run `.sh` in Git Bash, not PowerShell)
- Full stack from zero: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- Only Postgres runs in Docker; API and web run on the host.
- Per-package test / typecheck commands → that package's `AGENTS.md`.
- Backend layering is machine-checked: `cd server && pnpm arch` (see the `onion-architecture` skill).

## Cross-package rules
- `@devdigest/shared` resolves to `server/src/vendor/shared`. `client/src/vendor/shared` is a
  SEPARATE, already-diverged copy — a contract change must be applied to both.
- reviewer-core is consumed as raw TS source via tsconfig `paths` (no build, no publish);
  it imports `shared` from `../server`, so a `shared` edit also affects the engine.
- Contracts are Zod; derive types with `z.infer`, never hand-write a parallel TS type.
- CI is path-filtered per package (`.github/workflows/`); `reviewer-core/**` also triggers server CI.

## Gotchas
- Migrations never run on boot: `cd server && pnpm db:migrate`.
- Windows: a local PostgreSQL service on :5432 silently steals the Docker DB's connections
  (symptoms: `ECONNRESET`, or `28P01` with mojibake text). Stop the service or remap the port.
- Do NOT suggest `docker compose down -v` casually — it deletes the `devdigest_pgdata` volume
  with every imported repo and review.
- `server/package.json` is skip-worktree (local variant differs from the committed one).
- The DB schema already holds tables for ALL lessons; empty tables are by design, not dead code.
- Comments mention things not in the starter yet (`agent-runner`, intent, `T1.3`/`T3` task ids) —
  they are future lessons, not missing files.
- Writing file content through a bash heredoc corrupts backslash escapes silently — `\(` vanishes
  in a JS template literal, `\1` becomes chr(1) in a Python non-raw string. Use the Write/Edit tools
  for content with escapes, or verify with `cat -A` afterwards; the terminal renders the damage as
  nothing.

## Agents (`.claude/agents/`)
- Pipeline: optional `researcher` (external facts only) → `planner` (researches the code itself,
  Development Plan, read-only) → `implementer`, one run per plan phase (code + package tests) → optional
  `test-writer` (test files only) → `plan-verifier` (every plan item traced to code + evidence) and
  `architecture-reviewer` (boundary rules), both read-only → `doc-writer` (docs for what shipped) → the
  user runs `/pr-self-review`.
- Subagents do not see the conversation: save the planner's output to `.devdigest/plans/<NN-slug>.md`
  (git-ignored) and give every later agent that path, never "the plan above". Save a report there too
  when another agent needs it (e.g. the implementer's report for `plan-verifier`).
- Token budget (each artifact is re-read by every later agent, each agent turn re-sends its transcript):
  - Do not run `researcher` as a codebase pre-pass before `planner` — the planner does that research.
  - From the plan, the main session reads and shows the user only `## Summary for the caller`; the
    appendix after `<!-- RATIONALE -->` is for humans only.
  - Run `implementer` once per phase (`phase: P1`, `P2`, …) with a fresh context instead of one long run;
    pass the previous phase's saved report only if the next phase depends on it.
  - Before the reviewers: `git fetch`, then `node scripts/diff-index.mjs > .devdigest/plans/<NN-slug>.diff-index.md`
    and pass `diff-index:` + `base: origin/main` to `plan-verifier` and `architecture-reviewer`.
  - From `plan-verifier`, read only up to `## Traceability` (failing rows come first).
- `planner`, `implementer` and `test-writer` map files to skills through
  `.claude/skills/pr-self-review/references/routing.md` — the same table the self-review uses. Change it
  there, not in the agent prompts.
- Guards: `.claude/hooks/implementer-guard.mjs` and `.claude/hooks/agent-guard.mjs <profile>`. After
  editing one, run its `node --test`, then start a new session (agent definitions are cached).
- Subagents only propose INSIGHTS entries; the main session records them via `engineering-insights`.

## Engineering insights (mandatory)
- After a non-obvious finding (root cause, dead end, tool quirk, decision) and at the end of every
  task, invoke the `engineering-insights` skill — it appends to the owning module's `INSIGHTS.md`.
- A Stop hook (`.claude/settings.json`) asks for this check when the git working tree changed since
  the last check in the session (main-session, subagent or Bash edits) — answer it (append, or
  `Insights: nothing new`); never ignore it. Turns that only read or answer are not interrupted, so run
  the skill yourself at the end of a research-only task. After editing
  `.claude/skills/engineering-insights/scripts/stop-check.mjs`, run its `node --test`.

## Before opening a PR (mandatory)
- The `pr-self-review` skill has auto-invocation disabled (`disable-model-invocation: true`): the
  agent cannot run it — ask the user to run `/pr-self-review`, then continue. It reviews the
  branch-vs-base diff AND the working tree, routes each file to the skills that own it, and writes
  `report.json` + `pr-body-section.md` under `.devdigest/pr-self-review/`.
- A `PreToolUse` hook denies `gh pr create` / `gh pr merge` when the report is missing, stale, or
  BLOCKED, and when the PR body lacks the self-review section. It fails OPEN on any error.
- Disagree with a finding? Suppress it inline with a reason, or re-run with
  `--override "<reason>"` — both are recorded in the PR body. Never disable the hook.

## Do not touch
- `server/src/db/migrations/**` — generate with `pnpm db:generate`, never hand-edit.
- `server/clones/**` — runtime data.
- `.claude/skills/**` — vendored, managed by the ROOT `skills-lock.json` (there is no
  `.claude/skills-lock.json`). Exception: skills with NO entry there are project-owned and edited
  here. Grep the lock file rather than trusting a list — only 6 of the installed folders are
  vendored, and the lock also names skills that no longer have a folder.

## Docs
| Doc | Use when |
|-----|----------|
| `README.md` | need the architecture diagram, review flow end to end, or the lesson roadmap |
| `TESTING.md` | choosing which suite a test belongs in, or why CI ran / didn't run |
| `docs/agent-prompts/` | writing or tuning a reviewer agent's system prompt or model choice |
| `specs/` | implementing a feature that spans packages (one spec per feature / lesson) |
| `INSIGHTS.md` | something fails in a way that "shouldn't happen"; entries are added via the `engineering-insights` skill |
| `<package>/AGENTS.md` | before any edit inside that package |

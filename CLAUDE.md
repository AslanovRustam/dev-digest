# DevDigest

Local-first AI pull-request review. Course starter: exactly one flow works end to end
(add repo → import PR → agent review); lessons L01–L08 add features back.
4 independent packages — NO workspace, NO shared node_modules, mixed package managers.

## Before answering
- Identify which package(s) the task touches, then read that package's `CLAUDE.md` first
  (subdirectory auto-load is unreliable in the VS Code extension — do not rely on it).
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
| `scripts/`       | `dev.sh` (full stack) · `e2e.sh` (hermetic e2e stack) | —    | —    |

## Commands (Windows: run `.sh` in Git Bash, not PowerShell)
- Full stack from zero: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- Only Postgres runs in Docker; API and web run on the host.
- Per-package test / typecheck commands → that package's `CLAUDE.md`.

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

## Engineering insights (mandatory)
- After a non-obvious finding (root cause, dead end, tool quirk, decision) and at the end of every
  task, invoke the `engineering-insights` skill — it appends to the owning module's `INSIGHTS.md`.
- A Stop hook (`.claude/settings.json`) asks for this check after every prompt that used tools —
  answer it (append, or `Insights: nothing new`); never ignore it.

## Do not touch
- `server/src/db/migrations/**` — generate with `pnpm db:generate`, never hand-edit.
- `server/clones/**` — runtime data.
- `.claude/skills/**` — vendored, managed by `skills-lock.json`. Exception: `engineering-insights`
  is project-owned and edited here.

## Docs
| Doc | Use when |
|-----|----------|
| `README.md` | need the architecture diagram, review flow end to end, or the lesson roadmap |
| `TESTING.md` | choosing which suite a test belongs in, or why CI ran / didn't run |
| `docs/agent-prompts/` | writing or tuning a reviewer agent's system prompt or model choice |
| `specs/` | implementing a feature that spans packages (one spec per feature / lesson) |
| `INSIGHTS.md` | something fails in a way that "shouldn't happen"; entries are added via the `engineering-insights` skill |
| `<package>/CLAUDE.md` | before any edit inside that package |

# DevDigest

Local-first AI pull-request review. Course starter: exactly one flow works end to end
(add repo → import PR → agent review); lessons L01–L08 add features back.
5 independent packages — NO workspace, NO shared node_modules, mixed package managers.

## Before answering
- Identify which package(s) the task touches, then read that package's `AGENTS.md` first
  (subdirectory auto-load is unreliable in the VS Code extension — do not rely on it).
- Agent instructions live in `AGENTS.md`; the `CLAUDE.md` next to it is a one-line `@AGENTS.md`
  import stub for Claude Code — always edit `AGENTS.md`, never the stub.
- Skim root `INSIGHTS.md` + the package `INSIGHTS.md` for known traps before a non-trivial change.
- If the task changes a Zod contract, plan the edit in BOTH copies of `shared` (see below).
- If a spec exists for the feature (root `specs/` for cross-package features, `<package>/specs/` for
  one package — see `specs/README.md`), it is the source of truth for scope.

## Map
| Path             | What                                                  | PM   | Port |
|------------------|-------------------------------------------------------|------|------|
| `server/`        | Fastify 5 API + Drizzle, Postgres 16 + pgvector       | pnpm | 3001 |
| `client/`        | Next.js 15 / React 19 studio                          | pnpm | 3000 |
| `reviewer-core/` | pure engine: diff → prompt → LLM → grounded findings  | npm  | —    |
| `mcp/`           | opt-in MCP server `devdigest`, not run by dev.sh      | npm  | —    |
| `e2e/`           | deterministic agent-browser flows                     | npm  | —    |
| `scripts/`       | `dev.sh` (full stack) · `e2e.sh` (hermetic e2e stack) · agent pipeline: `diff-index.mjs` (review scope map), `plan.mjs` (plan slice / lint / files vs diff), `verify.mjs` (one full test run, fingerprinted), `tree-snapshot.mjs` (what a fix round changed) | —    | —    |

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
- `mcp/` is not a `shared` consumer: it talks to the API over HTTP with its own lenient Zod shapes; a new or
  changed route it uses means updating `mcp/src/contracts.ts` (see `mcp/AGENTS.md`).
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
  nothing. For `implementer` this is enforced: `implementer-guard.mjs` denies Bash file writes.

## Agents (`.claude/agents/`)
- Pipeline — three steps, each started by the user:
  1. optional `spec-creator` — draft spec from the user's sources (Figma, screenshots, text). When the user
     approves it, change only its `Status:` line to `approved`; after the PR merges, to `implemented`.
  2. `implementation-planner` — researches the code itself, checks the requirements, writes the plan to
     the `plan: .devdigest/plans/<NN-slug>.md` path you pass and returns only its summary. Run
     `node scripts/plan.mjs lint <plan>`; on an ERROR send the output back to the same run. The user
     picks the execution mode among its questions.
  3. `/run-plan plan:<path> [spec:] [brief:] [design:]` (`.claude/skills/run-plan/SKILL.md`) — everything
     after the plan: `implementer` per phase → `node scripts/verify.mjs` (the ONE full test run) → review
     rounds — `plan-verifier` ∥ `architecture-reviewer` (boundaries, not bugs) ∥ the `code-review` skill
     (correctness) — with fix rounds until no blocking finding is open (a delta re-review each round; after
     3 rounds it asks) → live check → `doc-writer` → the user runs `/pr-self-review`. The fix rounds, the
     ledger and the triage rules live in that skill.
  - `researcher` — external facts only, at any step.
  - `test-writer` is off in this pipeline (token budget); run it by hand on the verifier's "Rows without
    test evidence" when a gap matters.
- The planner cannot talk to the user. Ask every question from its `Summary for the caller` with
  `AskUserQuestion` — never answer one yourself, never skip one; the first is always the execution mode.
  If an answer differs from the planner's default or accepts a recommendation, continue the same planner
  run (`SendMessage` to its id) with the answers — a fresh run redoes the research.
- Execution mode — the user's choice, recorded in §0 of the saved plan:
  - multi-agent — `/run-plan` as above;
  - single-agent — the main session implements every phase itself (invokes the skills of the plan's
    Skill map, runs each `done when` and `node scripts/verify.mjs`) and spawns no subagents;
    `/pr-self-review` stays mandatory.
- `spec-creator` cannot talk to the user either. Ask every blocking question and proposal from its
  `SPEC: NEEDS_INPUT` with `AskUserQuestion`; run each "Needs research" item as its own `researcher`
  (independent ones in parallel); then continue the same run (`SendMessage`) with the answers and the
  reports. Its write limit (spec files only, drafts only) is a prompt rule — no guard hook backs it.
- Specs (`specs/**`, `<package>/specs/**`, `e2e/docs/specs/**`) are written only by `spec-creator`, as
  drafts — the one exception is the `Status:` line the main session moves on the user's word (step 1).
  They are planner input only: it never writes or edits a spec and never plans a spec step.
  A conflicting or outdated spec comes back under "Spec impact"; what happens to it is the user's call.
- Subagents do not see the conversation: give every agent the plan's path
  (`.devdigest/plans/<NN-slug>.md`, git-ignored), never "the plan above". The planner writes that file
  itself; implementer and both reviewers write their reports there too (`out:`) and return only a head.
- Token budget (each artifact is re-read by every later agent, each agent turn re-sends its transcript —
  measured: the context re-sent per turn, not test output, is what costs):
  - Do not run `researcher` as a codebase pre-pass before `implementation-planner` — it does that research.
  - Show the user the summary the planner returns; do not Read the plan file. The appendix after
    `<!-- RATIONALE -->` is for humans only.
  - Run `implementer` once per phase with a fresh context; it reads only `node scripts/plan.mjs slice
    <plan> <phase>`. Pass the previous phase's saved report only if the next phase depends on it.
  - Before the reviewers: `git fetch`, `node scripts/diff-index.mjs > .devdigest/plans/<NN-slug>.diff-index.md`
    and the `verify.mjs` record; pass `diff-index:`, `base: origin/main` and `verify:` to `plan-verifier`
    (`diff-index:` + `base:` to `architecture-reviewer`).
  - Models: `implementer`, `plan-verifier`, `architecture-reviewer`, `doc-writer` run on `sonnet`;
    `spec-creator` and `implementation-planner` on `opus`. `/run-plan verifier:opus` overrides the
    verifier for a schema or shared-contract plan.
  - Re-review after fixes is a delta: `scripts/tree-snapshot.mjs` gives the files a fix round changed;
    `plan-verifier` re-checks `rows:`, `architecture-reviewer` gets `scope:` + `previous:`.
- `implementation-planner`, `implementer` and `test-writer` map files to skills through
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
| `specs/README.md` | writing or reading a spec: which folder (root `specs/` = cross-package only, `<package>/specs/` = one package), naming, statuses |
| `INSIGHTS.md` | something fails in a way that "shouldn't happen"; entries are added via the `engineering-insights` skill |
| `<package>/AGENTS.md` | before any edit inside that package |

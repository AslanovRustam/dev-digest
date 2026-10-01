# Insights — cross-package

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`. Package-specific lessons go to `<package>/INSIGHTS.md`.

## What Works

_None yet._
- **2026-09-24** · Before planning a lesson feature, check remote branches for prior implementations —
  why: `main` is reset to the starter (`c6af1e4`), but e.g. run cost exists on `origin/full-functionality`
  (spec `git show 5406a0a:specs/01-run-cost-badge.md`, code `73b3849`/`641abb2`), `origin/lesson-1-lab/run-cost`,
  `origin/feat/review-cost`. Use as reference only; they disagree on design. · ref: `git branch -r`

## What Doesn't Work

- **2026-09-23** · Don't reset the local stack with `docker compose down -v` — why: `-v` drops the
  `devdigest_pgdata` volume with every imported repo and review; the root README suggests it,
  `e2e/README.md` forbids it. For a clean DB in tests run `./scripts/e2e.sh` (ephemeral Postgres).
  · ref: `docker-compose.yml`

- **2026-09-29** · A `PreToolUse` Bash hook must NOT match a gated command by bare substring
  (`/\bgh\s+pr\s+create\b/` over the whole command) — why: the tool_input is a shell LINE, so it
  also fires on `echo "gh pr create"`, on writing docs that mention the command, and on the hook's
  own tests, denying them with a confusing reason. Blank out quoted spans, split on `&&`/`||`/`;`/
  `|`/newline, strip `VAR=x` prefixes, and require a statement to BEGIN with the command.
  · ref: `.claude/skills/pr-self-review/scripts/gate.mjs` (`classify`)

- **2026-09-29** · In a review pipeline, apply inline suppression BEFORE the fail-fast gate, not
  only in the final report — why: `checks.mjs` decided `early_exit` on raw findings, so one
  accepted fixture credential in `gate.test.mjs` made every later run stop before the skill
  fan-out, silently disabling the whole review. Shared helper: `decideEarlyExit()`.
  · ref: `.claude/skills/pr-self-review/scripts/checks.mjs`

## Codebase Patterns

- **2026-09-29** · Agent instructions live in `AGENTS.md`; the `CLAUDE.md` beside it is a one-line
  `@AGENTS.md` import stub — edit `AGENTS.md`, never the stub. Both are committed in all five places
  (root, `server/`, `client/`, `reviewer-core/`, `e2e/`). A real symlink was rejected: this repo has
  `core.symlinks=false`, so on any Windows clone without Developer Mode a committed symlink checks out
  as a text file whose only content is `AGENTS.md`, and Claude Code reads THAT as the instructions
  while the real `AGENTS.md` never loads (`CLAUDE.md` wins precedence over `AGENTS.md`).
  · ref: `AGENTS.md:10`

- **2026-09-29** · Project-owned skills live in `.claude/skills/<name>/` exactly like vendored ones,
  but are deliberately absent from `skills-lock.json` — that lock file tracks only GitHub-sourced
  skills, so adding an entry for a local skill would make the sync tool try to overwrite it. Register
  a new one by adding a row to the `.claude/skills/README.md` catalog instead, marking it
  "Project-owned (not vendored)" as `engineering-insights` and `frontend-ui-architecture` do.
  · ref: `skills-lock.json`, `.claude/skills/README.md`

- **2026-09-29** · Test layout is MIXED across packages: `server/` and `reviewer-core/` keep tests in a
  top-level `test/` dir, while `client/` colocates `*.test.tsx` inside `src/`. A `find <pkg>/src -name
  '*.test.ts'` therefore returns nothing for the server and reads as zero coverage — it is actually 18 unit
  + 6 `*.it.test.ts` integration tests. Count from the package root, not from `src/`. · ref: `TESTING.md`

- **2026-09-29** · Supersedes the standing claim that `server/package.json` is skip-worktree:
  `git ls-files -v | grep '^[sS]'` returns nothing, and edits to it show up in `git status` normally.
  Two places still assert otherwise — root `AGENTS.md` → Gotchas and a comment in
  `.github/workflows/server-unit.yml`. Verify the flag before trusting either; the note cost a detour
  when adding a `lint` script. · ref: `AGENTS.md` (Gotchas)

- **2026-09-29** · Decide whether a skill is editable by grepping the ROOT `skills-lock.json` — there
  is no `.claude/skills-lock.json`. Do NOT trust the `AGENTS.md` "Do not touch" list, which still
  names only `engineering-insights` and `onion-architecture` as project-owned: only 6 of the 13
  installed folders are vendored, and `frontend-ui-architecture`, `mermaid-diagram`,
  `react-best-practices`, `react-testing-library` and `security` are unlocked and editable too. The
  lock is not an inventory either — `architecture-patterns` and `github-workflow-automation` are
  locked but have no folder at all. · ref: `skills-lock.json`, `AGENTS.md` (Do not touch)

- **2026-09-30** · A skill with `disable-model-invocation: true` (now `pr-self-review`) cannot be run by the
  agent through the Skill tool, so hook messages must say "ask the user to run `/pr-self-review`", not "run
  /pr-self-review" — otherwise the agent tries, fails and improvises the steps by hand. The gate's deny texts
  use the `CANNOT_INVOKE` wording and `gate.test.mjs` asserts it on all deny paths.
  · ref: `.claude/skills/pr-self-review/scripts/gate.mjs`

- **2026-09-30** · A CI job's log is not readable without auth (`/actions/jobs/<id>/logs` → 403) and `gh`
  is not installed here, but the public API still gives the failing STEP and annotations:
  `curl https://api.github.com/repos/AslanovRustam/dev-digest/actions/jobs/<id>` (steps + conclusions) and
  `/check-runs/<id>/annotations`. Use that to pick what to reproduce locally. · ref: `.github/workflows/`

## Tool & Library Notes

_None yet._
- **2026-09-24** · `gh` CLI is not installed on this dev machine (neither Git Bash nor PowerShell PATH) — to
  open a PR, push the branch and hand over `https://github.com/AslanovRustam/dev-digest/pull/new/<branch>`
  with a ready description, instead of failing on `gh pr create`. · ref: `git remote -v`
- **2026-09-24** · Supersedes 2026-09-24: `origin` is a FORK of `ai-agentic-engineering-neo/dev-digest`, and
  `…/pull/new/<branch>` defaults the PR base to that public course repo (PR #212 landed there by mistake).
  Hand over `https://github.com/AslanovRustam/dev-digest/compare/main...<branch>?expand=1` so the base stays
  in the fork. The studio lists PRs only for repos added in it — a PR on the parent never shows under the
  fork. · ref: `GET https://api.github.com/repos/AslanovRustam/dev-digest` → `parent`
- **2026-09-25** · Many source files are CRLF (e.g. both `vendor/shared/contracts/platform.ts`). A scripted
  `node`/`sed` replace with `\n`-joined anchors reports "anchor missing": normalise `\r\n` first and restore it
  on write, or use the Edit tool. When a quoted bash heredoc feeds a JS template literal, regex escapes like
  `\(` are lost, which silently made a `queryByText(/3 finding\(s\)/)` assertion vacuous — grep the written
  file afterwards. · ref: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`

- **2026-09-29** · Renaming a tracked file while re-creating the old name in the SAME commit destroys
  git's rename detection — it pairs additions only with deletions, so `git mv CLAUDE.md AGENTS.md`
  plus a new `CLAUDE.md` stub is recorded as modify+add and `git log --follow AGENTS.md` returns
  nothing. Commit the pure rename first, the file at the old path second. Check with
  `git diff --cached --stat -M` before committing: it must print `CLAUDE.md => AGENTS.md`.
  · ref: commits `c595b2b` then `6cdea4b`
- **2026-09-29** · Web research: `WebFetch` cannot read `medium.com` posts (HTTP 403 every time) and
  `web.archive.org` is refused outright ("Claude Code is unable to fetch from web.archive.org"); the usual
  mirrors are dead too (`freedium.cfd` → DNS `ENOTFOUND`, `scribe.rip/@user/slug` → 404). So a verbatim quote
  from a Medium-hosted source (e.g. Dan Abramov's 2019 disclaimer on "Presentational and Container
  Components") cannot be verified automatically — cite the search-index extract plus secondary sources and
  mark the quote unverified instead of reconstructing it. Same for talk/slide-format posts such as
  `tkdodo.eu/blog/thinking-in-react-query`: `WebFetch` returns only page chrome, no transcript.
  · ref: `research_notes/Архитектура React и Next js/03-business-logic-hooks-services-domain.md`

- **2026-09-29** · Research subagents inherit this repo's `AGENTS.md`, including the mandate to invoke
  `engineering-insights` — so a web-research agent will append to `INSIGHTS.md` on its own initiative
  and hand back a "one process note for you" about it. Two of five did exactly that. When spawning
  agents for work that should touch no project files, say so explicitly in the prompt, and diff
  `INSIGHTS.md` before committing. · ref: `.claude/skills/engineering-insights/SKILL.md`

- **2026-09-29** · In `sed`, the `s` delimiter also escapes alternation: with `s|...|...|`, a `\|`
  inside the pattern means a literal pipe, NOT BRE alternation, so `s|^## \(A\.\|B\.\)|### \1|`
  silently matches nothing and exits 0. Use a different delimiter (`s@…@…@`) when the pattern needs
  `\|`, or reach for python. Symptom is a rewrite that reports success and changes nothing.

- **2026-09-29** · Second hit of the heredoc-escape trap, now in Python: inside a `python - <<'PY'` heredoc a
  non-raw string turns `\1` into chr(1) and `\|` into a SyntaxWarning, so text written to a .md file
  silently gains control characters that the terminal renders as nothing. Use raw strings, or build
  backslashes via chr(92). Verify afterwards with `cat -A` or a codepoint scan, not by eyeballing.
  · ref: this file, the sed-delimiter entry above

- **2026-10-01** · Piping API JSON into Python on this Windows machine (`curl … | python -c "json.load(sys.stdin)"`) decodes
  stdin as cp1251: non-ASCII text (—, →) is mangled and string lengths differ from the stored value, which looks
  like data corruption but isn't. Prefix `PYTHONIOENCODING=utf8` (or wrap `sys.stdin.buffer` in a utf-8
  `TextIOWrapper`) before comparing API data with files.

## Recurring Errors & Fixes

- **2026-09-23** · **Symptom:** `GET /repos` → 500; logs show `read ECONNRESET`, then `28P01 auth_failed`
  with garbled (cp1251) text, while the Docker container is healthy and logs no connections.
  **Cause:** a local Windows PostgreSQL service (`postgresql-x64-17`) also listens on :5432 and wins the
  port, so the API talks to the wrong server. **Fix:** `Stop-Service postgresql-x64-17` (admin) and
  restart the container — or map the Docker DB to another port and update `DATABASE_URL`.
  · ref: `server/.env` → `DATABASE_URL`

## Session Notes

### 2026-09-29 — built the `frontend-ui-architecture` skill
Project-owned skill covering placement/splitting/naming/import direction only; performance is
explicitly delegated to the vendored `next-best-practices` and `react-best-practices`. Note the
deliberate conflict recorded in its SKILL.md: `react-best-practices` says "Shared utilities go in
`utils/`" and this skill forbids that folder name — placement and naming defer to the new skill,
everything else to the vendored one.

### 2026-09-29 — research notes: React business-logic architecture
Web research only, no code touched; output in `research_notes/Архитектура React и Next js/`.
Fetchable primary sources: react.dev, redux.js.org/style-guide, tanstack.com query docs, tkdodo.eu,
martinfowler.com, kentcdodds.com, alexkondov.com, bespoyasov.me. Blocked: medium.com (403) and every
archive/mirror route to it — see the Tool & Library Notes entry above before planning a quote-exact task.

### 2026-09-29 — CLAUDE.md → AGENTS.md across all packages
Renamed the five memory files and added `@AGENTS.md` stubs, in two commits so `git log --follow`
still traces the history. Cross-references updated in the root memory, `client/AGENTS.md`,
`.claude/skills/engineering-insights/SKILL.md` and `e2e/INSIGHTS.md`; the untracked, dangling
`.claude/CLAUDE.md` (`@Agents.md` → no such file) was deleted. `.claude/skills/zod/AGENTS.md` is an
unrelated vendored skill asset and was left alone.

## Open Questions

- **2026-09-29** · Is `server/package.json` still skip-worktree? Root `AGENTS.md` and the comments in
  `.github/workflows/server-unit.yml` both say it is (which is why CI inlines `pnpm exec vitest` / `eslint`
  instead of using scripts), but `git ls-files -v package.json` returns `H`, not `S`, in this working tree.
  If the flag is gone for everyone, the CI steps can call the package scripts directly and the AGENTS.md
  gotcha should be dropped. Check on a fresh clone before changing either. · ref: `.github/workflows/server-unit.yml`

_None yet._

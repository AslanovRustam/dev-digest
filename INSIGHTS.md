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

## Codebase Patterns

- **2026-09-29** · Agent instructions live in `AGENTS.md`; the `CLAUDE.md` beside it is a one-line
  `@AGENTS.md` import stub — edit `AGENTS.md`, never the stub. Both are committed in all five places
  (root, `server/`, `client/`, `reviewer-core/`, `e2e/`). A real symlink was rejected: this repo has
  `core.symlinks=false`, so on any Windows clone without Developer Mode a committed symlink checks out
  as a text file whose only content is `AGENTS.md`, and Claude Code reads THAT as the instructions
  while the real `AGENTS.md` never loads (`CLAUDE.md` wins precedence over `AGENTS.md`).
  · ref: `AGENTS.md:10`

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

## Recurring Errors & Fixes

- **2026-09-23** · **Symptom:** `GET /repos` → 500; logs show `read ECONNRESET`, then `28P01 auth_failed`
  with garbled (cp1251) text, while the Docker container is healthy and logs no connections.
  **Cause:** a local Windows PostgreSQL service (`postgresql-x64-17`) also listens on :5432 and wins the
  port, so the API talks to the wrong server. **Fix:** `Stop-Service postgresql-x64-17` (admin) and
  restart the container — or map the Docker DB to another port and update `DATABASE_URL`.
  · ref: `server/.env` → `DATABASE_URL`

## Session Notes

### 2026-09-29 — CLAUDE.md → AGENTS.md across all packages
Renamed the five memory files and added `@AGENTS.md` stubs, in two commits so `git log --follow`
still traces the history. Cross-references updated in the root memory, `client/AGENTS.md`,
`.claude/skills/engineering-insights/SKILL.md` and `e2e/INSIGHTS.md`; the untracked, dangling
`.claude/CLAUDE.md` (`@Agents.md` → no such file) was deleted. `.claude/skills/zod/AGENTS.md` is an
unrelated vendored skill asset and was left alone.

## Open Questions

_None yet._

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

_None yet._

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

## Recurring Errors & Fixes

- **2026-09-23** · **Symptom:** `GET /repos` → 500; logs show `read ECONNRESET`, then `28P01 auth_failed`
  with garbled (cp1251) text, while the Docker container is healthy and logs no connections.
  **Cause:** a local Windows PostgreSQL service (`postgresql-x64-17`) also listens on :5432 and wins the
  port, so the API talks to the wrong server. **Fix:** `Stop-Service postgresql-x64-17` (admin) and
  restart the container — or map the Docker DB to another port and update `DATABASE_URL`.
  · ref: `server/.env` → `DATABASE_URL`

## Session Notes

_None yet._

## Open Questions

_None yet._

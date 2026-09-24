---
name: engineering-insights
description: Captures non-obvious engineering lessons into the INSIGHTS.md of the module the work touched (server, repo-intel, client, reviewer-core, e2e, or the repo root). Use proactively whenever a session uncovers a root cause, a dead end or failed approach, a dependency or tool quirk, a codebase convention or architectural decision, a recurring error and its fix, or an unresolved question; at the end of every task; when the Stop hook requests an insights check; or when the user says "remember this", "add to insights", "lessons learned" or "wrap up".
---

# Engineering insights

1. Review the work since the last check against the 7 sections below.
2. Keep only candidates that pass EVERY gate check. If none pass, reply `Insights: nothing new` and stop.
3. Route each insight to one file — the most specific path wins.
4. Grep that file and the module's `CLAUDE.md`. Already there → skip. Contradicts an existing
   entry → write a new entry starting with `Supersedes YYYY-MM-DD:`.
5. Append under the right section. NEVER edit or delete existing lines (append-only).
6. Same trap already in Recurring Errors & Fixes (second hit) → propose a line for that
   package's `CLAUDE.md` → Gotchas.
7. Report in one line: `Insights: +N → <file> (<section>)`.

## Routing

| Paths touched                                                         | File                                        |
|-----------------------------------------------------------------------|---------------------------------------------|
| `server/src/modules/repo-intel/**`                                    | `server/src/modules/repo-intel/INSIGHTS.md` |
| `server/**`                                                           | `server/INSIGHTS.md`                        |
| `client/**`                                                           | `client/INSIGHTS.md`                        |
| `reviewer-core/**`                                                    | `reviewer-core/INSIGHTS.md`                 |
| `e2e/**`                                                              | `e2e/INSIGHTS.md`                           |
| `scripts/**`, `.github/**`, Docker, both `shared` copies, cross-package | `INSIGHTS.md` (root)                      |

## Sections (fixed order)

- **What Works** — approaches and solutions that worked here.
- **What Doesn't Work** — dead ends and antipatterns, with the reason. Most often skipped, most valuable.
- **Codebase Patterns** — conventions and architectural decisions, with the why.
- **Tool & Library Notes** — dependency, CLI and OS quirks.
- **Recurring Errors & Fixes** — symptom → cause → fix.
- **Session Notes** — `### YYYY-MM-DD — <task>` + 1–3 lines; only when this session also added an entry.
- **Open Questions** — unresolved or unverified, and where to look.

## Gate (all must pass)

- Actionable cold: an agent with zero context knows exactly what to do or avoid.
- Not obvious to anyone who reads the code; not general programming knowledge.
- Saves 5+ minutes next time; not a one-off.
- Concrete: names the file, function, command or version.
- Verified, not a guess. A guess goes to Open Questions.

## Entry format

```
- **YYYY-MM-DD** · <imperative lesson with concrete names> — why: <cause> · ref: `path/to/file.ts:42`
```

Recurring Errors & Fixes:

```
- **YYYY-MM-DD** · **Symptom:** … **Cause:** … **Fix:** … · ref: `path`
```

## Examples

- Bad: "Promises can be tricky." — noise, not a lesson.
- Bad: "Be careful with async."
- Good: "`Promise.all()` on the ingest pipeline times out after 30 items — in this module use
  `Promise.allSettled()` in batches of 10."
- Good: "CLI entrypoints: compare `import.meta.url === pathToFileURL(process.argv[1]).href` — a raw
  `file://` string never matches on Windows, so migrate/seed exit 0 and do nothing.
  ref: `server/src/db/migrate.ts`"

# DevDigest — what the dependency facts mean here

Read this when the repository is DevDigest. Everything below is a rule for **interpreting** the facts,
not an instruction to change anything.

## Packages and managers

| Package | Manager | Role |
|---------|---------|------|
| `server/` | pnpm | Fastify API; owns the `shared` contracts (`src/vendor/shared`) |
| `client/` | pnpm | Next.js studio; has its OWN copy of `shared` and `ui` under `src/vendor/` |
| `evals/` | pnpm | eval harness (test-like code: vitest, gray-matter in `src` is by design) |
| `reviewer-core/` | npm | pure engine, consumed as raw TS source through tsconfig `paths` |
| `mcp/` | npm | opt-in MCP server; talks to the API over HTTP, imports nothing from the others |
| `e2e/` | npm | browser flows; the whole package is test code |

There is no workspace and no shared `node_modules`. A package outside this table is a new package —
include it, and say it is not covered here.

## Internal links (what the graph's solid arrows should be)

- `@devdigest/shared` → `server/src/vendor/shared`. `reviewer-core` reaches it through `../server`;
  `client` has a **separate copy** that is documented as already diverged, so `[copy-diverged]` for
  `@devdigest/shared` is expected: report it P1, list the changed files, and escalate to P0 only if a
  changed file is a contract both sides exchange (the root `AGENTS.md` rule: a contract change is applied
  to both copies).
- `@devdigest/reviewer-core` → `reviewer-core/src` is the supported entry for `server`. A **relative**
  import into `reviewer-core/` or `server/` from another package bypasses it: P0 in production code.
  `reviewer-core/test/*` importing `../../server/src/adapters/mocks.js` is the same bypass in tests only:
  P2, and say it is known.
- `mcp/` has no internal edges by design. Its own lenient Zod shapes (`mcp/src/contracts.ts`) mean a
  different `zod` major there does not break the `shared` contract the way it would in `server`,
  `client` or `reviewer-core` — still report it, usually P2.
- `[alias-pin]` in `reviewer-core` (`zod` → `./node_modules/zod`) makes code reached through `../server`
  resolve one `zod` copy. It looks intentional; check `git log -S` on `reviewer-core/tsconfig.json` before
  proposing to remove it.

## Reading the numbers

- `client/` and `server/` are pnpm: their `node_modules` totals (GBs) are dominated by transitive
  packages and the `.pnpm` store. Sizes in the tables are the dependency's own files; do not compare the
  two kinds of number.
- `server/package.json` is `skip-worktree`: the local manifest differs from the committed one. The facts
  describe the **local** manifest — say so in Scope when `server` is analyzed.
- The facts are about the working tree, not the PR diff. For "what did this branch change" use
  `git diff <base> -- '*/package.json'` first, then run the check.

## Do not propose

- Editing anything under `.claude/skills/**` that is vendored (see `skills-lock.json`).
- `docker compose down -v` or any `node_modules` deletion as a "cleanup" — a reinstall is the user's call.
- A move to a workspace/monorepo layout as a fix for drift: the course repo is deliberately five
  independent packages. Propose aligning versions instead.

## Where a lasting finding goes

A cross-package finding (drift policy, a boundary rule, a tool quirk) → root `INSIGHTS.md` via the
`engineering-insights` skill. A single-package finding → that package's `INSIGHTS.md`.

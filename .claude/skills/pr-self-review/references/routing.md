# Routing: which skill reviews which file

The machine copy of this table lives in `scripts/collect.mjs` (`ROUTES`). **Change both.**

A file goes to a skill when it matches one of the skill's globs, **or** when one of its
*added* lines matches the skill's content pattern (within `scope`). `exclude` always wins.

| Skill | Globs | Also when an added line matches |
|---|---|---|
| `onion-architecture` | `server/src/**`, `reviewer-core/src/**` | — |
| `fastify-best-practices` | `server/src/modules/**/routes.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/platform/**` | — |
| `drizzle-orm-patterns` | `server/src/db/**`, `**/repository.ts`, `**/*.repo.ts` — minus `server/src/db/migrations/**` | — |
| `postgresql-table-design` | `server/src/db/schema/**`, `server/src/db/migrations/**` | — |
| `frontend-ui-architecture` | `client/src/**` — minus `client/src/vendor/**` | — |
| `next-best-practices` | `client/src/app/**`, `client/next.config.*` | — |
| `react-best-practices` | `client/src/**/*.tsx`, `client/src/lib/hooks/**` | — |
| `react-testing-library` | `client/src/**/*.test.tsx` | — |
| `zod` | `**/vendor/shared/contracts/**` | `z.` usage in a code file |
| `security` | `server/src/modules/**/routes.ts`, `server/src/adapters/**`, `server/src/platform/config*` | `process.env`, `exec*(`, `spawn(`, `fs.*`, `fetch(` |
| `typescript-expert` | `**/*.d.ts`, `**/tsconfig*.json` | `infer T`, `as unknown as`, `<T extends …>` |

`security` and `typescript-expert` also exclude test files — their own guides say findings in
tests are noise.

## Never routed

`**/*.md`, `**/*.mdc`, `.github/workflows/**`, `specs/**`, `.claude/**`, `**/messages/**/*.json`.

These still pass through the deterministic invariants; they are simply not worth an LLM pass.
`.claude/**` is excluded so the skill does not review itself — the dangerous case there
(editing a vendored skill) is `INV-VENDORED-SKILL`.

## Noise, never reviewed at all

`server/package.json` (the local variant permanently diverges from the committed one),
`**/pnpm-lock.yaml`, `**/package-lock.json`, `**/yarn.lock`. Binary files and files with more
than 2000 changed lines are recorded as `oversized` and skipped.

## Precedence — read this before combining two frontend skills

`frontend-ui-architecture` and `react-best-practices` **disagree by design**:

- **Placement, naming, folder structure, barrels, import direction** → `frontend-ui-architecture`
  wins. It forbids `utils/` / `helpers/` / `common/` folder names; `react-best-practices` suggests
  `utils/`. Do not report the conflict as a finding.
- **Hooks, state, rendering, memoization** → `react-best-practices` wins.

Quote this clause in the prompt of both subagents. Without it they emit contradictory findings
and the author cannot satisfy either.

## Cost controls

- `typescript-expert` is conditional on purpose — type-level review is expensive and rarely the
  point of a PR.
- Subagents run in batches of 4.
- A skill whose files are all cache hits does not get a subagent at all.

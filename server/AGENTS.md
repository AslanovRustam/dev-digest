# server — `@devdigest/api` (Fastify API + Postgres)

Imports repos and PRs, indexes repos with `repo-intel`, stores agents, runs reviews through
`reviewer-core` and streams progress over SSE.

## Before answering
- Find the owning module in `src/modules/<name>/` and read its `routes.ts` → `service.ts` first.
- Editing grounding / prompt assembly / structured output? The real code is in `reviewer-core/`
  — `src/platform/{grounding,prompt,structured}.ts` are re-export shims only.
- Touching the schema? Plan: edit `src/db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`.
- Check `INSIGHTS.md` in this folder for known traps.

## Stack
Fastify 5 · Drizzle ORM 0.38 + `postgres` driver · Postgres 16 + pgvector · Zod 3 via
`fastify-type-provider-zod` · vitest 2 + testcontainers · tsx (dev, no build step in dev).

## Commands (pnpm)
- Dev: `pnpm dev` (:3001) · Typecheck: `pnpm typecheck`
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker): `pnpm exec vitest run .it.test` · Both: `pnpm test`
- DB: `pnpm db:migrate` · `pnpm db:seed` (idempotent) · `pnpm db:generate`

## Map
- `src/app.ts` — plugins, error handler, module registration · `src/server.ts` — entrypoint
- `src/modules/<name>/` — feature = `routes` · `service` · `repository` · `helpers` · `constants`
- `src/modules/index.ts` — static module registry
- `src/platform/` — DI container, config, errors, jobs, SSE `RunBus`, run logger
- `src/adapters/` — ports impl: llm · github · git · astgrep · depgraph · tokenizer · secrets; `mocks.ts`
- `src/db/schema/` — Drizzle tables by domain · `src/db/migrations/` — generated SQL
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (also used by reviewer-core)
- `src/prompts/*.md` — prompt templates, loaded via `platform/prompts.ts`

## Conventions (non-default)
- New module: create `modules/<name>/routes.ts` + ONE import/entry in `modules/index.ts` (no autoload).
- Validate via the route `schema: { params, body }` — never `Schema.parse(req.body)` in a handler.
- Services receive the `Container`; get adapters from it (`container.llm(...)`, `container.git`),
  never `new` an adapter inside a service. Throw `AppError` / `NotFoundError` from `platform/errors`.
- Services hold no SQL — persistence goes through the module's `repository`.
- Tests: mock via `src/adapters/mocks.ts` or `ContainerOverrides`; a test importing
  `test/helpers/pg.ts` MUST be named `*.it.test.ts`.
- Expensive routes get a per-route rate limit; SSE and `/health*` are exempt.

## Gotchas
- A review runs fire-and-forget: the route returns `runId`s, work continues in `ReviewRunExecutor`.
- `RunBus` (SSE) and `JobRunner` are in-memory — one API instance per DB; stale `running`
  runs are reaped on boot.
- Two zod instances (server vs reviewer-core) → `instanceof ZodError` can fail; match by shape.
- CLI entrypoints: compare `import.meta.url === pathToFileURL(process.argv[1]).href`
  (a raw `file://` string never matches on Windows).
- Secrets live in `~/.devdigest/secrets.json` with env fallback — never in DB or config.
  After changing one call `container.invalidateSecretCaches()`.
- A compiled build must copy `src/prompts` → `dist/prompts`.

## Do not touch
- `src/db/migrations/**` (incl. `meta/`) — generated. `clones/` — runtime checkouts.

## Docs
| Doc | Use when |
|-----|----------|
| `README.md` | need the request/DI flow, API map, env vars, or how review context is assembled |
| `src/modules/repo-intel/README.md` | working on indexing, repo map, file rank, or callers |
| `docs/` | need deeper design notes / ADRs for a server subsystem |
| `specs/` | implementing a server feature that has a spec |
| `INSIGHTS.md` | something fails unexpectedly; entries are added via the `engineering-insights` skill |
| `src/modules/repo-intel/INSIGHTS.md` | known traps in indexing / repo map / file rank / callers |
| `../TESTING.md` | deciding unit vs integration, or why a CI lane ran |

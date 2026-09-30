---
name: onion-architecture
description: Use when writing, moving or reviewing backend code in `server/` or `reviewer-core/` — adding a route, a DB query, a service method, a business rule, a background job, a new external service or a cross-module call; when deciding which file something belongs in; when `pnpm arch` or `test/architecture.test.ts` fails; or when a module has no `service.ts` / `repository.ts` and you are about to follow its example.
---

# Onion architecture (server, reviewer-core)

Dependencies point inward. An outer ring may import an inner one; an inner ring
may never import an outer one.

**Three modules still violate these rules. They are debt, not the convention —
`.dependency-cruiser-known-violations.json` lists every one.** Never copy
`polling`, `settings` or `workspace`. Copy `repos`, or `pulls` (migrated out of
that set; `references/migration.md` is how).

## 1. Where does it go?

| Task | Ring | File | Rule |
|---|---|---|---|
| HTTP endpoint | 4 | `modules/<m>/routes.ts` + one entry in `modules/index.ts` | Declare `schema: { params, body }`. Never `Schema.parse(req.body)`. Body = `getContext` → `service.x()` → status code. |
| DB query | 3 | `modules/<m>/repository.ts` (or `repository/<aggregate>.repo.ts`) | Takes `Db`, never `Container`. Scope every query by `workspaceId`. Returns rows, not DTOs. |
| Business rule, derivation, roll-up | 0 | pure file beside `service.ts` — `helpers.ts` or a named one like `cost.ts` | Only `@devdigest/shared`, `zod`, `platform/errors`, `db/rows` types, sibling domain files. **Add a `test/<m>-<file>.test.ts`** — cheapest test in the repo. |
| Orchestration (fetch → decide → persist → emit) | 2 | `modules/<m>/service.ts` | Takes `Container`. No SQL, no `fastify`, no `new XAdapter()`. Throw `AppError`/`NotFoundError`. |
| Call GitHub / git / LLM / embeddings | 2 uses 1 | `await container.github()` · `container.git` · `await container.llm(id)` | Method missing on the port? Add it to `vendor/shared/adapters.ts` → implement in `adapters/` → mock in `adapters/mocks.ts`. In that order. |
| New external service | 1→3→4 | port → `adapters/<svc>/<client>.ts` → `mocks.ts` → lazy getter + `ContainerOverrides` in `platform/container.ts` → key via `SecretsProvider` | Never import the SDK outside `adapters/**`. Never read `process.env` for a key. |
| DB table / column | 3 | `db/schema/<domain>.ts` → `pnpm db:generate` → `pnpm db:migrate` | Read by >1 module? Add the row type to `db/rows.ts`. Never hand-edit `db/migrations/**`. |
| Row type across modules | 3 | `import type { XRow } from '../../db/rows.js'` | A type-only import of the schema is legal; a value import is not. |
| Data owned by another module | — | `container.reviewRepo` · `container.agentsRepo` · `container.repoIntel`, or a `@devdigest/shared` contract | Never `import { OtherService } from '../other/service.js'`. Only their `constants.ts` / `types.ts` may be imported directly. |
| Background job | 2 | `container.jobs.register(KIND, …)` in `service.ts`, kind literal in `constants.ts` | Across modules: enqueue, don't call. |
| Progress to the UI | 2 | `container.runBus` | In-memory — one API instance per DB. |
| Prompt assembly, grounding, structured output, reduce | 0 | `reviewer-core/src/**` | `platform/{grounding,prompt,structured}.ts` are re-export shims; editing them is almost always wrong. Nothing may be added to reviewer-core's `dependencies`. |
| Shared request/response contract | 0 | `vendor/shared/contracts/<area>.ts` | Zod only, and `client/src/vendor/shared` is a **separate diverged copy** — edit both deliberately. |
| Cross-cutting error type | 2 | `platform/errors.ts` | Subclass `AppError`; `app.ts` maps it automatically. |
| Plugin / global hook | 4 | `app.ts` | The error handler stays registered **before** the module loop. |

## 2. Rings

| Ring | Paths | May import |
|---|---|---|
| 0 domain | `reviewer-core/src/**` · `vendor/shared/contracts/**` · `<m>/{helpers,constants}.ts` · `pulls/{cost,findings,status}.ts` | shared, zod, reviewer-core, `platform/errors`, `db/rows` types, siblings |
| 1 ports | `vendor/shared/adapters.ts` · `repo-intel/types.ts` | ring 0 |
| 2 application | `<m>/service.ts` · `reviews/{run-executor,diff-loader}.ts` · `repo-intel/pipeline/**` · `platform/{jobs,sse,errors,run-logger}.ts` | rings 0–1, own repository |
| 3 infrastructure | `adapters/**` · `db/**` · `<m>/repository.ts` | rings 0–1 |
| 4 transport + composition root | `<m>/routes.ts` · `modules/index.ts` · `_shared/**` · `app.ts` · `platform/container.ts` | everything |

`repository.ts` is ring 3 but lives inside the module folder: this is
vertical-slice-with-onion-rules, not a folder onion. That is correct here.

## 3. Check yourself

Before writing a file: **does this file's ring allow importing what I am about to
import?** Then `cd server && pnpm arch`.

- `pnpm arch` — ring rules, baseline-aware · `pnpm arch:strict` — including the debt
- `pnpm arch:baseline` — regenerate the ledger **after** migrating a module; the diff is the proof
- `server/test/architecture.test.ts` runs the same config in the unit lane

A PR that **adds** a line to `.dependency-cruiser-known-violations.json` is rejected.
The ledger only shrinks.

## 4. Rationalizations

| Excuse | Reality |
|---|---|
| "This module has no service/repository — a thin route talking to `container.db` is its convention." | That is the debt ledger, verbatim — an agent said exactly this before the rules existed. Extract a repository (`references/migration.md`) or put the endpoint in a module that already has one. |
| "It's just one query in the handler." | That is how every one of the recorded violations got there. |
| "The service needs `app.log`." | Ring 2 cannot see Fastify. Pass a `log` callback, or use `platform/run-logger.ts`. Do not smuggle `FastifyBaseLogger` in as a type. |
| "Easier to import the other module's service." | `container.<x>Repo` or a `@devdigest/shared` contract. Sibling modules stay independent. |
| "I need the row shape, so I'll import the schema." | `import type { XRow } from '../../db/rows.js'`. Add the alias there if missing. |
| "I'll add it to the baseline." | The baseline is frozen history, not an allowlist. |
| "Onion is overkill for this one endpoint." | The rules cost one import decision. The endpoint costs a migration later. |

## 5. Red flags — stop

- `import * as t from '../../db/schema.js'` in anything but a repository
- `drizzle-orm` imported in a `routes.ts`
- `new OctokitGitHubClient(...)` / `new OpenAIProvider(...)` outside `platform/container.ts`
- an SDK (`octokit`, `simple-git`, `openai`, `@anthropic-ai/sdk`) imported outside `adapters/**`
- `Schema.parse(req.body)` in a handler
- a new entry appearing in `.dependency-cruiser-known-violations.json`

## 6. Do not "fix" these

`reviewer-core` is already ideal ring 0 — leave it alone, and never add a
dependency. Do not introduce a `domain/` folder: flat pure files are the
convention. Do not convert `Container` to constructor injection — it hands out
port interfaces and `ContainerOverrides` is the working test seam. `repo-intel`
is not a normal module. `graphology` and `postgres` are deliberately not treated
as I/O SDKs. `app.ts` may run `db.execute` for `/health/ready`.

## References

- `references/rules.md` — the 13 rules with real Bad/Good from this codebase
- `references/migration.md` — route-only module → routes/service/repository
- `references/sources.md` — the articles these rules come from

# The 13 ring rules

Each rule is enforced by `server/.dependency-cruiser.cjs` under the name given.
When `pnpm arch` fires, look the name up here.

`server/src/modules/repos/` is the reference implementation of all of them.

---

## R1 · `ring4-routes-no-persistence`

`modules/*/routes.ts` may not import `drizzle-orm` or `src/db/**`.

**Bad** — `modules/pulls/routes.ts`, as it was before its migration:

```ts
const { workspaceId } = await getContext(container, req);
const [repo] = await container.db
  .select()
  .from(t.repos)
  .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
if (!repo) throw new NotFoundError('Repo not found');
```

**Good** — `modules/repos/routes.ts`:

```ts
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  const { repo, created } = await service.add(workspaceId, userId, req.body.url);
  reply.status(created ? 201 : 200);
  return repo;
});
```

The handler does three things: resolve the caller, call the service, map the
status code. Nothing else.

---

## R2 · `ring2-no-http`

Nothing under `modules/<m>/` except `routes.ts` and `_shared/` may import
`fastify`, `@fastify/*`, `fastify-type-provider-zod` or `fastify-sse-v2`.

This is the rule most likely to bite during a migration, because route handlers
call `app.log.warn(...)` and the logger is Fastify's.

**Bad** — moving this into a service verbatim:

```ts
} catch (err) {
  app.log.warn({ err }, 'GitHub client unavailable; serving persisted PRs');
}
```

**Good** — the service takes the logging it needs as a parameter:

```ts
async list(workspaceId: string, repoId: string, log: (e: unknown, msg: string) => void) { … }
```

or uses `platform/run-logger.ts`. Do **not** smuggle `FastifyBaseLogger` in as a
type import to satisfy the rule — that defeats it.

---

## R3 · `io-sdks-only-in-adapters`

`octokit`, `simple-git`, `openai`, `@anthropic-ai/sdk`, `@ast-grep/napi`,
`@vscode/ripgrep`, `js-tiktoken` and `dependency-cruiser` may only be imported
from `src/adapters/**` (plus `platform/container.ts`, which constructs them).

Deliberately **not** on the list: `postgres` (the driver belongs to
`db/client.ts`, and `db/` *is* infrastructure) and `graphology` (a pure in-memory
graph library with no I/O, used by `repo-intel/pipeline/rank.ts`). Adding them
would produce false positives and teach you the rule is noise.

The order for a new capability is always: **port → adapter → mock**.

```
1. src/vendor/shared/adapters.ts   add the method to the interface
2. src/adapters/<svc>/<client>.ts  implement it
3. src/adapters/mocks.ts           make the mock satisfy the interface again
```

---

## R4 · `no-concrete-adapters-outside-composition`

Only `platform/container.ts`, `app.ts` and `adapters/**` may import a concrete
adapter class (`github/octokit.ts`, `git/simple-git.ts`, `llm/{openai,anthropic}.ts`,
`embedder/openai.ts`, `codeindex/ripgrep.ts`, `secrets/local.ts`, `auth/local.ts`).

Scoped to those *client* files on purpose: `adapters/astgrep/index.ts`,
`adapters/codeindex/extract.ts`, `adapters/git/diff-parser.ts` and
`adapters/llm/pricing.ts` are pure functions, and inner rings may use them.

**Bad**

```ts
const gh = new OctokitGitHubClient(token);
```

**Good**

```ts
const gh = await this.container.github();
```

This indirection is the entire reason `ContainerOverrides` works — every
integration test swaps real adapters for `src/adapters/mocks.ts` through it.

---

## R5 · `db-is-a-leaf`

`src/db/**` may not import `src/modules/**`, `src/platform/**` or `src/adapters/**`.
The schema, the client and the row types are the bottom of the tree.

---

## R6 · `sql-only-in-repository`

A **value** import of `drizzle-orm` or `src/db/schema` is allowed only in
`*/repository.ts`, `*/repository/**`, `src/db/**`, `platform/jobs.ts`,
`src/adapters/**` and `app.ts` (which runs `db.execute(sql\`select 1\`)` for
`/health/ready`).

A **type-only** import is always allowed — that carve-out is what makes the rule
checkable at all, and it is why `tsPreCompilationDeps: true` is set.

**Bad** — needs a row shape, imports the schema as a value:

```ts
import * as t from '../../db/schema.js';
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo { … }
```

**Good**

```ts
import type { RepoRow } from '../../db/rows.js';
export function toRepoDto(row: RepoRow): Repo { … }
```

`src/db/rows.ts` exists precisely for this — its own comment says the aliases live
there *"so cross-cutting consumers can reference a row shape WITHOUT importing
another module's data layer"*. If the alias you need is missing, add it there.

---

## R7 · `adapters-are-leaves`

`src/adapters/**` may not import `src/modules/**`.

Two violations are in the baseline: `adapters/astgrep/index.ts` and
`adapters/depgraph/index.ts` both import `modules/repo-intel/constants.ts`. The
fix is to move the shared constants down into `adapters/` or `platform/` — but
`SUPPORTED_EXT` has six consumers inside `repo-intel`, so it is a deliberate
decision, not a drive-by. Left as recorded debt.

---

## R8 · `platform-no-modules`

`src/platform/**` may not import `src/modules/**` — except `container.ts`, which
is the composition root and constructs `AgentsRepository`, `ReviewRepository` and
`RepoIntelService` on purpose, so consumers use `container.agentsRepo` rather than
reaching into another module's folder.

---

## R9 · `no-cross-module-imports`

`modules/<a>/**` may not import `modules/<b>/**`. Exceptions: `_shared/**`, and
another module's `constants.ts` / `types.ts` (ring 0/1 — data, not behaviour).

For behaviour, go through the container:

```ts
this.agents = container.agentsRepo;
```

Modules are vertical slices so a feature can be read — or deleted — on its own.

---

## R10 · `shared-contracts-are-pure`

`src/vendor/shared/**` may import nothing but itself and `zod`. `reviewer-core`
compiles against these same files through a tsconfig `paths` back-reference, so
anything that leaks in here lands in ring 0 of the engine too.

Remember `client/src/vendor/shared` is a **separate, already-diverged copy**. A
contract change must be applied to both, deliberately.

---

## R11 · `reviewer-core-via-public-entry`

`server/src/**` may import `../reviewer-core/src/index.ts` and nothing deeper.
`index.ts` is the engine's public API; a deep import makes that meaningless.

`platform/{grounding,prompt,structured}.ts` are pure re-export shims so older
importers still resolve. Editing them is almost always the wrong move — the real
code is in `reviewer-core/`.

---

## R12 · `domain-files-are-pure`

`modules/<m>/{helpers,constants}.ts` and `modules/pulls/{cost,findings,status}.ts`
may import only `@devdigest/shared`, `zod`, `@devdigest/reviewer-core`,
`platform/errors.ts`, type aliases from `db/rows.ts`, and sibling domain files.

`modules/reviews/findings.ts` is **not** on the list: it takes a `ReviewRepository`
and orchestrates, so it is ring 2 living under a ring-0-looking name. The rule
lists files explicitly rather than by glob for exactly this reason — be honest
about which files are actually pure.

`modules/pulls/{cost,findings,status}.ts` are the model to copy: pure functions,
`@devdigest/shared` types only, one dedicated unit test each
(`test/pulls-cost.test.ts`, `pulls-findings.test.ts`, `pulls-status.test.ts`),
no Docker.

---

## R13 · `no-circular`

No dependency cycles — a cycle means a ring boundary was crossed both ways.

Cycles running through `platform/container.ts` are exempt (`viaNot`): the
composition root knows every module by construction, and every service takes the
`Container` type back. That is the design, not a defect.

Watch out for the *type-only* cycle: `helpers.ts` importing a row type from
`repository.ts` while `repository.ts` imports a function from `helpers.ts` reads
as a cycle. Fix it by taking the row type from `db/rows.ts`.

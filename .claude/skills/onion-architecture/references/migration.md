# Migrating a route-only module

Three modules still put their SQL in the route handler: `polling`, `settings` and
`workspace`. Their violations — and only theirs — are recorded in
`server/.dependency-cruiser-known-violations.json`.

`pulls` was in that set and is not any more: it was migrated as the worked
example, so it has a `service.ts` + `repository.ts` and no ledger entry. Build on
it; do not treat it as debt.

`pulls` went from a 357-line `routes.ts` with ~14 inline Drizzle statements to
`routes.ts` (59 lines) + `service.ts` + `repository.ts` + `constants.ts`, with
zero test edits. This is that recipe.

---

## Step 0 — pin the behaviour

Run the module's existing tests and record green. For `pulls` that was:

```bash
pnpm exec vitest run test/pulls-cost.test.ts test/pulls-findings.test.ts \
  test/pulls-status.test.ts test/routes-smoke.test.ts
pnpm exec vitest run pulls-comments.it.test          # needs Docker
```

These are the safety net: the pure unit tests pin the domain ring, the
integration test pins the endpoints end to end through `MockGitHubClient`.

## Step 1 — `repository.ts`

Move the Drizzle statements **verbatim**, one method per statement. Do not
"improve" a query while moving it — read shapes, ordering and the
`onConflictDoUpdate` target are load-bearing.

```ts
export class PullsRepository {
  constructor(private db: Db) {}   // ← takes Db, NEVER Container
```

Copy `modules/repos/repository.ts`, including its doc-comment convention ("the
ONLY place that touches the `X` table"). Scope every entry point by
`workspaceId`, or take a row that was already scoped that way.

**Row types come from `db/rows.ts`**, not from the schema:

```ts
import type { PrCommitRow, PrFileRow, PullRow, RepoRow } from '../../db/rows.js';
```

Add the alias there if it is missing. A value import of `db/schema` outside a
repository trips R6.

**Do not invent a row type a domain file already owns.** `pulls/cost.ts` exports
`RunCostRow`; the repository imports it rather than declaring a near-identical
one. Ring 3 importing ring 0 is correct, and it is how the two stay in sync — a
hand-written duplicate here failed `pnpm typecheck` on `costUsd: string` vs
`number` and on a nullable `status`.

**Deconfliction:** another module may already read the same tables.
`modules/reviews/repository/pull.repo.ts` owns `getPull` / `getRepo` /
`getPrFiles`, surfaced as `container.reviewRepo`. Do **not** merge or delete it
during the migration — it is reached through the Container, the sanctioned
cross-module path (R9). Duplicating two read queries is the right price; record
merging them as a follow-up.

## Step 2 — `service.ts`

```ts
export class PullsService {
  private repo: PullsRepository;
  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }
```

Move the orchestration: the local-first sync, the degradation branches, the
roll-up assembly, the shared `resolvePrAndRepo` lookup. Literals move to
`constants.ts` (`BACKFILL_LIMIT` in this case).

**The logger is the trap.** Route handlers call `app.log.warn(...)` — Fastify's
logger, which ring 2 may not see (R2). `pulls/routes.ts` had six such calls.
Pass a callback:

```ts
// service.ts
export type WarnFn = (meta: Record<string, unknown>, msg: string) => void;

// routes.ts
const warn: WarnFn = (meta, msg) => app.log.warn(meta, msg);
```

Do **not** import `FastifyBaseLogger` as a type to shut the rule up — that keeps
the coupling and only hides it.

**Keep the degradation semantics exactly.** The `try { gh = await
container.github() } catch` branches are business policy — "the PR list must
still render with no GitHub token" — so they belong in the service, with the
same catch boundaries. Getting this subtly wrong is the one way this migration
can break something a type-check will not catch.

## Step 3 — thin the routes

Target the shape of `repos/routes.ts`: resolve the caller, call the service, map
the status code.

```ts
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listForRepo(workspaceId, req.params.id, warn);
});
```

Leave the `schema: { params, body }` declarations exactly as they are.

## Step 4 — verify, in this order

1. `pnpm typecheck`
2. `pnpm exec vitest run test/<module>-*.test.ts` — the pure domain tests must be
   **untouched and green**. If you had to edit one, you changed the domain ring:
   revert and try again.
3. `pnpm exec vitest run --exclude '**/*.it.test.ts'` — `routes-smoke.test.ts`
   proves `buildApp` still wires.
4. `pnpm exec vitest run <module>.it.test` — the real end-to-end proof.
5. `pnpm exec eslint .`
6. `pnpm arch:strict` — the module's violations should be gone.
7. `pnpm arch:baseline`, then `git diff` the ledger and update `BASELINE_SIZE` in
   `test/architecture.test.ts`.

**That diff is the migration's completion certificate:** entries for the module
disappear, nothing new appears. For `pulls` it went 20 → 16.

## Step 5 — what you can now do that you could not before

Because the logic left the route, the module becomes unit-testable with
`ContainerOverrides` and `MockGitHubClient` — no Docker:

```ts
const service = new PullsService(new Container(config, db, { github: new MockGitHubClient(...) }));
```

That is the argument for doing this at all. Add such a test when the module has
branching worth pinning.

## Remaining modules, easiest first

| Module | `routes.ts` | Notes |
|---|---|---|
| `workspace` | ~34 lines | trivial, start here |
| `polling` | ~68 lines | one sync loop |
| `settings` | ~98 lines | also `feature-models.ts`, which holds SQL of its own |

Order by ascending size so the ledger shrinks early and often.

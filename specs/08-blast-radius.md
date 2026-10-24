# Blast radius

**Status:** approved (lesson L05). This spec is the source of truth for scope.

## Context

A reviewer sees the diff but not what else in the repo the change can hit. **Blast radius** shows, for a pull request:

1. the symbols declared in its changed files;
2. who calls those symbols (`file:line`);
3. the HTTP endpoints and crons that depend on those callers.

The data is **already computed** by `repo-intel` when the repo is indexed. The feature does not re-analyze the repo and
does not call a model: it reads the precomputed index and presents it. It ships in two places that must give the same
answer: the **Overview tab** of the PR page, and the MCP tool **`get_blast_radius`** (spec 07), which calls the same
route.

## User stories

- Open a PR and see a "Blast radius" block on the Overview tab.
- See a summary at the top: changed symbols, callers, endpoints, crons.
- Under each changed symbol, see its callers as `file:line`, then the endpoints and crons behind them.
- Click a `file:line` and land on that line on GitHub.
- See readable text when there are no callers, and a separate badge with the reason when the repo index is incomplete.
- Ask Claude Code for the PR's blast radius and get the same map as in the browser.

## What already exists (reuse, do not rewrite)

Verified in code before the plan was written.

- **Facade.** `container.repoIntel.getBlastRadius(repoId, changedFiles)` returns `BlastResult`: `changedSymbols`,
  a FLAT `callers` list (`file, symbol, viaSymbol, line, rank`), `impactedEndpoints`, optional `factsByFile`,
  `degraded` + `reason`. It never throws. `getIndexState(repoId)` gives the index status and `lastIndexedSha`.
- **Contract.** `BlastRadius` in `contracts/brief.ts` (`changed_symbols`, `downstream[{symbol, callers[{name,file,line}],
  endpoints_affected, crons_affected}]`, `summary`). It is embedded in `PrBrief` and is NOT changed.
- **Client.** `githubBlobUrl` in `client/src/lib/github-urls.ts`, labels in `client/messages/en/blast.json`,
  `MonoLink`, `Badge`, `Icon` in the design system.
- **MCP.** The `get_blast_radius` stub of L04 (spec 07).

**Verified gaps (fixed by this feature)**
- The facade capped callers at 20 in TOTAL, not 20 per symbol (`MAX_CALLERS_PER_SYMBOL`): one symbol could fill all
  slots and the others looked like "no callers".
- The facade only ever reports `no_data`. A partial index came back as `degraded:false`, and `flag_off` was never set.
- `BFS_DEPTH` was unused by `getBlastRadius`, and endpoint facts came only from the caller file itself, so a helper
  used by a service never showed the route behind that service. Test files contributed `app.inject` URLs as
  "endpoints".
- The depgraph adapter returned `\` paths on Windows, so every import edge was dropped, `file_edges` stayed empty and
  no reference resolved: every PR showed 0 callers (fixed in `adapters/depgraph/index.ts`, `toRel()` now emits POSIX
  paths; test `server/test/depgraph-adapter.test.ts`).

## Requirements

### R1 - Route and contract (server)

- `GET /pulls/:id/blast`, new module `server/src/modules/blast/` (routes -> service -> repository, plus a pure
  `helpers.ts` and `constants.ts`), registered in `modules/index.ts`. Pattern: the `intent` module.
- `params`: uuid. A non-uuid id gives 422 `validation_error`. Unknown PR, or a PR of another workspace, gives 404.
- Rate limit **30 requests per minute** (`BLAST_RATE_LIMIT`), because the fallback path scans the repo clone.
- Service: workspace-scoped PR lookup and the PR's `pr_files` paths, then
  `Promise.all([repoIntel.getBlastRadius(repoId, paths), repoIntel.getIndexState(repoId)])` - `getBlastRadius` is called
  exactly once. Only `container.repoIntel` is used; no other module's service is imported.
- Response schema `BlastRadiusResponse` = `BlastRadius` + `stats {symbols, callers, endpoints, crons}` + `degraded` +
  `reason` (`flag_off | index_failed | index_partial | repo_too_large | no_data | null`) + `indexed_sha` (string | null).
  Added to BOTH copies of `contracts/review-api.ts` (byte-identical). `BlastRadius` and `PrBrief` do not change.
- No DB schema change, no migration.
- The facade cap is **20 callers per `viaSymbol`**, applied after the rank sort.

### R2 - Mapping rules (pure `blast/helpers.ts`, ring 0)

`helpers.ts` declares its input as local structural types; it does not import `repo-intel/types` (`pnpm arch`).

- **Grouping.** Callers are grouped by `viaSymbol` into `downstream`. Inside a group, callers are deduped by
  `file|line|symbol` and sorted by rank desc, then file asc, then line asc. Groups are sorted by caller count desc,
  then symbol asc.
- **Endpoints and crons.** Per group: the sorted, unique union of `factsByFile[file]` over the group's caller files
  (`[]` when `factsByFile` is missing). The facade fills `factsByFile[callerFile]` with the facts of the caller file
  AND of every file that imports it, walking importers over `file_edges` up to `BFS_DEPTH` hops in total (the direct
  caller is hop 1, so one more importer hop), cycle-safe. **Test files are excluded from facts** (`isTestPath` in
  `repo-intel/helpers.ts`: `.test.`, `.spec.`, `__tests__/`, `__mocks__/`, `e2e/`, a `test/` or `tests/` path segment,
  also a leading one). Callers from test files stay in `callers`.
- **Stats.** `symbols` = unique `name|file` of changed symbols; `callers` = unique `file|line|name` across all groups;
  `endpoints` / `crons` = unique counts across groups.
- **Summary.** Number-only string built from `stats`, ASCII, singular when n is 1, e.g.
  `2 changed symbols, 14 callers, 3 endpoints, 1 cron`. No model.
- **Changed symbols.** Deduped, sorted by file then name, capped at 200 listed (`stats.symbols` still counts all).
- **Degradation** (the facade reports only `no_data`, so the reason comes from the index state and the config flag):
  1. repo intelligence off -> `degraded:true, reason:'flag_off'`;
  2. else facade degraded: index `failed` -> `state.degradedReason ?? 'index_failed'`; otherwise
     `state.degradedReason ?? input.reason ?? 'no_data'`;
  3. else index `partial` -> `degraded:true, reason:'index_partial'` (shown even when data is present);
  4. else `degraded:false, reason:null`.
- **`indexed_sha`** = the index's `lastIndexedSha` when the facade is not degraded, otherwise `null`.

### R3 - UI (client)

- Hook `usePrBlast(prId)` in `client/src/lib/hooks/blast.ts` (key `["pr-blast", prId]`), exported from the hooks barrel.
- `BlastRadiusCard({ prId, repoFullName, headSha })` in `_components/BlastRadiusCard/`, with `BlastSummary` and
  `BlastTree` sub-components. States: loading (muted text), error (`role="alert"`), empty, degraded, data.
- Header: `Icon.Zap` plus the uppercase `title`. Summary row: four stats (icon + bold number + label): symbols,
  callers, endpoints, crons.
- Tree: one `<button type="button" aria-expanded>` row per changed symbol (chevron, symbol name with `()` for
  function-like kinds, right-aligned caller count). The **first symbol is open** by default. The expanded panel shows
  callers as `file:line`, then endpoint chips (globe icon), then cron chips (clock icon).
- **Links.** `file:line` opens `githubBlobUrl(repoFullName, sha, file, line)` in a new tab (`MonoLink`,
  `rel="noopener noreferrer"`). `sha` = `indexed_sha`, falling back to the PR head SHA when it is null (line numbers are
  valid at the indexed commit; the PR head can differ). With no repo name the caller is a plain mono span.
- **No callers** (`downstream` empty): `noDownstream` text with the changed-symbol count instead of an empty area.
- **Degraded:** a warning `Badge` ("Index incomplete") plus a `role="status"` line with the reason text, shown even when
  data is present.
- **Layout.** On the Overview tab `IntentCard` and `BlastRadiusCard` sit side by side in a two-column grid
  (`briefGrid`, `repeat(auto-fit, minmax(min(100%, 420px), 1fr))`) that wraps to one column on narrow screens.
  `IntentCard` moved into `OverviewTab` and still shows on the Findings tab.
- All strings live in `messages/en/blast.json`.

### R4 - Graph view (client, separable)

- A segmented **Tree | Graph** toggle (`role="group"`, two `<button type="button" aria-pressed>`) to the right of the
  summary. Tree is the default.
- `BlastGraph` is a plain SVG (no graph library) with a pure `layout.ts`: changed-symbol nodes on the left (at most 6),
  caller nodes in the middle by caller name, deduped by `file|name` (at most 12), endpoint nodes on the right (at most
  8). A column with overflow ends in a `+N` node. Edges: symbol -> caller solid, symbol -> endpoint dashed (endpoints
  are attributed per symbol, not per caller). Labels over 16 characters are cut to 15 plus an ellipsis, with the full
  label in `<title>`. Callers and endpoints are drawn only for the shown symbols, so every node has an edge.
- `<svg role="img" aria-label>` with a legend (changed symbol, callers, endpoints affected) and an empty text.

### R5 - MCP tool `get_blast_radius`

- Flat input `{repo, pr}` (unchanged). Call sequence: `GET /repos` -> `GET /repos/:id/pulls` ->
  `GET /pulls/<prId>/blast` (`encodeURIComponent` on the validated uuid). `readOnlyHint: true`, `idempotentHint: true`.
- Result (compact JSON text): `{repo, pr, summary, stats, degraded, reason, downstream[<=10 symbols], omitted_symbols?,
  next?}`. Each downstream item is `{symbol, callers:["file:line (name)"], endpoints, crons}` with endpoints and crons
  sliced to 20. `omitted_symbols` is set when groups were cut.
- `next`: when degraded, `the repo index is incomplete - re-sync the repo index in the DevDigest UI, then retry`;
  otherwise, when groups were omitted, `open the PR's Overview tab in the DevDigest UI for the full map`; otherwise absent.
  (Exact strings live in `mcp/src/messages.ts`.)
- HTTP 429 -> `Blast radius rate limit (30/min) hit - wait ~60s, then retry` (checked before `apiErrorText`, which maps
  every 429 to the review limit text). Other errors follow spec 07 R4; 5xx bodies are never echoed.
- Lenient `BlastRadius` response shape in `mcp/src/contracts.ts` (`mcp/` is not a `shared` consumer).
- **Pinned texts** (approved by the user 2026-10-24, recorded in `specs/07-mcp-server.md` "LLM-facing texts"):
  - title: `Get PR blast radius`
  - description (254 chars): `Map what a pull request can break: the symbols declared in its changed files, their callers as file:line, and the HTTP endpoints and crons behind those callers. Reads the precomputed repo index (no model call) and flags an incomplete index with a reason.`
  - instructions line: `- get_blast_radius: symbols, callers and endpoints a PR affects` (server instructions total 493 chars, limit 600).
- Docs: `mcp/AGENTS.md` (map, "API routes used"), `mcp/README.md`.

## Acceptance criteria

### Blocking
1. `GET /pulls/:id/blast` returns a body that passes `BlastRadiusResponse`; non-uuid -> 422, unknown or foreign-workspace
   PR -> 404; `getBlastRadius` is called once with the PR's sorted paths.
2. Callers are grouped by `viaSymbol`, capped at 20 per symbol; endpoints and crons follow the R2 attribution rules
   (importers up to `BFS_DEPTH`, test files excluded from facts).
3. A partial index gives `degraded:true, reason:'index_partial'`; `indexed_sha` is null when degraded.
4. Overview shows the Blast radius block with summary, tree (first symbol open), `file:line` links at `indexed_sha`
   (fallback head SHA), the no-callers text and the degraded badge with its reason.
5. `get_blast_radius` returns the route's map in compact form; 429, PR-not-found, unreachable API and bad shape are
   `isError` results with a next step; `tools/list` texts equal the pinned texts.
6. Both `review-api.ts` copies are identical; no migration; `pnpm arch` shows no new baseline line.
7. All suites pass: server (typecheck, unit, `.it.test`, arch), client (typecheck, test, lint), mcp (typecheck, arch,
   test, build).

### Non-blocking
1. The Tree | Graph toggle renders the SVG graph with the node caps of R4.
2. `.it.test` blast cases run against Docker (0 skipped).

## Manual check

Index must be ready: `curl http://localhost:3001/repos/<repoId>/index-state` -> `status: full` (resync with
`POST /repos/<repoId>/resync` if edges are missing). `repoId` is in the PR URL `/repos/<repoId>/pulls/<number>`.
Open the PR once in the UI first: `pr_files` is stored on the first `GET /pulls/:id`.

Reference scenario (checked live after a resync, index `full`, 854 edges, on this repo):
- PR #11 (smart diff): `buildSmartDiff` has **2 callers** - `server/src/modules/reviews/service.ts:190` and
  `server/test/reviews-smart-diff.test.ts:112` (the test caller stays a caller; its facts are excluded) - and its
  endpoints include `GET /pulls/:id/reviews` and `DELETE /runs/:id` through `reviews/routes.ts`.
- PR #9: `getPull` has **5 callers** and **10 endpoints**.

Steps:
1. Open the PR -> Overview: Intent and Blast radius sit side by side; click a `file:line` and check GitHub lands on
   that line at the indexed commit.
2. Toggle Tree | Graph.
3. Stop the index (or use a repo with no index): the badge "Index incomplete" shows with the reason.
4. In Claude Code (`claude --mcp-config mcp/devdigest.mcp.json`): "blast radius of acme/api PR #11" returns the same
   map as the page.

## Known limits

- **Changed symbols are approximate.** `changed_symbols` lists every symbol declared in a changed file, not only the
  edited ones. Callers are grouped by symbol **name**, so same-named symbols in two changed files merge.
- **The index is of the default branch.** Files new in the PR have no symbols. Line numbers are valid at `indexed_sha`;
  on the fallback path (`indexed_sha: null`) the link uses the PR head and may be off by a few lines.
- **PR never opened in the UI.** `pr_files` is stored on the first `GET /pulls/:id`, so an MCP call for a PR never
  opened in the UI returns an empty map flagged `no_data`.
- **Endpoint extraction is line-based.** A multi-line route declaration (`app.post(\n '/x'`) is missed.
- **Two hops only.** A route more than `BFS_DEPTH - 1` importer hops above a caller file is not attributed.
- **Fallback cost.** Without a usable index the ripgrep path scans the clone; the 30/min limit covers it.
- Out of scope: "prior PRs touching these files", LLM summaries, a resync button, re-analysis.

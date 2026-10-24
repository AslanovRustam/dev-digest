/**
 * Onion Architecture ring rules for @devdigest/api.
 *
 * The rings are documented in `.claude/skills/onion-architecture/SKILL.md`; the
 * `comment` on every rule below is what the agent (or the developer) sees when a
 * rule fires, so each one says WHAT to do instead, not just what is forbidden.
 *
 *   ring 0  domain          reviewer-core, vendor/shared/contracts, pure files next to service.ts
 *   ring 1  ports           vendor/shared/adapters.ts, modules/repo-intel/types.ts
 *   ring 2  application     modules/<m>/service.ts, platform/{jobs,sse,errors,run-logger}
 *   ring 3  infrastructure  adapters/**, db/**, modules/<m>/repository.ts
 *   ring 4  transport + composition root   modules/<m>/routes.ts, app.ts, platform/container.ts
 *
 * Run: `pnpm arch` (baseline-aware) · `pnpm arch:strict` (no baseline).
 */

/** External SDKs that perform I/O. They may only be reached through a port. */
const IO_SDKS =
  '^node_modules/(octokit|simple-git|openai|@anthropic-ai/sdk|@ast-grep/napi|@vscode/ripgrep|js-tiktoken|dependency-cruiser)';

/**
 * Concrete adapter CLASSES (the ones that hold a connection or an API key).
 * Deliberately NOT all of `src/adapters/**`: `astgrep/index.ts`,
 * `codeindex/extract.ts`, `git/diff-parser.ts` and `llm/pricing.ts` are pure
 * functions that inner rings may legitimately use.
 */
const CONCRETE_ADAPTERS =
  '^src/adapters/(github/octokit|git/simple-git|llm/(openai|anthropic)|embedder/openai|codeindex/ripgrep|secrets/local|auth/local)[.]ts$';

/**
 * Pure business-rule files: the domain ring, as flat files beside service.ts.
 * `helpers.ts` / `constants.ts` are the per-module convention; `pulls/{cost,
 * findings,status}.ts` are named rule files, as is `reviews/smart-diff.ts`
 * (Smart Diff classifier, reused by L08). NOT listed on purpose:
 * `reviews/findings.ts`, which takes a repository and is application logic.
 */
const DOMAIN_FILES =
  '^src/modules/([^/]+/(helpers|constants)|pulls/(cost|findings|status)|reviews/smart-diff)[.]ts$';

/**
 * What a domain file is allowed to reach: ring 0/1, the shared error kernel, and
 * `db/rows.ts` — which is type aliases only and exists precisely so a consumer can
 * name a row shape without importing anyone's data layer.
 */
const DOMAIN_MAY_IMPORT =
  '(^src/vendor/shared/|^node_modules/zod|^[.][.]/reviewer-core/src/index[.]ts$|' +
  '^src/platform/errors[.]ts$|^src/db/rows[.]ts$|' +
  DOMAIN_FILES.slice(1) +
  ')';

module.exports = {
  forbidden: [
    {
      name: 'ring4-routes-no-persistence',
      severity: 'error',
      comment:
        'Ring 4 (transport) must not reach ring 3 (persistence). Move the query into ' +
        'modules/<name>/repository.ts and call it from service.ts. Recipe: ' +
        '.claude/skills/onion-architecture/references/migration.md',
      from: { path: '^src/modules/[^/]+/routes[.]ts$' },
      to: { path: '^(node_modules/drizzle-orm|src/db/)' },
    },
    {
      name: 'ring2-no-http',
      severity: 'error',
      comment:
        'Services and domain files must not know about HTTP. Take plain arguments, throw ' +
        'AppError/NotFoundError from platform/errors.js; routes.ts maps those to status codes.',
      from: {
        path: '^src/modules/[^/]+/',
        pathNot: '^src/modules/(_shared/|[^/]+/routes[.]ts$)',
      },
      to: { path: '^node_modules/(fastify|fastify-type-provider-zod|fastify-sse-v2|@fastify/)' },
    },
    {
      name: 'io-sdks-only-in-adapters',
      severity: 'error',
      comment:
        'External I/O SDKs live behind a port in src/adapters/**. Add the method to the port ' +
        'interface in src/vendor/shared/adapters.ts, implement it in src/adapters/, add a mock ' +
        'in src/adapters/mocks.ts, then resolve it from the Container.',
      from: { pathNot: '^(src/adapters/|src/platform/container[.]ts$)' },
      to: { path: IO_SDKS },
    },
    {
      name: 'no-concrete-adapters-outside-composition',
      severity: 'error',
      comment:
        'Never construct a concrete adapter outside the composition root. Use container.git / ' +
        'await container.github() / await container.llm(id) — that indirection is what makes ' +
        'ContainerOverrides work in tests.',
      from: { pathNot: '^(src/platform/container[.]ts$|src/app[.]ts$|src/adapters/)' },
      to: { path: CONCRETE_ADAPTERS },
    },
    {
      name: 'db-is-a-leaf',
      severity: 'error',
      comment:
        'src/db is ring 3 infrastructure: schema, client and row types only. It must not import ' +
        'modules, platform or adapters.',
      from: { path: '^src/db/' },
      to: { path: '^src/(modules|platform|adapters)/' },
    },
    {
      name: 'adapters-are-leaves',
      severity: 'error',
      comment:
        'Ring 3 must not depend on ring 2. If an adapter needs a constant from a module, move ' +
        'the constant down into src/adapters/** or src/platform/**.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'platform-no-modules',
      severity: 'error',
      comment:
        'Only platform/container.ts (the composition root) may reach into modules. Everything ' +
        'else in platform/ is cross-cutting and must stay module-agnostic.',
      from: { path: '^src/platform/', pathNot: '^src/platform/container[.]ts$' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-imports',
      severity: 'error',
      comment:
        'Modules are vertical slices. Cross-module behaviour goes through the Container ' +
        '(container.reviewRepo, container.agentsRepo, container.repoIntel) or a ' +
        '@devdigest/shared contract. Only another module constants.ts / types.ts may be ' +
        'imported directly — those are ring 0/1.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/',
        pathNot: '^src/modules/($1/|_shared/|[^/]+/(constants|types)[.]ts$)',
      },
    },
    {
      name: 'sql-only-in-repository',
      severity: 'error',
      comment:
        'Raw SQL belongs in the module repository (or src/db). For a row TYPE use ' +
        'import type { XRow } from "../../db/rows.js" — a type-only import is allowed here.',
      from: {
        pathNot:
          '(repository[.]ts$|/repository/|^src/db/|^src/platform/jobs[.]ts$|^src/adapters/|^src/app[.]ts$)',
      },
      to: {
        path: '^(node_modules/drizzle-orm|src/db/schema)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'shared-contracts-are-pure',
      severity: 'error',
      comment:
        'src/vendor/shared is ring 0/1: Zod contracts and port interfaces only. Nothing else may ' +
        'leak in — reviewer-core compiles against these same files.',
      from: { path: '^src/vendor/shared/' },
      to: { pathNot: '^(src/vendor/shared/|node_modules/zod)' },
    },
    {
      name: 'reviewer-core-via-public-entry',
      severity: 'error',
      comment:
        'reviewer-core is the pure core package. Import @devdigest/reviewer-core (its index.ts) ' +
        'only — never a deep path, or its public API stops meaning anything.',
      from: { path: '^src/' },
      to: {
        path: '^[.][.]/reviewer-core/src/',
        pathNot: '^[.][.]/reviewer-core/src/index[.]ts$',
      },
    },
    {
      name: 'domain-files-are-pure',
      severity: 'error',
      comment:
        'Domain rule files (helpers.ts, constants.ts, pulls/{cost,findings,status}.ts) are ' +
        'ring 0: only @devdigest/shared, zod, reviewer-core, platform/errors and sibling domain ' +
        'files. No Container, no Db, no SDK. Need a row shape? `import type` it from ' +
        'src/db/rows.js — never from a repository.',
      from: { path: DOMAIN_FILES },
      to: { pathNot: DOMAIN_MAY_IMPORT },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A dependency cycle means a ring boundary was crossed in both directions. Cycles that ' +
        'run through platform/container.ts are exempt: the composition root knows every module ' +
        'by construction, and every service takes the Container type back.',
      from: {},
      to: { circular: true, viaNot: '^src/platform/container[.]ts$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^src/db/migrations|[.]test[.]ts$)' },
    // Needed for the `type-only` signal that `sql-only-in-repository` relies on,
    // and to resolve `.js` specifiers back to their `.ts` sources.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};

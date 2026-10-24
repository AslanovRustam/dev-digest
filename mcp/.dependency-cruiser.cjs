/**
 * Onion ring rules for @devdigest/mcp (greenfield: strict, no baseline).
 *
 *   ring 0  domain          contracts.ts, constants.ts, format.ts, messages.ts
 *   ring 1  ports           ports.ts
 *   ring 2  application     resolve.ts, wait.ts, tools/**
 *   ring 3  infrastructure  adapters/**, config.ts
 *   ring 4  transport + composition root   server.ts, index.ts
 *
 * Globals depcruise cannot see (fetch, process.env, console.log) are checked by
 * test/architecture.test.ts. Run: `npm run arch`.
 */

const RING0 = '^src/(contracts|constants|format|messages)[.]ts$';

module.exports = {
  forbidden: [
    {
      name: 'sdk-only-in-transport',
      severity: 'error',
      comment:
        'The MCP SDK is ring 4 only. Tools return a plain ToolResult; src/server.ts maps it to MCP content.',
      from: { pathNot: '^src/(server|index)[.]ts$' },
      to: { path: '^node_modules/@modelcontextprotocol/' },
    },
    {
      name: 'io-only-in-adapters',
      severity: 'error',
      comment:
        'Network I/O lives in src/adapters/**. Add a method to the ApiClient port (src/ports.ts) and implement it there.',
      from: { pathNot: '^src/adapters/' },
      to: { path: '^(node:)?(http|https|net|tls|dgram)$|^node_modules/(undici|node-fetch|axios)' },
      // core modules resolve with dependencyTypes "core"
    },
    {
      name: 'no-concrete-adapters-outside-composition',
      severity: 'error',
      comment:
        'adapters/http-api.ts and config.ts are constructed only in src/index.ts (the composition root).',
      from: { pathNot: '^src/index[.]ts$' },
      to: { path: '^src/(adapters/http-api|config)[.]ts$' },
    },
    {
      name: 'domain-files-are-pure',
      severity: 'error',
      comment:
        'Ring 0 (contracts, constants, format, messages) imports only zod and ring-0 siblings: no ports, tools, node built-ins.',
      from: { path: RING0 },
      to: { pathNot: '(' + RING0 + '|^node_modules/zod)' },
    },
    {
      name: 'ports-import-domain-only',
      severity: 'error',
      comment: 'ports.ts (ring 1) imports ring 0 and zod types only.',
      from: { path: '^src/ports[.]ts$' },
      to: { pathNot: '(' + RING0 + '|^node_modules/zod)' },
    },
    {
      name: 'no-cross-tool-imports',
      severity: 'error',
      comment:
        'A tool never imports another tool. Move shared logic to resolve.ts, wait.ts or format.ts. tools/types.ts is allowed.',
      from: { path: '^src/tools/' },
      to: { path: '^src/tools/', pathNot: '^src/tools/types[.]ts$' },
    },
    {
      name: 'application-no-outer-rings',
      severity: 'error',
      comment: 'Ring 2 (resolve, wait, tools) must not import ring 3/4 files.',
      from: { path: '^src/(resolve|wait|tools/)' },
      to: { path: '^src/(adapters/|config[.]ts|server[.]ts|index[.]ts)' },
    },
    {
      name: 'infrastructure-no-outer-rings',
      severity: 'error',
      comment: 'Ring 3 (adapters, config) must not import ring 2/4 files (resolve, wait, tools, server, index).',
      from: { path: '^src/(adapters/|config[.]ts)' },
      to: { path: '^src/(resolve|wait|tools/|server[.]ts|index[.]ts)' },
    },
    {
      name: 'no-foreign-packages',
      severity: 'error',
      comment:
        'mcp is an independent package and not a consumer of shared. Never import ../server, ../reviewer-core, ../client or any vendor/shared.',
      from: {},
      to: { path: '([.][.]/(server|reviewer-core|client)/|vendor/shared)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A dependency cycle means a ring boundary was crossed in both directions.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '[.]test[.]ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};

import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { isTestPath } from '../src/modules/repo-intel/helpers.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Facade: endpoints/crons of a caller file include those of its importers up to
 * BFS_DEPTH (2), excluding test files. No Postgres — `svc.repo` is patched.
 */

const state = { status: 'full', lastIndexedSha: 'sha1' } as IndexState;

const decl = {
  path: 'helper.ts',
  name: 'H',
  kind: 'function',
  line: 1,
  endLine: 2,
  exported: true,
  signature: null,
};

function build(
  callerFiles: string[],
  edges: Array<{ fromFile: string; toFile: string }>,
  facts: Record<string, { endpoints: string[]; crons: string[] }>,
): RepoIntelService {
  const svc = new RepoIntelService({
    config: { repoIntelEnabled: true },
    db: {} as never,
  } as never);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => state,
    getSymbolRows: async (_r: string, paths: string[]) =>
      paths.includes('helper.ts') ? [decl] : [],
    getResolvedCallers: async () =>
      callerFiles.map((f, i) => ({ fromPath: f, toSymbol: 'H', line: i + 1, rank: 1 - i / 10 })),
    getImporters: async (_r: string, files: string[]) =>
      edges.filter((e) => files.includes(e.toFile)),
    getFileFacts: async (_r: string, files: string[]) =>
      files
        .filter((f) => facts[f])
        .map((f) => ({ filePath: f, endpoints: facts[f]!.endpoints, crons: facts[f]!.crons })),
  };
  return svc;
}

describe('RepoIntel.getBlastRadius — facts attribution', () => {
  it('attributes the route of an importer of the caller (hop 2)', async () => {
    const res = await build(
      ['service.ts'],
      [{ fromFile: 'routes.ts', toFile: 'service.ts' }],
      { 'routes.ts': { endpoints: ['GET /x'], crons: ['0 * * * *'] } },
    ).getBlastRadius('r1', ['helper.ts']);
    expect(res.factsByFile?.['service.ts']).toEqual({
      endpoints: ['GET /x'],
      crons: ['0 * * * *'],
    });
    expect(res.impactedEndpoints).toEqual(['GET /x']);
  });

  it('does not reach a routes file two importer hops away', async () => {
    const res = await build(
      ['service.ts'],
      [
        { fromFile: 'mid.ts', toFile: 'service.ts' },
        { fromFile: 'routes.ts', toFile: 'mid.ts' },
      ],
      { 'routes.ts': { endpoints: ['GET /far'], crons: [] } },
    ).getBlastRadius('r1', ['helper.ts']);
    expect(res.factsByFile?.['service.ts']).toBeUndefined();
    expect(res.impactedEndpoints).toEqual([]);
  });

  it('keeps a test-file caller but drops test facts', async () => {
    const res = await build(
      ['test/svc.test.ts', 'service.ts'],
      [{ fromFile: 'test/routes.test.ts', toFile: 'service.ts' }],
      {
        'test/svc.test.ts': { endpoints: ['GET /t1'], crons: [] },
        'test/routes.test.ts': { endpoints: ['GET /t2'], crons: [] },
      },
    ).getBlastRadius('r1', ['helper.ts']);
    expect(res.callers.map((c) => c.file)).toContain('test/svc.test.ts');
    expect(res.factsByFile ?? {}).toEqual({});
    expect(res.impactedEndpoints).toEqual([]);
  });

  it('terminates on an import cycle', async () => {
    const res = await build(
      ['a.ts'],
      [
        { fromFile: 'b.ts', toFile: 'a.ts' },
        { fromFile: 'a.ts', toFile: 'b.ts' },
      ],
      { 'b.ts': { endpoints: ['GET /b'], crons: [] } },
    ).getBlastRadius('r1', ['helper.ts']);
    expect(res.factsByFile?.['a.ts']?.endpoints).toEqual(['GET /b']);
  });
});

describe('isTestPath', () => {
  it.each([
    ['a.test.ts', true],
    ['src/a.spec.tsx', true],
    ['test/x.ts', true],
    ['server/test/x.ts', true],
    ['tests/x.ts', true],
    ['src/__tests__/y.ts', true],
    ['src/__mocks__/y.ts', true],
    ['e2e/specs/z.ts', true],
    ['src/modules/pulls/routes.ts', false],
    ['src/latest/routes.ts', false],
    ['src/contest.ts', false],
  ])('%s -> %s', (p, expected) => {
    expect(isTestPath(p)).toBe(expected);
  });
});

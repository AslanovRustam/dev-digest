import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Facade fix: `MAX_CALLERS_PER_SYMBOL` caps callers per changed symbol, not globally.
 * No Postgres — the service's `repo` is patched (same pattern as repo-intel-facade-degraded).
 */

const state = { status: 'full', lastIndexedSha: 'sha1' } as IndexState;

const decl = (name: string) => ({
  path: 'a.ts',
  name,
  kind: 'function',
  line: 1,
  endLine: 2,
  exported: true,
  signature: null,
});

function build(): RepoIntelService {
  const svc = new RepoIntelService({
    config: { repoIntelEnabled: true },
    db: {} as never,
  } as never);
  const callers = [
    ...Array.from({ length: 25 }, (_, i) => ({
      fromPath: `callerA${i}.ts`,
      toSymbol: 'A',
      line: i + 1,
      rank: 1 - i / 100,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      fromPath: `callerB${i}.ts`,
      toSymbol: 'B',
      line: i + 1,
      rank: 0.01,
    })),
  ];
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => state,
    getSymbolRows: async (_repoId: string, paths: string[]) =>
      paths.includes('a.ts') ? [decl('A'), decl('B')] : [],
    getResolvedCallers: async () => callers,
    getImporters: async () => [],
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel.getBlastRadius — per-symbol caller cap', () => {
  it('keeps 20 callers of A and all 3 of B', async () => {
    const res = await build().getBlastRadius('r1', ['a.ts']);
    expect(res.callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(20);
    expect(res.callers.filter((c) => c.viaSymbol === 'B')).toHaveLength(3);
  });
});

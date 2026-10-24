import { describe, it, expect } from 'vitest';
import {
  blastDegradation,
  blastStats,
  blastSummary,
  groupDownstream,
  toBlastRadiusResponse,
  type BlastInput,
  type IndexStateInput,
} from '../src/modules/blast/helpers.js';
import { MAX_CHANGED_SYMBOLS_LISTED } from '../src/modules/blast/constants.js';

const caller = (file: string, line: number, via: string, rank = 0, symbol = 'fn') => ({
  file,
  line,
  viaSymbol: via,
  rank,
  symbol,
});

const full: IndexStateInput = { status: 'full', lastIndexedSha: 'sha1' };

describe('groupDownstream', () => {
  it('groups callers by viaSymbol and orders groups by size then name', () => {
    const input: BlastInput = {
      changedSymbols: [],
      callers: [caller('x.ts', 1, 'B'), caller('y.ts', 1, 'A'), caller('z.ts', 2, 'A')],
    };
    const g = groupDownstream(input);
    expect(g.map((x) => x.symbol)).toEqual(['A', 'B']);
    expect(g[0]!.callers).toHaveLength(2);
  });

  it('aggregates endpoints and crons from caller files, sorted and unique', () => {
    const input: BlastInput = {
      changedSymbols: [],
      callers: [caller('a.ts', 1, 'S'), caller('b.ts', 1, 'S')],
      factsByFile: {
        'a.ts': { endpoints: ['POST /x', 'GET /a'], crons: ['0 * * * *'] },
        'b.ts': { endpoints: ['GET /a'], crons: [] },
        'c.ts': { endpoints: ['GET /nope'], crons: [] },
      },
    };
    const [g] = groupDownstream(input);
    expect(g!.endpoints_affected).toEqual(['GET /a', 'POST /x']);
    expect(g!.crons_affected).toEqual(['0 * * * *']);
  });

  it('tolerates a missing factsByFile', () => {
    const [g] = groupDownstream({ changedSymbols: [], callers: [caller('a.ts', 1, 'S')] });
    expect(g!.endpoints_affected).toEqual([]);
    expect(g!.crons_affected).toEqual([]);
  });

  it('dedupes callers by file|line|symbol and orders by rank, file, line', () => {
    const [g] = groupDownstream({
      changedSymbols: [],
      callers: [
        caller('b.ts', 5, 'S', 0.5),
        caller('b.ts', 5, 'S', 0.5),
        caller('a.ts', 9, 'S', 0.5),
        caller('a.ts', 2, 'S', 0.5),
        caller('z.ts', 1, 'S', 0.9),
      ],
    });
    expect(g!.callers.map((c) => `${c.file}:${c.line}`)).toEqual(['z.ts:1', 'a.ts:2', 'a.ts:9', 'b.ts:5']);
  });
});

describe('blastStats / blastSummary', () => {
  it('counts unique callers and facts across groups', () => {
    const downstream = groupDownstream({
      changedSymbols: [],
      callers: [caller('a.ts', 1, 'A'), caller('a.ts', 1, 'B'), caller('b.ts', 2, 'B')],
      factsByFile: { 'a.ts': { endpoints: ['GET /a'], crons: ['c'] } },
    });
    const stats = blastStats(
      [
        { name: 'A', file: 'f.ts' },
        { name: 'A', file: 'f.ts' },
        { name: 'B', file: 'f.ts' },
      ],
      downstream,
    );
    expect(stats).toEqual({ symbols: 2, callers: 2, endpoints: 1, crons: 1 });
  });

  it('uses singular and plural', () => {
    expect(blastSummary({ symbols: 1, callers: 1, endpoints: 1, crons: 1 })).toBe(
      '1 changed symbol, 1 caller, 1 endpoint, 1 cron',
    );
    expect(blastSummary({ symbols: 2, callers: 14, endpoints: 3, crons: 0 })).toBe(
      '2 changed symbols, 14 callers, 3 endpoints, 0 crons',
    );
  });
});

describe('blastDegradation', () => {
  const ok: BlastInput = { changedSymbols: [], callers: [] };
  it('flag off', () => {
    expect(blastDegradation(ok, full, false)).toEqual({ degraded: true, reason: 'flag_off' });
  });
  it('failed index', () => {
    expect(blastDegradation({ ...ok, degraded: true, reason: 'no_data' }, { status: 'failed', lastIndexedSha: '' }, true)).toEqual({
      degraded: true,
      reason: 'index_failed',
    });
  });
  it('degraded input prefers the index reason, then the facade reason', () => {
    expect(
      blastDegradation(
        { ...ok, degraded: true, reason: 'no_data' },
        { status: 'degraded', degradedReason: 'repo_too_large', lastIndexedSha: '' },
        true,
      ).reason,
    ).toBe('repo_too_large');
    expect(blastDegradation({ ...ok, degraded: true }, { status: 'degraded', lastIndexedSha: '' }, true).reason).toBe('no_data');
  });
  it('partial index with data present', () => {
    expect(blastDegradation({ ...ok, callers: [caller('a.ts', 1, 'S')] }, { status: 'partial', lastIndexedSha: 's' }, true)).toEqual({
      degraded: true,
      reason: 'index_partial',
    });
  });
  it('healthy', () => {
    expect(blastDegradation(ok, full, true)).toEqual({ degraded: false, reason: null });
  });
});

describe('toBlastRadiusResponse', () => {
  it('sets indexed_sha only on the persistent path', () => {
    const input: BlastInput = { changedSymbols: [], callers: [] };
    expect(toBlastRadiusResponse(input, full, true).indexed_sha).toBe('sha1');
    expect(toBlastRadiusResponse({ ...input, degraded: true, reason: 'no_data' }, full, true).indexed_sha).toBeNull();
  });

  it('caps listed changed symbols but still counts them all', () => {
    const n = MAX_CHANGED_SYMBOLS_LISTED + 5;
    const changedSymbols = Array.from({ length: n }, (_, i) => ({
      file: 'a.ts',
      name: `s${String(i).padStart(4, '0')}`,
      kind: 'function',
    }));
    const res = toBlastRadiusResponse({ changedSymbols, callers: [] }, full, true);
    expect(res.changed_symbols).toHaveLength(MAX_CHANGED_SYMBOLS_LISTED);
    expect(res.stats.symbols).toBe(n);
  });
});

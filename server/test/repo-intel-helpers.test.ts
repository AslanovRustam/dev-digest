import { describe, it, expect } from 'vitest';
import {
  advanceFrontier,
  capCallersPerSymbol,
  rollUpFacts,
} from '../src/modules/repo-intel/helpers.js';

describe('capCallersPerSymbol', () => {
  it('caps each viaSymbol separately and keeps order', () => {
    const callers = [
      { viaSymbol: 'A', id: 1 },
      { viaSymbol: 'A', id: 2 },
      { viaSymbol: 'B', id: 3 },
      { viaSymbol: 'A', id: 4 },
      { viaSymbol: 'B', id: 5 },
    ];
    expect(capCallersPerSymbol(callers, 2).map((c) => c.id)).toEqual([1, 2, 3, 5]);
  });

  it('returns nothing for max 0 and everything under the cap', () => {
    const callers = [{ viaSymbol: 'A' }];
    expect(capCallersPerSymbol(callers, 0)).toEqual([]);
    expect(capCallersPerSymbol(callers, 5)).toEqual(callers);
  });
});

describe('advanceFrontier', () => {
  const start = () => ({
    reached: new Map([['svc.ts', new Set(['svc.ts'])]]),
    frontier: new Map([['svc.ts', ['svc.ts']]]),
  });

  it('adds importers of one hop to reached and returns them as the next frontier', () => {
    const { reached, frontier } = start();
    const next = advanceFrontier(
      frontier,
      [
        { toFile: 'svc.ts', fromFile: 'routes.ts' },
        { toFile: 'svc.ts', fromFile: 'cron.ts' },
        { toFile: 'other.ts', fromFile: 'ignored.ts' },
      ],
      reached,
    );
    expect(next.get('svc.ts')).toEqual(['routes.ts', 'cron.ts']);
    expect([...reached.get('svc.ts')!].sort()).toEqual(['cron.ts', 'routes.ts', 'svc.ts']);
  });

  it('terminates on a cycle that revisits the origin across repeated hops', () => {
    const { reached, frontier: f0 } = start();
    const edges = [
      { toFile: 'svc.ts', fromFile: 'a.ts' },
      { toFile: 'a.ts', fromFile: 'svc.ts' },
    ];
    const f1 = advanceFrontier(f0, edges, reached);
    expect(f1.get('svc.ts')).toEqual(['a.ts']);
    const f2 = advanceFrontier(f1, edges, reached);
    expect(f2.size).toBe(0);
    expect([...reached.get('svc.ts')!].sort()).toEqual(['a.ts', 'svc.ts']);
  });

  it('tracks each origin independently', () => {
    const reached = new Map([
      ['a.ts', new Set(['a.ts'])],
      ['b.ts', new Set(['b.ts'])],
    ]);
    const frontier = new Map([
      ['a.ts', ['a.ts']],
      ['b.ts', ['b.ts']],
    ]);
    const next = advanceFrontier(
      frontier,
      [
        { toFile: 'a.ts', fromFile: 'shared.ts' },
        { toFile: 'b.ts', fromFile: 'shared.ts' },
      ],
      reached,
    );
    expect(next.get('a.ts')).toEqual(['shared.ts']);
    expect(next.get('b.ts')).toEqual(['shared.ts']);
  });
});

describe('rollUpFacts', () => {
  const facts = [
    { filePath: 'svc.ts', endpoints: [], crons: [] },
    { filePath: 'routes.ts', endpoints: ['POST /b', 'GET /a'], crons: ['0 * * * *'] },
    { filePath: 'test/routes.test.ts', endpoints: ['GET /fixture'], crons: [] },
  ];

  it('merges facts of everything an origin reached, sorted, and unions endpoints', () => {
    const reached = new Map([['svc.ts', new Set(['svc.ts', 'routes.ts'])]]);
    expect(rollUpFacts(reached, facts)).toEqual({
      factsByFile: { 'svc.ts': { endpoints: ['GET /a', 'POST /b'], crons: ['0 * * * *'] } },
      endpoints: ['POST /b', 'GET /a'],
    });
  });

  it('skips test-path facts and omits origins with no facts', () => {
    const reached = new Map([
      ['svc.ts', new Set(['svc.ts', 'test/routes.test.ts'])],
      ['lonely.ts', new Set(['lonely.ts'])],
    ]);
    expect(rollUpFacts(reached, facts)).toEqual({ factsByFile: {}, endpoints: [] });
  });
});

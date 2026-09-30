/**
 * PR-list COST rollup (`modules/pulls/cost.ts`) — the total of every finished
 * run of a PR, across all "Run Review" clicks. Pure, so the running / failed /
 * unknown-cost rules get unit coverage independent of the route's query.
 */
import { describe, it, expect } from 'vitest';
import { totalReviewCost, type RunCostRow } from '../src/modules/pulls/cost.js';

const run = (o: Partial<RunCostRow>): RunCostRow => ({
  prId: 'pr1',
  status: 'done',
  costUsd: 0.01,
  ...o,
});

describe('totalReviewCost', () => {
  it('sums every finished run of the PR, across reviews', () => {
    // Two separate "Run Review" clicks: $0.00372 + $0.0038.
    const out = totalReviewCost([run({ costUsd: 0.00372 }), run({ costUsd: 0.0038 })]);
    expect(out.get('pr1')).toBeCloseTo(0.00752);
  });

  it('does not count a run that is still running (it joins once done)', () => {
    const out = totalReviewCost([run({ status: 'running', costUsd: null }), run({ costUsd: 0.002 })]);
    expect(out.get('pr1')).toBeCloseTo(0.002);
  });

  it('leaves failed / cancelled runs out of the sum', () => {
    const out = totalReviewCost([
      run({ status: 'failed', costUsd: null }),
      run({ status: 'cancelled', costUsd: null }),
      run({ costUsd: 0.004 }),
    ]);
    expect(out.get('pr1')).toBeCloseTo(0.004);
  });

  it('is null (unknown, not $0) when no run has a known cost', () => {
    const out = totalReviewCost([run({ status: 'running', costUsd: null }), run({ costUsd: null })]);
    expect(out.get('pr1')).toBeNull();
  });

  it('keeps a genuine $0 (free model) as 0', () => {
    expect(totalReviewCost([run({ costUsd: 0 })]).get('pr1')).toBe(0);
  });

  it('rolls up each PR independently; PRs without runs are absent', () => {
    const out = totalReviewCost([run({ prId: 'pr1', costUsd: 0.01 }), run({ prId: 'pr2', costUsd: 0.02 })]);
    expect(out.get('pr1')).toBeCloseTo(0.01);
    expect(out.get('pr2')).toBeCloseTo(0.02);
    expect(out.has('pr3')).toBe(false);
  });
});

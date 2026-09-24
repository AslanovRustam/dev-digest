/**
 * PR-list COST rollup (`modules/pulls/cost.ts`) — sums the latest review batch
 * per PR. Pure, so the batch / running / failed / legacy rules get unit coverage
 * independent of the route's query. Input is newest-first, as the route orders it.
 */
import { describe, it, expect } from 'vitest';
import { latestReviewCost, type RunCostRow } from '../src/modules/pulls/cost.js';

let seq = 0;
const run = (o: Partial<RunCostRow>): RunCostRow => ({
  id: `r${seq++}`,
  prId: 'pr1',
  batchId: 'b2',
  status: 'done',
  costUsd: 0.01,
  ...o,
});

describe('latestReviewCost', () => {
  it('sums every run of the latest batch, ignoring older batches', () => {
    const out = latestReviewCost([
      run({ costUsd: 0.0013 }),
      run({ costUsd: 0.0014 }),
      run({ batchId: 'b1', costUsd: 5 }),
    ]);
    expect(out.get('pr1')).toBeCloseTo(0.0027);
  });

  it('is null while any run of the latest batch is still running', () => {
    const out = latestReviewCost([run({ status: 'running', costUsd: null }), run({ costUsd: 0.002 })]);
    expect(out.get('pr1')).toBeNull();
  });

  it('leaves failed / cancelled runs out of the sum', () => {
    const out = latestReviewCost([
      run({ status: 'failed', costUsd: null }),
      run({ status: 'cancelled', costUsd: null }),
      run({ costUsd: 0.004 }),
    ]);
    expect(out.get('pr1')).toBeCloseTo(0.004);
  });

  it('is null (unknown, not $0) when no run of the batch has a known cost', () => {
    const out = latestReviewCost([run({ status: 'failed', costUsd: null }), run({ costUsd: null })]);
    expect(out.get('pr1')).toBeNull();
  });

  it('keeps a genuine $0 (free model) as 0', () => {
    expect(latestReviewCost([run({ costUsd: 0 })]).get('pr1')).toBe(0);
  });

  it('treats a legacy run without batch_id as its own batch', () => {
    const out = latestReviewCost([
      run({ batchId: null, costUsd: 0.003 }),
      run({ batchId: null, costUsd: 0.5 }),
    ]);
    expect(out.get('pr1')).toBeCloseTo(0.003);
  });

  it('rolls up each PR independently; PRs without runs are absent', () => {
    const out = latestReviewCost([run({ prId: 'pr1', costUsd: 0.01 }), run({ prId: 'pr2', batchId: 'x', costUsd: 0.02 })]);
    expect(out.get('pr1')).toBeCloseTo(0.01);
    expect(out.get('pr2')).toBeCloseTo(0.02);
    expect(out.has('pr3')).toBe(false);
  });
});

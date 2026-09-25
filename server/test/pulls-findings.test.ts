/**
 * PR-list FINDINGS scope (`modules/pulls/findings.ts`) — which reviews the
 * column counts: the latest review batch, falling back to the newest review for
 * legacy / seeded rows. Pure, so the rules get unit coverage independent of the
 * route's queries. Inputs are newest-first, as the route orders them.
 */
import { describe, it, expect } from 'vitest';
import { latestReviewIdsByPr, type ReviewScopeRow, type RunScopeRow } from '../src/modules/pulls/findings.js';

const review = (id: string, runId: string | null, prId = 'pr1'): ReviewScopeRow => ({ id, prId, runId });
const run = (id: string, batchId: string | null, prId: string | null = 'pr1'): RunScopeRow => ({ id, prId, batchId });

describe('latestReviewIdsByPr', () => {
  it('keeps every review of the latest batch, ignoring older batches', () => {
    const out = latestReviewIdsByPr(
      [review('rvB2', 'runB2'), review('rvB1', 'runB1'), review('rvA', 'runA')],
      [run('runB2', 'b2'), run('runB1', 'b2'), run('runA', 'b1')],
    );
    expect(out.get('pr1')).toEqual(['rvB2', 'rvB1']);
  });

  it('treats a legacy run without batch_id as its own batch', () => {
    const out = latestReviewIdsByPr(
      [review('rv2', 'run2'), review('rv1', 'run1')],
      [run('run2', null), run('run1', null)],
    );
    expect(out.get('pr1')).toEqual(['rv2']);
  });

  it('falls back to the newest review when no review carries a run (seeded data)', () => {
    const out = latestReviewIdsByPr([review('rvNew', null), review('rvOld', null)], []);
    expect(out.get('pr1')).toEqual(['rvNew']);
  });

  it('falls back to the newest review while the latest batch has not produced one yet', () => {
    const out = latestReviewIdsByPr(
      [review('rvA', 'runA')],
      [run('runB', 'b2'), run('runA', 'b1')],
    );
    expect(out.get('pr1')).toEqual(['rvA']);
  });

  it('leaves a never-reviewed PR out of the map', () => {
    const out = latestReviewIdsByPr([], [run('run1', 'b1')]);
    expect(out.has('pr1')).toBe(false);
  });

  it('scopes each PR independently', () => {
    const out = latestReviewIdsByPr(
      [review('rv1', 'run1', 'pr1'), review('rv2', 'run2', 'pr2'), review('rv0', 'run0', 'pr2')],
      [run('run2', 'x', 'pr2'), run('run1', 'y', 'pr1'), run('run0', 'z', 'pr2')],
    );
    expect(out.get('pr1')).toEqual(['rv1']);
    expect(out.get('pr2')).toEqual(['rv2']);
  });
});

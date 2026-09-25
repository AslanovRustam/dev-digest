/**
 * PR-list FINDINGS rollup (`modules/pulls/findings.ts`) — open findings per
 * severity across ALL of a PR's reviews. Pure, so the scope rules get unit
 * coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import { openFindingsByPr } from '../src/modules/pulls/findings.js';

describe('openFindingsByPr', () => {
  it('sums findings over every review of the PR — a clean re-run hides nothing', () => {
    const out = openFindingsByPr(
      [
        { id: 'rvNew', prId: 'pr1' }, // re-run that found nothing
        { id: 'rvOld', prId: 'pr1' },
      ],
      [
        { reviewId: 'rvOld', severity: 'WARNING' },
        { reviewId: 'rvOld', severity: 'SUGGESTION' },
      ],
    );
    expect(out.get('pr1')).toEqual({ critical: 0, warning: 1, suggestion: 1 });
  });

  it('gives a reviewed PR with nothing open all zeros', () => {
    expect(openFindingsByPr([{ id: 'rv1', prId: 'pr1' }], []).get('pr1')).toEqual({
      critical: 0,
      warning: 0,
      suggestion: 0,
    });
  });

  it('leaves a never-reviewed PR out of the map', () => {
    expect(openFindingsByPr([], []).has('pr1')).toBe(false);
  });

  it('scopes each PR independently and ignores findings of unknown reviews', () => {
    const out = openFindingsByPr(
      [
        { id: 'a', prId: 'pr1' },
        { id: 'b', prId: 'pr2' },
      ],
      [
        { reviewId: 'a', severity: 'CRITICAL' },
        { reviewId: 'b', severity: 'WARNING' },
        { reviewId: 'zzz', severity: 'CRITICAL' },
      ],
    );
    expect(out.get('pr1')).toEqual({ critical: 1, warning: 0, suggestion: 0 });
    expect(out.get('pr2')).toEqual({ critical: 0, warning: 1, suggestion: 0 });
  });
});

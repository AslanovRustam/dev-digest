/**
 * PR-list FINDINGS rollup (pure — no DB, so it unit-tests cleanly).
 *
 * The list's FINDINGS column counts the PR's open findings across ALL its
 * reviews (every run, every "Run Review" click) — a re-run that happens to
 * find nothing must not hide what earlier runs found. Same scope as the COST
 * column (`cost.ts`) and as the PR page's severity counters.
 */
import type { SeverityCounts } from '@devdigest/shared';
import { rollupSeverities } from './status.js';

/**
 * Per-PR severity counts. `findings` must already exclude dismissed rows.
 * A PR with at least one review gets an entry (all zeros when nothing is open);
 * a PR without reviews is absent (never reviewed → the column shows "—").
 */
export function openFindingsByPr(
  reviews: { id: string; prId: string }[],
  findings: { reviewId: string; severity: string }[],
): Map<string, SeverityCounts> {
  const prOfReview = new Map(reviews.map((rv) => [rv.id, rv.prId]));
  const byPr = new Map<string, { severity: string }[]>();
  for (const rv of reviews) if (!byPr.has(rv.prId)) byPr.set(rv.prId, []);
  for (const f of findings) {
    const prId = prOfReview.get(f.reviewId);
    if (prId) byPr.get(prId)!.push(f);
  }
  const out = new Map<string, SeverityCounts>();
  for (const [prId, rows] of byPr) out.set(prId, rollupSeverities(rows));
  return out;
}

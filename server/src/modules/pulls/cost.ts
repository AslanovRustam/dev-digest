/**
 * PR-list COST rollup (pure — no DB, so it unit-tests cleanly).
 *
 * The list's COST column shows what reviewing the PR has cost SO FAR: the sum
 * over every finished agent run of the PR, across all "Run Review" clicks.
 * Unknown is not $0 — the result is `null` whenever no honest number exists.
 */

export interface RunCostRow {
  prId: string | null;
  status: string | null;
  costUsd: number | null;
}

/**
 * Per-PR total cost of all its runs.
 *
 * - Sums `done` runs with a known cost. A run still `running` is not counted
 *   yet; it joins the total once it finishes.
 * - Failed/cancelled runs carry no cost and never enter the sum.
 * - No priced run at all → `null` (shown as "—", never "$0.00").
 */
export function totalReviewCost(runs: RunCostRow[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const r of runs) {
    if (!r.prId) continue;
    const prev = out.get(r.prId) ?? null;
    if (r.status === 'done' && r.costUsd != null) out.set(r.prId, (prev ?? 0) + r.costUsd);
    else out.set(r.prId, prev);
  }
  return out;
}

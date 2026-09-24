/**
 * PR-list COST rollup (pure — no DB, so it unit-tests cleanly).
 *
 * The list's COST column shows what the LATEST review cost: the sum over every
 * agent run started by one "Run Review" click (runs sharing a `batch_id`).
 * Unknown is not $0 — the result is `null` whenever no honest number exists.
 */

export interface RunCostRow {
  id: string;
  prId: string | null;
  batchId: string | null;
  status: string | null;
  costUsd: number | null;
}

/**
 * Per-PR cost of the latest review batch. `runs` MUST be ordered newest-first.
 *
 * - The newest run picks the batch; a legacy run without `batch_id` is its own batch.
 * - Any run of that batch still `running` → `null` (no half-finished sum).
 * - Otherwise the sum of `done` runs with a known cost; none → `null`.
 *   Failed/cancelled runs carry no cost and never enter the sum.
 */
export function latestReviewCost(runs: RunCostRow[]): Map<string, number | null> {
  // Batch key of each PR's newest run (legacy: the run's own id).
  const latestBatch = new Map<string, string>();
  for (const r of runs) {
    if (r.prId && !latestBatch.has(r.prId)) latestBatch.set(r.prId, r.batchId ?? r.id);
  }

  const acc = new Map<string, { sum: number; priced: boolean; running: boolean }>();
  for (const r of runs) {
    if (!r.prId || latestBatch.get(r.prId) !== (r.batchId ?? r.id)) continue;
    const a = acc.get(r.prId) ?? { sum: 0, priced: false, running: false };
    if (r.status === 'running') a.running = true;
    else if (r.status === 'done' && r.costUsd != null) {
      a.sum += r.costUsd;
      a.priced = true;
    }
    acc.set(r.prId, a);
  }

  const out = new Map<string, number | null>();
  for (const [prId, a] of acc) out.set(prId, a.running || !a.priced ? null : a.sum);
  return out;
}

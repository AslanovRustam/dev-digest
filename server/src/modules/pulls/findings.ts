/**
 * PR-list FINDINGS scope (pure — no DB, so it unit-tests cleanly).
 *
 * The list's FINDINGS column counts the LATEST review, in the same sense as the
 * COST column (`cost.ts`): every review produced by one "Run Review" click —
 * the reviews whose run shares the `batch_id` of the PR's newest run.
 */

export interface ReviewScopeRow {
  id: string;
  prId: string;
  runId: string | null;
}

export interface RunScopeRow {
  id: string;
  prId: string | null;
  batchId: string | null;
}

/**
 * Per-PR review ids of the latest review batch. Both inputs MUST be ordered
 * newest-first, as the route queries them.
 *
 * - The PR's newest run picks the batch; a legacy run without `batch_id` is its own batch.
 * - Fallback: no review belongs to that batch (seeded / legacy reviews without a
 *   `run_id`, or no runs at all) → the PR's newest review alone.
 * - A PR with no reviews is absent from the map (never reviewed).
 */
export function latestReviewIdsByPr(
  reviews: ReviewScopeRow[],
  runs: RunScopeRow[],
): Map<string, string[]> {
  const latestBatch = new Map<string, string>();
  for (const r of runs) {
    if (r.prId && !latestBatch.has(r.prId)) latestBatch.set(r.prId, r.batchId ?? r.id);
  }
  // run id → batch key, for the runs of each PR's latest batch only.
  const batchOfRun = new Map<string, string>();
  for (const r of runs) {
    const key = r.batchId ?? r.id;
    if (r.prId && latestBatch.get(r.prId) === key) batchOfRun.set(r.id, key);
  }

  const inBatch = new Map<string, string[]>();
  const newest = new Map<string, string>();
  for (const rv of reviews) {
    if (!newest.has(rv.prId)) newest.set(rv.prId, rv.id);
    if (rv.runId && batchOfRun.has(rv.runId)) {
      const ids = inBatch.get(rv.prId) ?? [];
      ids.push(rv.id);
      inBatch.set(rv.prId, ids);
    }
  }

  const out = new Map<string, string[]>();
  for (const [prId, id] of newest) out.set(prId, inBatch.get(prId) ?? [id]);
  return out;
}

/**
 * F1 — pulls module constants (extracted from routes.ts; no behaviour change).
 */

/**
 * How many PRs may have their diff stats backfilled in one list request.
 *
 * Diff stats are not on the forge's PR-list payload, so freshly-imported PRs
 * land with zeroed size/diff. Each backfill costs a detail fetch, so the list
 * repairs at most this many per request and the periodic refetch chips away at
 * any remainder.
 */
export const BACKFILL_LIMIT = 10;

/* rates.ts — how the Skills feature shows a 0..1 rate (skill cards + Stats tab).
   A null rate means "no data" (empty denominator), never 0%. */

/** Placeholder for a rate or count with no data. */
export const NO_DATA = "—";

/** 0.714 → "71%"; null/undefined → "—". */
export function formatPct(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return NO_DATA;
  return `${Math.round(rate * 100)}%`;
}

/** Accept-rate tint: ≥70% ok, ≥50% warn, else crit; no data → muted. */
export function acceptRateColor(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return "var(--text-muted)";
  if (rate >= 0.7) return "var(--ok)";
  if (rate >= 0.5) return "var(--warn)";
  return "var(--crit)";
}

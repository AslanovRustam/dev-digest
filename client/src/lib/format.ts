/**
 * Shared number formatters for run usage (L01 run cost). Every surface that
 * shows a run's cost or tokens goes through these, so one run reads the same
 * on the PR list, the timeline, the verdict banner and the trace drawer.
 */

/**
 * USD cost of a run. Real runs cost ~$0.0004–$0.02, so fixed decimals would
 * print almost all of them as "$0.00" — use 3 significant digits instead.
 *
 * - `null`/`undefined` → "—" (unknown: no finished run, unpriced model). Never "$0.00".
 * - `0` → "$0.00" (a genuinely free model).
 * - below $1 → 3 significant digits, trailing zeros trimmed, at least 2 decimals
 *   (0.012 → "$0.012", 0.0013 → "$0.0013", 0.06 → "$0.06", 0.00039347 → "$0.000393").
 * - $1 and above → 2 decimals ("$1.23").
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  // toPrecision switches to exponent notation below 1e-6 — floor the display there.
  if (usd < 0.000001) return "<$0.000001";
  const trimmed = String(Number(usd.toPrecision(3)));
  const decimals = trimmed.split(".")[1]?.length ?? 0;
  return `$${decimals < 2 ? Number(trimmed).toFixed(2) : trimmed}`;
}

/** Compact token count: 640 → "640", 8200 → "8.2K", 15000 → "15K", 1250000 → "1.3M". */
export function formatTokenCount(n: number): string {
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(n);
}

/** Token in→out summary: (8200, 1300) → "8.2K→1.3K". */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
}

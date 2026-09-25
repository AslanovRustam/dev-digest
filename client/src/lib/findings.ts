/**
 * Pure finding helpers shared by the PR list, the run timeline and the PR
 * detail page (severity order, tallies, preview ordering, line labels).
 */
import type { FindingRecord, Severity, SeverityCounts } from "@devdigest/shared";

/** Severities in display order, most severe first. */
export const SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Sort weight per severity (lower = shown first). INFO is UI-only. */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

export type SeverityTallyCounts = Record<Severity, number>;

export function isSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
}

/** Count findings per severity (every level present, 0 when absent). */
export function countBySeverity(findings: Pick<FindingRecord, "severity">[]): SeverityTallyCounts {
  const out: SeverityTallyCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) if (isSeverity(f.severity)) out[f.severity] += 1;
  return out;
}

/** The PR list's lower-case contract counts → the UI's severity keys. */
export function tallyFromCounts(c: SeverityCounts): SeverityTallyCounts {
  return { CRITICAL: c.critical, WARNING: c.warning, SUGGESTION: c.suggestion };
}

export function tallyTotal(t: SeverityTallyCounts): number {
  return t.CRITICAL + t.WARNING + t.SUGGESTION;
}

/** Findings still open — dismissed ones leave the counts and previews. */
export function liveFindings<T extends Pick<FindingRecord, "dismissed_at">>(findings: T[]): T[] {
  return findings.filter((f) => !f.dismissed_at);
}

/** Preview order: severity first, then the most confident finding. */
export function sortForPreview<T extends Pick<FindingRecord, "severity" | "confidence">>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || b.confidence - a.confidence,
  );
}

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/**
 * Markdown rationale → one plain line for a preview. Drops fenced code, keeps the
 * text of inline code / emphasis / links. Single `_` is left alone so identifiers
 * like `sk_live_` survive.
 */
export function plainExcerpt(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

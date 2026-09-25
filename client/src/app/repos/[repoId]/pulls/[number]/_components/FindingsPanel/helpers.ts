import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

export interface FindingsFilter {
  /** Drop findings below `LOW_CONFIDENCE_THRESHOLD`. */
  hideLow?: boolean;
  /** Keep only this severity; null/undefined keeps every level. */
  severity?: Severity | null;
}

/**
 * Apply the page's findings filters (confidence, then severity) and sort by
 * severity. The severity counters are computed from the confidence-filtered
 * list, so a level's count always equals what selecting it shows.
 */
export function visibleFindings(
  findings: FindingRecord[],
  { hideLow = false, severity = null }: FindingsFilter = {},
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

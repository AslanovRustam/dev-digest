import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_HIGH, CONFIDENCE_MID } from "./constants";

/** Bar colour for a 0..1 confidence (ok ≥ 85 %, warn ≥ 65 %, else muted). */
export function confidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_HIGH) return "var(--ok)";
  if (confidence >= CONFIDENCE_MID) return "var(--warn)";
  return "var(--text-muted)";
}

/** `path:start-end` (or `path:line`). */
export function evidenceRef(c: Pick<ConventionCandidate, "evidence_path" | "evidence_start_line" | "evidence_end_line">): string {
  return c.evidence_start_line === c.evidence_end_line
    ? `${c.evidence_path}:${c.evidence_start_line}`
    : `${c.evidence_path}:${c.evidence_start_line}-${c.evidence_end_line}`;
}

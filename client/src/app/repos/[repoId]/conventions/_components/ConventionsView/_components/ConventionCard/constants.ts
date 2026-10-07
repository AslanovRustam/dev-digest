import type { ConventionStatus } from "@devdigest/shared";

/** Confidence bar thresholds — same as the kit's ConfidenceNum. */
export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MID = 0.65;

/** Left accent of a candidate card by triage status. */
export const STATUS_ACCENT: Record<ConventionStatus, string> = {
  pending: "var(--border-strong)",
  accepted: "var(--ok)",
  rejected: "var(--crit)",
};

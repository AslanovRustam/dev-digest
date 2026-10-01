import type { ConventionCategory, ConventionStatus } from "@devdigest/shared";

/** Status filter tabs, in display order. */
export const STATUS_FILTERS = ["pending", "accepted", "rejected", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** "all" = no category filter. */
export type CategoryFilter = ConventionCategory | "all";

/**
 * Every category, in display order. Client code imports `@devdigest/shared`
 * TYPE-only (a value import breaks `next build`), so the enum is mirrored here.
 */
export const CATEGORIES: ConventionCategory[] = [
  "naming",
  "async",
  "error-handling",
  "imports",
  "architecture",
  "typing",
  "testing",
  "style",
  "api",
  "other",
];

/** Confidence bar thresholds — same as the kit's ConfidenceNum. */
export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MID = 0.65;

/** Left accent of a candidate card by triage status. */
export const STATUS_ACCENT: Record<ConventionStatus, string> = {
  pending: "var(--border-strong)",
  accepted: "var(--ok)",
  rejected: "var(--crit)",
};

export const SKELETON_CARDS = 3;

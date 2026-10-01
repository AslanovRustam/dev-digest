import type { ConventionCategory } from "@devdigest/shared";

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

export const SKELETON_CARDS = 3;

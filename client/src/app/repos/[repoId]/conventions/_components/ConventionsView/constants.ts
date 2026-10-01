import type { ConventionCategory } from "@devdigest/shared";

/** Status filter tabs, in display order. */
export const STATUS_FILTERS = ["pending", "accepted", "rejected", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** "all" = no category filter. */
export type CategoryFilter = ConventionCategory | "all";

/**
 * Every category, in display order (key order). Client code imports
 * `@devdigest/shared` TYPE-only (a value import breaks `next build`), so the
 * enum is mirrored here — as a `Record` keyed by the contract type, so a
 * category added to `ConventionCategory` fails `tsc` until it is added here.
 */
const CATEGORY_ORDER = {
  naming: 0,
  async: 1,
  "error-handling": 2,
  imports: 3,
  architecture: 4,
  typing: 5,
  testing: 6,
  style: 7,
  api: 8,
  other: 9,
} satisfies Record<ConventionCategory, number>;

export const CATEGORIES = Object.keys(CATEGORY_ORDER) as ConventionCategory[];

export const SKELETON_CARDS = 3;

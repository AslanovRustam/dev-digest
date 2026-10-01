import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { CATEGORIES, STATUS_FILTERS, type CategoryFilter, type StatusFilter } from "./constants";

/** Candidates visible under the status + category filters. */
export function filterCandidates(
  list: ConventionCandidate[],
  status: StatusFilter,
  category: CategoryFilter,
): ConventionCandidate[] {
  return list.filter(
    (c) => (status === "all" || c.status === status) && (category === "all" || c.category === category),
  );
}

/**
 * What "Create skill" merges: accepted candidates in the current category
 * filter that are not in a skill yet. Filtering by category and creating again
 * yields one skill per area. Rejected or pending ones never qualify.
 */
export function skillCandidates(
  list: ConventionCandidate[],
  category: CategoryFilter,
): ConventionCandidate[] {
  return list.filter(
    (c) => c.status === "accepted" && !c.skill_id && (category === "all" || c.category === category),
  );
}

/** Count per status and per category, for the filter chips. */
export function countBy(list: ConventionCandidate[]) {
  const status = { pending: 0, accepted: 0, rejected: 0, all: list.length };
  const category = new Map<ConventionCategory, number>();
  for (const c of list) {
    status[c.status] += 1;
    category.set(c.category, (category.get(c.category) ?? 0) + 1);
  }
  return { status, category };
}

/** Compact age ("5m", "3h", "2d"), or null when under a minute or unparsable. */
export function compactAge(iso: string, now = Date.now()): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const m = Math.max(0, Math.round((now - then) / 60_000));
  if (m < 1) return null;
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** `?status=` → a known status filter, else "all". */
export function parseStatus(value: string | null): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "") ? (value as StatusFilter) : "all";
}

/** `?category=` → a known category, else "all". */
export function parseCategory(value: string | null): CategoryFilter {
  return (CATEGORIES as string[]).includes(value ?? "") ? (value as CategoryFilter) : "all";
}

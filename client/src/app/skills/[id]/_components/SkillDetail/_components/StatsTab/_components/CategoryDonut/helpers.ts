import { CATEGORY_COLOR, FALLBACK_COLORS } from "./constants";

export interface CategorySlice {
  category: string;
  count: number;
  color: string;
}

/** Non-empty categories, largest first, each with a stable colour. */
export function toSlices(byCategory: { category: string; count: number }[]): CategorySlice[] {
  let fallback = 0;
  return byCategory
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .map((c) => ({
      ...c,
      color: CATEGORY_COLOR[c.category] ?? FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length]!,
    }));
}

/** Known finding categories → token colour. */
export const CATEGORY_COLOR: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "var(--accent)",
  test: "var(--ok)",
  style: "var(--info)",
};

/** Fallback palette for categories outside CATEGORY_COLOR, cycled by index. */
export const FALLBACK_COLORS = ["#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316"] as const;

export const DONUT_SIZE = 132;
export const DONUT_STROKE = 20;

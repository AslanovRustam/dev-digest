import type { CSSProperties } from "react";

/** Co-located styles for RunCostBadge. */
export const s = {
  badge: (variant: "compact" | "full", unknown: boolean): CSSProperties => ({
    fontSize: variant === "compact" ? 12.5 : 11,
    color: unknown || variant === "full" ? "var(--text-muted)" : "var(--text-secondary)",
    whiteSpace: "nowrap",
  }),
} as const;

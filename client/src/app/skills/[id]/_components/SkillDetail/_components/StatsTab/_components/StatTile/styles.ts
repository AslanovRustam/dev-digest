import type { CSSProperties } from "react";

/** Co-located styles for StatTile. */
export const s = {
  top: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 36,
  } satisfies CSSProperties,
  value: (color?: string): CSSProperties => ({
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: color ?? "var(--text-primary)",
    marginTop: 2,
  }),
} as const;

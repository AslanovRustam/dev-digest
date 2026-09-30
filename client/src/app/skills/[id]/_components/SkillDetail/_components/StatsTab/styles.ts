import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 1000 } satisfies CSSProperties,
  tiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  panels: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 12,
    marginTop: 12,
  } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)", marginTop: 14, fontStyle: "italic" } satisfies CSSProperties,
} as const;

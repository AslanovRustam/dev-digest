import type { CSSProperties } from "react";

/** Co-located styles for CategoryDonut. */
export const s = {
  body: { display: "flex", alignItems: "center", gap: 24, marginTop: 12 } satisfies CSSProperties,
  legend: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  legendRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({
    width: 9,
    height: 9,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  legendLabel: { flex: 1, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendCount: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
} as const;

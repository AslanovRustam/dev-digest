import type { CSSProperties } from "react";

export const s = {
  scroll: { overflowX: "auto" } satisfies CSSProperties,
  svg: { display: "block" } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 8,
    paddingLeft: 4,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

export const svgText = {
  fontSize: 11,
  fontFamily: "var(--font-mono, JetBrains Mono, monospace)",
  fill: "var(--text-primary)",
} as const;

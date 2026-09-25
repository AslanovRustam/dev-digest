import type { CSSProperties } from "react";

/** Co-located styles for SeverityTally. */
export const s = {
  row: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  item: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color,
    fontSize: 12.5,
    fontWeight: 600,
    lineHeight: 1.3,
    borderBottom: `1px dotted ${color}`,
    paddingBottom: 1,
  }),
} as const;

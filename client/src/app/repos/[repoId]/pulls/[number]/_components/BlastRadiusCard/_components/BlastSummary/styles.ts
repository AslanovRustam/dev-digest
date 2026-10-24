import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", flexWrap: "wrap", gap: "8px 22px", fontSize: 13 } satisfies CSSProperties,
  stat: { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" } satisfies CSSProperties,
  num: { fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;

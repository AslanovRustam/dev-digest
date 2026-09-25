import type { CSSProperties } from "react";

/** Co-located styles for FindingsCell. */
export const s = {
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  none: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;

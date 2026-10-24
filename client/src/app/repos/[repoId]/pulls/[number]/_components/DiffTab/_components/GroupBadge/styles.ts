import type { CSSProperties } from "react";

const badge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
} satisfies CSSProperties;

const dot = { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 } satisfies CSSProperties;

export const s = { badge, dot };

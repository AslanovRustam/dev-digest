import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 16px" } satisfies CSSProperties,
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: "18px 22px",
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;

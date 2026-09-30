import type { CSSProperties } from "react";

/** Panel chrome shared by the Stats tab's tiles and panels (one look, one place). */
export const panel = {
  box: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
    minWidth: 0,
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "14px 0 4px" } satisfies CSSProperties,
} as const;

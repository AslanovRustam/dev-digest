import type { CSSProperties } from "react";

/** Co-located styles for the create-skill draft form. */
export const s = {
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
  } satisfies CSSProperties,
  // `position: relative` anchors the absolutely-positioned srOnly label.
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    height: 38,
    position: "relative",
    cursor: "pointer",
  } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
} as const;

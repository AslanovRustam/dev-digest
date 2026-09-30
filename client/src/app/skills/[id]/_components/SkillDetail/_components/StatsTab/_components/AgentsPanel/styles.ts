import type { CSSProperties } from "react";

/** Co-located styles for AgentsPanel. */
export const s = {
  list: { listStyle: "none", margin: "10px 0 0", padding: 0 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  icon: (on: boolean): CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    background: on ? "var(--accent-bg)" : "var(--bg-hover)",
    color: on ? "var(--accent)" : "var(--text-muted)",
    flexShrink: 0,
  }),
  name: (on: boolean): CSSProperties => ({
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    color: on ? "var(--text-primary)" : "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  off: { fontSize: 11, padding: "0 7px" } satisfies CSSProperties,
  open: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12.5,
    color: "var(--accent-text)",
    textDecoration: "none",
    fontWeight: 500,
  } satisfies CSSProperties,
} as const;

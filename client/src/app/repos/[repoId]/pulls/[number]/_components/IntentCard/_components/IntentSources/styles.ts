import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    fontSize: 12.5,
  } satisfies CSSProperties,
  kind: { color: "var(--text-muted)", minWidth: 72 } satisfies CSSProperties,
  ref: { fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" } satisfies CSSProperties,
  reason: { color: "var(--text-muted)" } satisfies CSSProperties,
  missingLabel: { color: "var(--text-muted)", fontSize: 12, marginTop: 10 } satisfies CSSProperties,
  missing: {
    margin: "4px 0 0",
    paddingLeft: 18,
    fontSize: 12.5,
    color: "var(--warn)",
  } satisfies CSSProperties,
};

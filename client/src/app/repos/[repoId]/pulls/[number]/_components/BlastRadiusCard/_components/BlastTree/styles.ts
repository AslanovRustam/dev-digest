import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  rowButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 8px",
    background: "none",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    color: "var(--text-primary)",
    textAlign: "left",
    font: "inherit",
  } satisfies CSSProperties,
  chevron: { flexShrink: 0, transition: "transform 120ms", color: "var(--text-muted)" } satisfies CSSProperties,
  chevronOpen: { transform: "rotate(90deg)" } satisfies CSSProperties,
  symbol: { fontWeight: 700, fontSize: 13 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  panel: {
    marginLeft: 16,
    paddingLeft: 14,
    borderLeft: "1px solid var(--border-strong)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 6,
  } satisfies CSSProperties,
  callers: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  caller: { display: "flex", alignItems: "flex-start", gap: 8, color: "var(--text-muted)", minWidth: 0 } satisfies CSSProperties,
  // Keeps the arrow on the first line when a long path wraps.
  callerIcon: { flexShrink: 0, marginTop: 3 } satisfies CSSProperties,
  // minWidth 0 lets the flex item shrink; overflowWrap covers a single segment longer than the card.
  callerLabel: { minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  callerText: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,
} as const;

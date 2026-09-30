import type { CSSProperties } from "react";

/** Co-located styles for the SkillDetail shell. */
export const s = {
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "18px 28px 0",
    flexShrink: 0,
    minWidth: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 20,
    fontWeight: 700,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  tabsBar: { marginTop: 14, flexShrink: 0 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 28 } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

/** Co-located styles for SkillsWorkspace (master/detail, like /agents/[id]). */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  pane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
} as const;

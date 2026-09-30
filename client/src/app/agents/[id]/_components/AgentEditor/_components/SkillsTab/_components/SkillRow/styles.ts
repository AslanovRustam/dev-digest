import type { CSSProperties } from "react";

/** Co-located styles for one SkillsTab row. */
export const s = {
  row: ({
    checked,
    dimmed,
    dragging,
    over,
  }: {
    checked: boolean;
    dimmed: boolean;
    dragging: boolean;
    over: boolean;
  }): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (over ? "var(--accent)" : checked ? "var(--border-strong)" : "var(--border)"),
    background: checked ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.4 : dimmed ? 0.55 : 1,
    transition: "border-color 120ms, background 120ms",
  }),
  handle: (reorderable: boolean): CSSProperties => ({
    display: "inline-flex",
    padding: 2,
    border: "none",
    background: "transparent",
    borderRadius: 4,
    color: "var(--text-muted)",
    cursor: reorderable ? "grab" : "default",
    opacity: reorderable ? 1 : 0.35,
    flexShrink: 0,
  }),
  name: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  globalNote: { fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  badge: { marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
} as const;

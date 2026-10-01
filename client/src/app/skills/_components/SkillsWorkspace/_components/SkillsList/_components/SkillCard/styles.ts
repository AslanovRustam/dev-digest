import type { CSSProperties } from "react";

/** Co-located styles for SkillCard (selected/disabled mirror AgentCard). */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 12,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    boxShadow: active ? "0 0 0 1px var(--accent-bg)" : undefined,
    opacity: enabled ? 1 : 0.55,
    marginBottom: 10,
    outlineOffset: 2,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  deleteBtn: {
    background: "none",
    border: "none",
    padding: 4,
    margin: -4,
    display: "inline-flex",
    cursor: "pointer",
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 13,
    fontWeight: 700,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  // `position: relative` anchors the absolutely-positioned srOnly label here.
  // Without it the label's containing block is the page, so labels of cards
  // below the fold escape the list's scroll box and lengthen the document.
  toggleWrap: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    position: "relative",
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
  description: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  divider: { height: 1, background: "var(--border)", margin: "10px 0 8px" } satisfies CSSProperties,
  footer: {
    display: "flex",
    gap: 12,
    fontSize: 11.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  acceptValue: (color: string): CSSProperties => ({ color, fontWeight: 600 }),
} as const;

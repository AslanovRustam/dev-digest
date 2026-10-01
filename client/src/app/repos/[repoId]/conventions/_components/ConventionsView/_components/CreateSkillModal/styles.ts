import type { CSSProperties } from "react";

/** Co-located styles for the "Create skill from conventions" modal. */
export const s = {
  body: { padding: "20px 24px 4px" } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 20,
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent-text)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  accent: { color: "var(--accent-text)" } satisfies CSSProperties,
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
  loading: { display: "flex", flexDirection: "column", gap: 14, paddingBottom: 20 } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  savedAs: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;

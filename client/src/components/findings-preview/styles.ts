import type { CSSProperties } from "react";

/** Co-located styles for FindingsPreviewList. */
export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 14px 8px",
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    maxHeight: 360,
    overflowY: "auto",
  } satisfies CSSProperties,
  item: {
    padding: "10px 14px 12px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  sevIcon: (color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: 5,
    color,
    background: bg,
    flexShrink: 0,
  }),
  title: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 5,
  } satisfies CSSProperties,
  excerpt: {
    margin: "6px 0 0",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  state: {
    padding: "12px 14px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

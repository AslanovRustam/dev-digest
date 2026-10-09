import type { CSSProperties } from "react";

const scopeLabel = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 8,
} satisfies CSSProperties;

const scopeItem = { display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1.45 } satisfies CSSProperties;

/** Small bullet dot; `translateY` centres it on the first text line (items are baseline-aligned). */
const dot = {
  flex: "0 0 auto",
  width: 4,
  height: 4,
  borderRadius: "50%",
  transform: "translateY(-3px)",
} satisfies CSSProperties;

export const s = {
  wrap: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  summary: {
    margin: 0,
    paddingLeft: 12,
    borderLeft: "3px solid var(--accent)",
    fontSize: 13.5,
    lineHeight: 1.5,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontSize: 13,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  scopeLabelIn: { ...scopeLabel, color: "var(--ok)" } satisfies CSSProperties,
  scopeLabelOut: { ...scopeLabel, color: "var(--text-muted)" } satisfies CSSProperties,
  itemIn: { ...scopeItem, color: "var(--text-primary)" } satisfies CSSProperties,
  itemOut: { ...scopeItem, color: "var(--text-muted)" } satisfies CSSProperties,
  dotIn: { ...dot, background: "var(--ok)" } satisfies CSSProperties,
  dotOut: { ...dot, background: "var(--text-muted)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-start",
  } satisfies CSSProperties,
};

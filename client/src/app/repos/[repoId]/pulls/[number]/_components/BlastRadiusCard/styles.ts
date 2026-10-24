import type { CSSProperties } from "react";

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
  title: {
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
  summaryRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  toggle: {
    marginLeft: "auto",
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
  } satisfies CSSProperties,
  toggleButton: {
    padding: "3px 10px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    textTransform: "capitalize",
    background: "transparent",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggleButtonActive: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;

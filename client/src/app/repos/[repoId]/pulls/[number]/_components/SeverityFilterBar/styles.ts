import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilterBar. */
export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  } satisfies CSSProperties,
  levels: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  sep: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  level: (color: string, bg: string, active: boolean, dimmed: boolean, disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: active ? color : "transparent",
    background: active ? bg : "transparent",
    color,
    opacity: dimmed ? 0.45 : 1,
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    cursor: disabled ? "default" : "pointer",
    transition: "background .12s, border-color .12s, opacity .12s",
  }),
  toggleGroup: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;

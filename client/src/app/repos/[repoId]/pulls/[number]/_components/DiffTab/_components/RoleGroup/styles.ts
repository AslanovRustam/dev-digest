import type { CSSProperties } from "react";

const header = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 4px",
  background: "var(--bg-primary)",
  border: "none",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
} satisfies CSSProperties;

const count = { fontSize: 12, fontWeight: 400, color: "var(--text-muted)" } satisfies CSSProperties;

const hint = {
  fontSize: 12,
  fontWeight: 400,
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
} satisfies CSSProperties;

const spacer = { flex: 1 } satisfies CSSProperties;

/** Small coloured square that identifies the role. */
export function roleSquare(color: string): CSSProperties {
  return { width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 };
}

const body = { marginTop: 8 } satisfies CSSProperties;

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

export const s = { header, count, hint, spacer, body };

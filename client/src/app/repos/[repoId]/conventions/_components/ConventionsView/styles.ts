import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page body. */
export const s = {
  wrap: { maxWidth: 1040, margin: "0 auto", padding: "28px 32px 56px" } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  filters: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  } satisfies CSSProperties,
  divider: { width: 1, height: 20, background: "var(--border)", margin: "0 4px" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  noMatch: { fontSize: 13, color: "var(--text-muted)", padding: "24px 0", textAlign: "center" } satisfies CSSProperties,
  emptyCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;

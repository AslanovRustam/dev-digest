import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page header. */
export const s = {
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  gate: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
} as const;

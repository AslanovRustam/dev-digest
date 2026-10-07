import type { CSSProperties } from "react";

/** Co-located styles for DeleteSkillModal. */
export const s = {
  body: { padding: "18px 24px", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" } satisfies CSSProperties,
  name: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  warning: {
    marginTop: 12,
    padding: "8px 12px",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" } satisfies CSSProperties,
} as const;

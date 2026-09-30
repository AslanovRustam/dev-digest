import type { CSSProperties } from "react";

/** Co-located styles for NewSkillPane (matches the SkillDetail header). */
export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "18px 28px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 28 } satisfies CSSProperties,
} as const;

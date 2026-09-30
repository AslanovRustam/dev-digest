import type { CSSProperties } from "react";

/** Co-located styles for SkillsIndexPane. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center" } satisfies CSSProperties,
  // Pull the buttons up into EmptyState's 60px bottom padding so they sit under its body text.
  actions: { display: "flex", gap: 10, marginTop: -40 } satisfies CSSProperties,
} as const;

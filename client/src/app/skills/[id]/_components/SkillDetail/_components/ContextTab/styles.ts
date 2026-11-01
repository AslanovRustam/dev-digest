import type { CSSProperties } from "react";

/** Co-located styles for the skill ContextTab's loading state. */
export const s = {
  skeletons: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;

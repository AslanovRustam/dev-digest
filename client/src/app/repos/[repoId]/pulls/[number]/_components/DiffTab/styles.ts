import type { CSSProperties } from "react";

const toolbar = { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties;

const notRun = {
  fontSize: 12,
  color: "var(--text-muted)",
  margin: "0 0 10px",
} satisfies CSSProperties;

const groups = { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties;

export const s = { toolbar, notRun, groups };

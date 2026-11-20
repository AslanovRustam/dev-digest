import type { CSSProperties } from "react";

/** Co-located styles for DocumentPreview (the header is shared: `paneHeader` in ContextView/styles). */
export const s = {
  meta: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  metaItem: { display: "inline-flex", alignItems: "center", gap: 5 } satisfies CSSProperties,
  body: { padding: "22px 28px 40px", maxWidth: 820, fontSize: 14 } satisfies CSSProperties,
  skeletons: { padding: "22px 28px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  note: { padding: "22px 28px", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

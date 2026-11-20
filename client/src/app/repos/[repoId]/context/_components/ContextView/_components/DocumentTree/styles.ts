import type { CSSProperties } from "react";

/** Co-located styles for DocumentTree. */
export const s = {
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: (opts: { depth: number; selected: boolean; folder: boolean }): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 7,
    width: "100%",
    padding: `5px 10px 5px ${10 + opts.depth * 14}px`,
    borderRadius: 6,
    border: "none",
    background: opts.selected ? "var(--bg-hover)" : "transparent",
    color: opts.selected ? "var(--text-primary)" : opts.folder ? "var(--text-secondary)" : "var(--text-primary)",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  }),
  icon: (selected: boolean): CSSProperties => ({
    flexShrink: 0,
    color: selected ? "var(--accent)" : "var(--text-muted)",
  }),
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;

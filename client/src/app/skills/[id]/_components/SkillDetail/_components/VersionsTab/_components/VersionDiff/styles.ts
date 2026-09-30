import type { CSSProperties } from "react";
import type { DiffLine } from "./helpers";

const LINE: Record<DiffLine["kind"], CSSProperties> = {
  same: { color: "var(--text-secondary)" },
  add: { color: "var(--code-add-text)", background: "var(--code-add)" },
  del: { color: "var(--code-del-text)", background: "var(--code-del)" },
};

/** Co-located styles for VersionDiff. */
export const s = {
  panel: {
    margin: "10px 0 0",
    padding: "8px 0",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--code-bg)",
    fontSize: 12.5,
    lineHeight: "19px",
    maxHeight: 360,
    overflow: "auto",
  } satisfies CSSProperties,
  line: (kind: DiffLine["kind"]): CSSProperties => ({ padding: "0 12px", whiteSpace: "pre", ...LINE[kind] }),
  sign: { display: "inline-block", width: 16, userSelect: "none" } satisfies CSSProperties,
  same: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
} as const;

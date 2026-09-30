import type { CSSProperties } from "react";
import { EDITOR_PAD, LINE_HEIGHT } from "./constants";

const height = (rows: number) => rows * LINE_HEIGHT + EDITOR_PAD * 2;

/** Co-located styles for BodyEditor. Gutter and textarea share font metrics. */
export const s = {
  panel: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--code-bg)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  fileName: {
    fontSize: 12.5,
    color: "var(--text-primary)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  unsaved: { fontSize: 11, padding: "0 7px" } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  body: { display: "flex", alignItems: "stretch" } satisfies CSSProperties,
  gutter: (rows: number): CSSProperties => ({
    margin: 0,
    // Extra bottom room so the gutter can scroll as far as a textarea that has a horizontal scrollbar.
    padding: `${EDITOR_PAD}px 10px ${EDITOR_PAD + 16}px 12px`,
    height: height(rows),
    minWidth: 44,
    overflow: "hidden",
    textAlign: "right",
    fontSize: 12.5,
    lineHeight: `${LINE_HEIGHT}px`,
    color: "var(--text-muted)",
    borderRight: "1px solid var(--border)",
    userSelect: "none",
    flexShrink: 0,
  }),
  textarea: (rows: number): CSSProperties => ({
    flex: 1,
    minWidth: 0,
    height: height(rows),
    margin: 0,
    padding: `${EDITOR_PAD}px 14px`,
    border: "none",
    outline: "none",
    resize: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 12.5,
    lineHeight: `${LINE_HEIGHT}px`,
    whiteSpace: "pre",
    overflow: "auto",
    tabSize: 2,
  }),
} as const;

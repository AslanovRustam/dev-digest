import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";
import { STATUS_ACCENT } from "./constants";

/** Co-located styles for a convention candidate card. */
export const s = {
  card: (status: ConventionStatus): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 180px",
    gap: 18,
    padding: "18px 20px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${STATUS_ACCENT[status]}`,
    borderRadius: 10,
    opacity: status === "rejected" ? 0.72 : 1,
    transition: "opacity .15s, border-color .15s",
  }),
  main: { minWidth: 0, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  rule: {
    fontSize: 15.5,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.4,
    margin: 0,
  } satisfies CSSProperties,
  meta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 } satisfies CSSProperties,
  skillLink: { display: "inline-flex" } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--code-bg)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 6px 4px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  evidenceRefPlain: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  code: {
    margin: 0,
    padding: "12px 14px",
    fontSize: 12.5,
    lineHeight: 1.6,
    overflowX: "auto",
    whiteSpace: "pre",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  confidence: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  bar: { width: 110 } satisfies CSSProperties,
  pct: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  editGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 200px",
    gap: 12,
    alignItems: "start",
  } satisfies CSSProperties,
  editLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  editActions: { gridColumn: "1 / -1", display: "flex", gap: 8 } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

const label = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--text-muted)",
} satisfies CSSProperties;

const reset = { margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties;

const refButton = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 12,
  color: "var(--accent-text)",
  textAlign: "left",
} satisfies CSSProperties;

export const s = {
  wrap: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  verdictRow: { display: "flex", alignItems: "flex-start", gap: 14 } satisfies CSSProperties,
  verdictIcon: (bg: string, color: string): CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: bg,
    color,
    flexShrink: 0,
  }),
  verdictMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  verdictTitle: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  verdictLabel: (color: string): CSSProperties => ({ fontWeight: 700, fontSize: 15, color }),
  scoreCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } satisfies CSSProperties,
  scoreLabel: { ...label, fontSize: 10 } satisfies CSSProperties,
  summary: { margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--text-primary)" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
  errorRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", fontSize: 13 } satisfies CSSProperties,
  skeleton: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  empty: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" } satisfies CSSProperties,
  missingList: { ...reset, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  // RiskAreas
  section: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", gap: 8, ...label } satisfies CSSProperties,
  list: { ...reset, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  risk: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  riskHead: { display: "flex", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  riskTitle: { flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  severityText: (color: string): CSSProperties => ({ fontSize: 11, fontWeight: 600, color }),
  refs: { display: "flex", flexWrap: "wrap", gap: "2px 12px" } satisfies CSSProperties,
  refButton,
  expandButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "grid",
    placeItems: "center",
    padding: 2,
  } satisfies CSSProperties,
  explanation: { margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  // ReviewFocus
  // Fixed-width ref column keeps every reason starting at the same x; long paths ellipsize.
  focusRow: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, lineHeight: 1.5 } satisfies CSSProperties,
  focusRef: {
    flex: "0 1 45%",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  focusReason: { color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;

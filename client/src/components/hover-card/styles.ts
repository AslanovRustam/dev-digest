import type { CSSProperties } from "react";
import type { CardPlacement } from "./helpers";

/** Co-located styles for HoverCard — the panel mirrors `Dropdown`'s. */
export const s = {
  trigger: (clickable: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 4,
    cursor: clickable ? "pointer" : "default",
    outlineOffset: 2,
  }),
  card: (place: CardPlacement | null, width: number): CSSProperties => ({
    position: "fixed",
    top: place?.top ?? 0,
    left: place?.left ?? 0,
    // Measured first, shown once placed — no flash at the viewport corner.
    visibility: place ? "visible" : "hidden",
    width,
    maxWidth: "calc(100vw - 16px)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    zIndex: 60,
    animation: "ddpop .12s ease",
    cursor: "default",
  }),
} as const;

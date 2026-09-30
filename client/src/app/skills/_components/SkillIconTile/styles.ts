import type { CSSProperties } from "react";

/** Co-located styles for SkillIconTile. */
export const s = {
  tile: (size: number, color: string, bg: string): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.27),
    background: bg,
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
} as const;

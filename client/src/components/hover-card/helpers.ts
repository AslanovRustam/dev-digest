import { TRIGGER_GAP, VIEWPORT_MARGIN } from "./constants";

export interface CardPlacement {
  top: number;
  left: number;
  side: "below" | "above";
}

/**
 * Viewport (position: fixed) coordinates for a card anchored to a trigger:
 * below it by default, flipped above when it would overflow the bottom edge and
 * there is room on top; the left edge is clamped inside the viewport.
 */
export function placeCard(
  anchor: { top: number; bottom: number; left: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): CardPlacement {
  const below = anchor.bottom + TRIGGER_GAP;
  const above = anchor.top - TRIGGER_GAP - card.height;
  const fitsBelow = below + card.height <= viewport.height - VIEWPORT_MARGIN;
  const side = fitsBelow || above < VIEWPORT_MARGIN ? "below" : "above";
  const maxLeft = viewport.width - card.width - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, maxLeft));
  return { top: side === "below" ? below : above, left, side };
}

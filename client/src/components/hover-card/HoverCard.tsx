/* HoverCard — a rich tooltip anchored to a trigger. Opens on hover or keyboard
   focus after a short delay, stays open while the pointer is inside the card,
   and closes on leave, Escape, blur, scroll or resize.

   The card is portalled to <body> with fixed positioning so an ancestor's
   `overflow: hidden` (e.g. the PR table card) cannot clip it. React still
   bubbles portal events through the component tree, so clicks inside the card
   are stopped here — otherwise they would reach a clickable row behind it. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { CLOSE_DELAY_MS, DEFAULT_WIDTH, OPEN_DELAY_MS } from "./constants";
import { placeCard, type CardPlacement } from "./helpers";
import { s } from "./styles";

export function HoverCard({
  trigger,
  children,
  width = DEFAULT_WIDTH,
  onOpenChange,
  onTriggerClick,
  triggerLabel,
}: {
  trigger: React.ReactNode;
  /** Card content; rendered only while open. */
  children: React.ReactNode;
  width?: number;
  /** Fires when the card opens or closes (e.g. to fetch its content lazily). */
  onOpenChange?: (open: boolean) => void;
  /** Makes the trigger a button (click / Enter / Space). */
  onTriggerClick?: () => void;
  /** Accessible name for the trigger. */
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [place, setPlace] = React.useState<CardPlacement | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardId = React.useId();

  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onOpenChangeRef.current?.(open);
  }, [open]);

  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const schedule = React.useCallback(
    (next: boolean) => {
      cancel();
      timer.current = setTimeout(() => setOpen(next), next ? OPEN_DELAY_MS : CLOSE_DELAY_MS);
    },
    [cancel],
  );
  const close = React.useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);
  React.useEffect(() => cancel, [cancel]);

  // Place after every render while open: the content may grow (loading → list).
  React.useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const anchor = triggerRef.current?.getBoundingClientRect();
    const card = cardRef.current;
    if (!anchor || !card) return;
    const next = placeCard(
      anchor,
      { width: card.offsetWidth, height: card.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPlace((p) => (p && p.top === next.top && p.left === next.left ? p : next));
  });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Fixed card + scrolling page = detached card. Scrolling inside the card is fine.
    const onScroll = (e: Event) => {
      if (cardRef.current && e.target instanceof Node && cardRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  const clickable = !!onTriggerClick;
  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        role={clickable ? "button" : undefined}
        aria-label={triggerLabel}
        aria-describedby={open ? cardId : undefined}
        onMouseEnter={() => schedule(true)}
        onMouseLeave={() => schedule(false)}
        onFocus={() => schedule(true)}
        onBlur={() => schedule(false)}
        onClick={(e) => {
          e.stopPropagation();
          onTriggerClick?.();
        }}
        onKeyDown={(e) => {
          if (clickable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            e.stopPropagation();
            onTriggerClick?.();
          }
        }}
        style={s.trigger(clickable)}
      >
        {trigger}
      </span>
      {open &&
        createPortal(
          <div
            ref={cardRef}
            id={cardId}
            role="tooltip"
            onMouseEnter={cancel}
            onMouseLeave={() => schedule(false)}
            onFocus={cancel}
            onBlur={() => schedule(false)}
            onClick={(e) => e.stopPropagation()}
            style={s.card(place, width)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export default HoverCard;

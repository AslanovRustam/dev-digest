/** HoverCard — delayed open on hover/focus, portalled card, and every close path. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { HoverCard } from "./HoverCard";
import { OPEN_DELAY_MS, CLOSE_DELAY_MS } from "./constants";
import { placeCard } from "./helpers";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderCard(props: Partial<React.ComponentProps<typeof HoverCard>> = {}) {
  return render(
    <div data-testid="host">
      <HoverCard trigger={<span>2 critical</span>} {...props}>
        <p>card body</p>
      </HoverCard>
    </div>,
  );
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("HoverCard", () => {
  it("opens only after the hover delay, portalled outside the host", () => {
    renderCard();
    fireEvent.mouseEnter(screen.getByText("2 critical"));
    advance(OPEN_DELAY_MS - 1);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    advance(1);
    const card = screen.getByRole("tooltip");
    expect(card).toHaveTextContent("card body");
    expect(screen.getByTestId("host")).not.toContainElement(card);
  });

  it("ignores a drive-by pass shorter than the delay", () => {
    renderCard();
    const trigger = screen.getByText("2 critical");
    fireEvent.mouseEnter(trigger);
    advance(OPEN_DELAY_MS / 2);
    fireEvent.mouseLeave(trigger);
    advance(OPEN_DELAY_MS);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("stays open while the pointer moves into the card, closes after leaving it", () => {
    renderCard();
    const trigger = screen.getByText("2 critical");
    fireEvent.mouseEnter(trigger);
    advance(OPEN_DELAY_MS);
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(screen.getByRole("tooltip"));
    advance(CLOSE_DELAY_MS * 2);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole("tooltip"));
    advance(CLOSE_DELAY_MS);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and closes on Escape", () => {
    renderCard();
    fireEvent.focus(screen.getByText("2 critical").parentElement!);
    advance(OPEN_DELAY_MS);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("reports open/close and keeps trigger clicks from reaching the row behind it", () => {
    const onOpenChange = vi.fn();
    const onTriggerClick = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <HoverCard trigger={<span>counts</span>} onOpenChange={onOpenChange} onTriggerClick={onTriggerClick}>
          <p>card body</p>
        </HoverCard>
      </div>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);
    advance(OPEN_DELAY_MS);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("card body")); // portal events bubble through React
    expect(onTriggerClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe("placeCard", () => {
  const viewport = { width: 1000, height: 800 };
  const card = { width: 380, height: 300 };

  it("sits below the trigger when it fits", () => {
    expect(placeCard({ top: 100, bottom: 120, left: 200 }, card, viewport)).toEqual({
      top: 126,
      left: 200,
      side: "below",
    });
  });

  it("flips above near the bottom edge", () => {
    const p = placeCard({ top: 700, bottom: 720, left: 200 }, card, viewport);
    expect(p.side).toBe("above");
    expect(p.top).toBe(700 - 6 - 300);
  });

  it("clamps the left edge inside the viewport", () => {
    expect(placeCard({ top: 100, bottom: 120, left: 900 }, card, viewport).left).toBe(1000 - 380 - 8);
  });
});

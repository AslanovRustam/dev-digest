/** SeverityFilterBar — "N LEVEL" counters as a single-select filter + the confidence toggle. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFilterBar } from "./SeverityFilterBar";

afterEach(cleanup);

const COUNTS = { CRITICAL: 3, WARNING: 5, SUGGESTION: 0 };

function renderBar(value: Severity | null = null) {
  const onChange = vi.fn();
  const onHideLowChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityFilterBar
        counts={COUNTS}
        value={value}
        onChange={onChange}
        hideLow={false}
        onHideLowChange={onHideLowChange}
      />
    </NextIntlClientProvider>,
  );
  return { onChange, onHideLowChange };
}

const level = (name: RegExp) => screen.getByRole("button", { name });

describe("SeverityFilterBar", () => {
  it("shows a count per level", () => {
    renderBar();
    expect(level(/3 CRITICAL/)).toHaveAttribute("aria-pressed", "false");
    expect(level(/5 WARNING/)).toBeInTheDocument();
    expect(level(/0 SUGGESTION/)).toBeInTheDocument();
  });

  it("selects a level on click", () => {
    const { onChange } = renderBar();
    fireEvent.click(level(/5 WARNING/));
    expect(onChange).toHaveBeenCalledWith("WARNING");
  });

  it("clears the filter when the active level is clicked again", () => {
    const { onChange } = renderBar("CRITICAL");
    expect(level(/3 CRITICAL/)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(level(/3 CRITICAL/));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("disables a level with no findings", () => {
    const { onChange } = renderBar();
    expect(level(/0 SUGGESTION/)).toBeDisabled();
    fireEvent.click(level(/0 SUGGESTION/));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hosts the page-wide low-confidence toggle", () => {
    const { onHideLowChange } = renderBar();
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(onHideLowChange).toHaveBeenCalledWith(true);
  });
});

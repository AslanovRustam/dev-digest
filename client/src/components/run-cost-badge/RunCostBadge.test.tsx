import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("compact shows the cost only", () => {
    render(<RunCostBadge variant="compact" costUsd={0.012} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent(/^\$0\.012$/);
  });

  it("full shows cost · in→out", () => {
    render(<RunCostBadge variant="full" costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.014 · 8.2K→1.3K");
  });

  it("full without token usage falls back to the cost only", () => {
    render(<RunCostBadge variant="full" costUsd={0.014} tokensIn={0} tokensOut={0} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent(/^\$0\.014$/);
  });

  it("unknown cost renders a dash, never $0.00", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent("—");
  });
});

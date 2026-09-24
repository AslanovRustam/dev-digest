/**
 * Run-usage formatters (L01 run cost). Pinned against real run costs
 * ($0.0004–$0.02) and the mockup values, so no surface ever prints "$0.00"
 * for a cheap-but-paid run or a price for an unknown one.
 */
import { describe, it, expect } from "vitest";
import { formatCost, formatTokens, formatTokenCount } from "./format";

describe("formatCost", () => {
  it("unknown cost is a dash, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("a genuinely free run is $0.00", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("sub-dollar costs keep 3 significant digits, trailing zeros trimmed", () => {
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.00039347)).toBe("$0.000393");
    expect(formatCost(0.041)).toBe("$0.041");
  });

  it("keeps at least two decimals", () => {
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.5)).toBe("$0.50");
    expect(formatCost(0.9999)).toBe("$1.00");
  });

  it("dollar-and-up costs use two decimals", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(12)).toBe("$12.00");
  });

  it("floors the display for sub-micro-dollar costs", () => {
    expect(formatCost(0.0000001)).toBe("<$0.000001");
  });

  it("reproduces the mockup values", () => {
    const list = [0.014, 0.041, 0.003, 0.028, 0.012, 0.022].map(formatCost);
    expect(list).toEqual(["$0.014", "$0.041", "$0.003", "$0.028", "$0.012", "$0.022"]);
    expect([0.0013, 0.0014, 0.0012].map(formatCost)).toEqual(["$0.0013", "$0.0014", "$0.0012"]);
  });
});

describe("formatTokens", () => {
  it("compacts counts with K / M suffixes", () => {
    expect(formatTokenCount(640)).toBe("640");
    expect(formatTokenCount(8200)).toBe("8.2K");
    expect(formatTokenCount(15000)).toBe("15K");
    expect(formatTokenCount(1_250_000)).toBe("1.3M");
  });

  it("renders in→out", () => {
    expect(formatTokens(8200, 1300)).toBe("8.2K→1.3K");
    expect(formatTokens(15000, 1200)).toBe("15K→1.2K");
    expect(formatTokens(640, 90)).toBe("640→90");
  });
});

import { describe, it, expect } from "vitest";
import { acceptRateColor, formatPct } from "./rates";

describe("formatPct", () => {
  it("rounds a 0..1 rate to a whole percent and shows — for no data", () => {
    expect(formatPct(0.714)).toBe("71%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
  });
});

describe("acceptRateColor", () => {
  it("tints by threshold", () => {
    expect(acceptRateColor(0.74)).toBe("var(--ok)");
    expect(acceptRateColor(0.7)).toBe("var(--ok)");
    expect(acceptRateColor(0.55)).toBe("var(--warn)");
    expect(acceptRateColor(0.2)).toBe("var(--crit)");
    expect(acceptRateColor(null)).toBe("var(--text-muted)");
  });
});

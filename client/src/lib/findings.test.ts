/** lib/findings — severity tallies, preview ordering and the rationale excerpt. */
import { describe, it, expect } from "vitest";
import { finding } from "@/test/findings-fixture";
import {
  countBySeverity,
  isSeverity,
  lineLabel,
  liveFindings,
  plainExcerpt,
  sortForPreview,
  tallyFromCounts,
  tallyTotal,
} from "./findings";

describe("countBySeverity", () => {
  it("counts every level, zero when absent", () => {
    const out = countBySeverity([
      finding({ severity: "CRITICAL" }),
      finding({ severity: "CRITICAL" }),
      finding({ severity: "SUGGESTION" }),
    ]);
    expect(out).toEqual({ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 });
    expect(tallyTotal(out)).toBe(3);
  });
});

describe("tallyFromCounts", () => {
  it("maps the list contract's lower-case keys", () => {
    expect(tallyFromCounts({ critical: 1, warning: 2, suggestion: 3 })).toEqual({
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: 3,
    });
  });
});

describe("isSeverity", () => {
  it("accepts contract severities only", () => {
    expect(isSeverity("WARNING")).toBe(true);
    expect(isSeverity("warning")).toBe(false);
    expect(isSeverity("INFO")).toBe(false);
    expect(isSeverity(null)).toBe(false);
  });
});

describe("liveFindings", () => {
  it("drops dismissed findings", () => {
    const open = finding();
    expect(liveFindings([open, finding({ dismissed_at: "2026-09-25T10:00:00Z" })])).toEqual([open]);
  });
});

describe("sortForPreview", () => {
  it("orders by severity, then by confidence", () => {
    const sugg = finding({ severity: "SUGGESTION", confidence: 0.99 });
    const critLow = finding({ severity: "CRITICAL", confidence: 0.7 });
    const critHigh = finding({ severity: "CRITICAL", confidence: 0.98 });
    const warn = finding({ severity: "WARNING", confidence: 0.5 });
    expect(sortForPreview([sugg, critLow, warn, critHigh])).toEqual([critHigh, critLow, warn, sugg]);
  });
});

describe("lineLabel", () => {
  it("shows a single line or a range", () => {
    expect(lineLabel({ start_line: 12, end_line: 12 })).toBe("12");
    expect(lineLabel({ start_line: 61, end_line: 74 })).toBe("61-74");
  });
});

describe("plainExcerpt", () => {
  it("strips markdown but keeps identifiers with underscores", () => {
    expect(plainExcerpt("Line 12 has `sk_live_` — a **secret key**.\n\nSee [docs](https://x.y).")).toBe(
      "Line 12 has sk_live_ — a secret key. See docs.",
    );
  });

  it("drops fenced code and list markers", () => {
    expect(plainExcerpt("- first\n- second\n```ts\nconst a = 1;\n```\n# Title")).toBe("first second Title");
  });
});

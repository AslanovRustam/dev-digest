// No model calls: the judge's reply is re-keyed to the case's own practice list, so per-practice
// stats never split on a reworded echo and the score's denominator is the case's practice count.
import { describe, expect, it } from "vitest";
import { alignResults } from "./llm-judge.js";

const P = ["moment is reported as unused (or marks the finding unverified)", "uses pnpm in server", "no monorepo advice"];

describe("alignResults", () => {
  it("keeps the case's wording when the judge rewords a practice (seen 2026-11-22)", () => {
    const out = alignResults(P, [
      { practice: P[0].replace("the finding", "it"), passed: true, evidence: "q1" },
      { practice: P[1], passed: false, evidence: "" },
      { practice: P[2], passed: true, evidence: "q3" },
    ]);
    expect(out.map((r) => r.practice)).toEqual(P);
    expect(out.map((r) => r.passed)).toEqual([true, false, true]);
  });

  it("matches by text before position when the judge reorders", () => {
    const out = alignResults(P, [
      { practice: P[2], passed: true, evidence: "q3" },
      { practice: P[0], passed: false, evidence: "" },
      { practice: P[1], passed: true, evidence: "q2" },
    ]);
    expect(out.map((r) => r.passed)).toEqual([false, true, true]);
  });

  it("a practice the judge skipped is a FAIL, and the list length is always the case's", () => {
    const out = alignResults(P, [{ practice: P[0], passed: true, evidence: "q1" }]);
    expect(out).toHaveLength(3);
    expect(out[1].passed).toBe(false);
    expect(out[2].evidence).toMatch(/not judged/);
  });

  it("only a literal true passes", () => {
    const out = alignResults([P[0]], [{ practice: P[0], passed: "true" as unknown as boolean, evidence: "" }]);
    expect(out[0].passed).toBe(false);
  });
});

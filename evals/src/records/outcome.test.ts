// No model calls: how a record's `outcome` is decided — the number eval:repeat / eval:delta /
// eval:benchmark aggregate. A workflow case must be judged by its own assertion, not by whether
// the session happened to end without error.
import { describe, expect, it } from "vitest";
import { decideOutcome } from "./record.js";

describe("decideOutcome", () => {
  it("a failed grounding gate is a failure, whatever else happened", () => {
    expect(decideOutcome({ grounded: 0.5, verdict: { score: 1 }, threshold: 0.6, isError: false })).toBe(false);
  });

  it("a judged case passes on score ≥ threshold", () => {
    expect(decideOutcome({ verdict: { score: 0.6 }, threshold: 0.6, isError: true })).toBe(true);
    expect(decideOutcome({ verdict: { score: 0.5 }, threshold: 0.6, isError: false })).toBe(false);
  });

  it("a trace-asserted case uses its own result even when the session hit maxTurns", () => {
    // the 2026-11-22 activation case: skill engaged (passed), then max turns → isError
    expect(decideOutcome({ passed: true, isError: true })).toBe(true);
    expect(decideOutcome({ passed: false, isError: false })).toBe(false);
  });

  it("with nothing else to go on, falls back to 'the session ended without error'", () => {
    expect(decideOutcome({ isError: false })).toBe(true);
    expect(decideOutcome({ isError: true })).toBe(false);
  });
});

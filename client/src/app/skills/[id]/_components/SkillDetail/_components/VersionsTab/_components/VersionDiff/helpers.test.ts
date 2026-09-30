import { describe, it, expect } from "vitest";
import { hasChanges, lineDiff } from "./helpers";

describe("lineDiff", () => {
  it("marks removed and added lines around the common subsequence", () => {
    expect(lineDiff("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });

  it("handles identical, emptied and filled bodies", () => {
    expect(hasChanges(lineDiff("a\nb", "a\nb"))).toBe(false);
    expect(lineDiff("a", "")).toEqual([
      { kind: "del", text: "a" },
      { kind: "add", text: "" },
    ]);
    expect(lineDiff("x\ny", "y").map((l) => l.kind)).toEqual(["del", "same"]);
  });
});

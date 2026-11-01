import { describe, it, expect } from "vitest";
import { moveItem } from "./reorder";

describe("moveItem", () => {
  it("moves one element and ignores out-of-range indexes", () => {
    expect(moveItem(["x", "y", "z"], 0, 2)).toEqual(["y", "z", "x"]);
    expect(moveItem(["x", "y", "z"], 2, 0)).toEqual(["z", "x", "y"]);
    expect(moveItem(["x", "y"], 0, 5)).toEqual(["x", "y"]);
    expect(moveItem(["x", "y"], 1, 1)).toEqual(["x", "y"]);
  });
});

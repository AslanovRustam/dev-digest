import { describe, it, expect } from "vitest";
import { countLines, estimateTokens, gutterText } from "./helpers";

describe("BodyEditor helpers", () => {
  it("estimates tokens as ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("counts lines and numbers the gutter", () => {
    expect(countLines("")).toBe(1);
    expect(countLines("a\nb\n")).toBe(3);
    expect(gutterText(3)).toBe("1\n2\n3");
  });
});

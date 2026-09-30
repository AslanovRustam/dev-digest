import { describe, it, expect } from "vitest";
import { parseSkillTab } from "./helpers";

describe("parseSkillTab", () => {
  it("accepts the four tabs and falls back to config", () => {
    expect(parseSkillTab("versions")).toBe("versions");
    expect(parseSkillTab("stats")).toBe("stats");
    expect(parseSkillTab("evals")).toBe("config");
    expect(parseSkillTab(null)).toBe("config");
  });
});

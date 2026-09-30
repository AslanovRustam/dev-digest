import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills, skillHref } from "./helpers";

const mk = (id: string, name: string, description: string): Skill => ({
  id,
  name,
  description,
  type: "custom",
  source: "manual",
  body: "x",
  enabled: true,
  version: 1,
});

const SKILLS = [
  mk("1", "untested-branches", "Flag new branches without a test"),
  mk("2", "over-mocking", "Flag tests that mock the unit under test"),
];

describe("filterSkills", () => {
  it("matches name or description case-insensitively; blank query keeps all", () => {
    expect(filterSkills(SKILLS, "")).toHaveLength(2);
    expect(filterSkills(SKILLS, "  ")).toHaveLength(2);
    expect(filterSkills(SKILLS, "MOCK").map((s) => s.id)).toEqual(["2"]);
    expect(filterSkills(SKILLS, "without a test").map((s) => s.id)).toEqual(["1"]);
    expect(filterSkills(SKILLS, "nothing")).toEqual([]);
  });
});

describe("skillHref", () => {
  it("keeps the tab when given", () => {
    expect(skillHref("a1")).toBe("/skills/a1");
    expect(skillHref("a1", "stats")).toBe("/skills/a1?tab=stats");
  });
});

import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { filterRows, mergeRows, moveItem, toggleRow, toItems } from "./helpers";

const skill = (id: string, name: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: `${name} rules`,
  type: "custom",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  ...extra,
});
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});

const SKILLS = [skill("a", "zeta"), skill("b", "alpha"), skill("c", "mid"), skill("d", "beta")];

describe("SkillsTab helpers", () => {
  it("mergeRows puts linked skills first in link order, then unlinked by name, and drops dangling links", () => {
    const rows = mergeRows(SKILLS, [link("c", 1, false), link("a", 0), link("gone", 2)]);
    expect(rows.map((r) => [r.skill.id, r.linked, r.enabled])).toEqual([
      ["a", true, true],
      ["c", true, false],
      ["b", false, false],
      ["d", false, false],
    ]);
  });

  it("moveItem moves one element and ignores out-of-range indexes", () => {
    expect(moveItem(["x", "y", "z"], 0, 2)).toEqual(["y", "z", "x"]);
    expect(moveItem(["x", "y", "z"], 2, 0)).toEqual(["z", "x", "y"]);
    expect(moveItem(["x", "y"], 0, 5)).toEqual(["x", "y"]);
  });

  it("toItems sends only linked rows in display order; toggleRow keeps or appends positions", () => {
    const rows = mergeRows(SKILLS, [link("a", 0), link("c", 1)]);
    expect(toItems(rows)).toEqual([
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: true },
    ]);
    // Unchecking a linked row keeps it linked at its position.
    expect(toItems(toggleRow(rows, "a"))).toEqual([
      { skill_id: "a", enabled: false },
      { skill_id: "c", enabled: true },
    ]);
    // Checking an unlinked row appends it after the linked block.
    expect(toItems(toggleRow(rows, "d"))).toEqual([
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: true },
      { skill_id: "d", enabled: true },
    ]);
  });

  it("filterRows matches name or description, case-insensitively", () => {
    const rows = mergeRows(SKILLS, []);
    expect(filterRows(rows, "  ALPHA ").map((r) => r.skill.id)).toEqual(["b"]);
    expect(filterRows(rows, "rules")).toHaveLength(4);
    expect(filterRows(rows, "")).toHaveLength(4);
  });
});

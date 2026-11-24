import { describe, expect, it } from "vitest";
import { normPath, skillEngaged, traceMisses, traceStopWhen, wasRead } from "./trace-check.js";

const facts = (over: Partial<Parameters<typeof traceMisses>[1]> = {}) => ({
  text: "",
  subagents: [],
  skillsInvoked: [],
  filesRead: [],
  ...over,
});

describe("normPath / wasRead", () => {
  it("matches a Windows backslash path against a forward-slash expectation", () => {
    expect(normPath("D:\\repo\\server\\AGENTS.md")).toBe("D:/repo/server/AGENTS.md");
    expect(wasRead(["D:\\repo\\server\\AGENTS.md"], "server/AGENTS.md")).toBe(true);
  });

  it("matches relative, dotted and absolute POSIX spellings", () => {
    for (const p of ["server/AGENTS.md", "./server/AGENTS.md", "/home/u/repo/server/AGENTS.md"]) {
      expect(wasRead([p], "server/AGENTS.md")).toBe(true);
    }
  });

  it("does not match a different package's file", () => {
    expect(wasRead(["D:\\repo\\client\\AGENTS.md"], "server/AGENTS.md")).toBe(false);
  });
});

describe("skillEngaged", () => {
  it("counts a plugin-qualified Skill call and a Windows read of SKILL.md", () => {
    expect(skillEngaged({ skillsInvoked: ["plug:onion-architecture"], filesRead: [] }, "onion-architecture")).toBe(true);
    expect(
      skillEngaged(
        { skillsInvoked: [], filesRead: ["D:\\repo\\.claude\\skills\\onion-architecture\\SKILL.md"] },
        "onion-architecture",
      ),
    ).toBe(true);
  });
});

describe("traceMisses", () => {
  it("reports EVERY failed expectation, not just the first", () => {
    const misses = traceMisses(
      {
        expectSubagents: ["implementation-planner"],
        expectFilesRead: ["server/AGENTS.md"],
        expectText: [/db:generate/],
      },
      facts(),
    );
    expect(misses).toHaveLength(3);
  });

  it("passes when all positive expectations hold", () => {
    const misses = traceMisses(
      { expectFilesRead: ["server/AGENTS.md"], expectSkills: ["onion-architecture"], expectText: [/db:generate/] },
      facts({
        filesRead: ["D:\\r\\server\\AGENTS.md"],
        skillsInvoked: ["onion-architecture"],
        text: "run pnpm db:generate",
      }),
    );
    expect(misses).toEqual([]);
  });

  it("flags a forbidden subagent and a forbidden Skill call", () => {
    const misses = traceMisses(
      { forbidSubagents: ["researcher"], forbidSkills: ["pr-self-review"] },
      facts({ subagents: ["researcher"], skillsInvoked: ["pr-self-review"] }),
    );
    expect(misses).toEqual(["forbidden subagent launched: researcher", "forbidden skill invoked: pr-self-review"]);
  });

  it("does not treat reading a forbidden skill's SKILL.md as invoking it", () => {
    const misses = traceMisses(
      { forbidSkills: ["pr-self-review"] },
      facts({ filesRead: [".claude/skills/pr-self-review/SKILL.md"] }),
    );
    expect(misses).toEqual([]);
  });
});

describe("traceStopWhen", () => {
  it("never stops early when the case asserts on the final text", () => {
    expect(traceStopWhen({ expectFilesRead: ["x"], expectText: [/y/] })).toBeUndefined();
  });

  it("stops once every positive expectation holds", () => {
    const stop = traceStopWhen({ expectSubagents: ["implementation-planner"] })!;
    expect(stop(facts())).toBe(false);
    expect(stop(facts({ subagents: ["implementation-planner"] }))).toBe(true);
  });

  it("stops as soon as a forbidden subagent launches", () => {
    const stop = traceStopWhen({ expectSubagents: ["implementation-planner"], forbidSubagents: ["researcher"] })!;
    expect(stop(facts({ subagents: ["researcher"] }))).toBe(true);
  });
});

// No model calls: guards the safety contract of every eval session (bypassPermissions on a live
// checkout). `allowedTools` only auto-approves in the Agent SDK, so restriction must be explicit.
import { describe, expect, it } from "vitest";
import { toolOptions } from "./run-claude.js";
import { readOnlyTools } from "../artifacts/load.js";
import { MUTATING_TOOLS, WORKFLOW_ALLOWED_TOOLS } from "../config.js";

describe("toolOptions", () => {
  it("always removes the mutating tools from the model's context", () => {
    for (const allowed of [[], ["Read", "Grep", "Glob"], WORKFLOW_ALLOWED_TOOLS]) {
      expect(toolOptions(allowed).disallowedTools).toEqual(expect.arrayContaining(["Bash", "Write", "Edit", "NotebookEdit"]));
    }
  });

  it("a content-only run (no tools asked) gets no built-in tools at all", () => {
    expect(toolOptions([]).tools).toEqual([]);
  });

  it("a tool run keeps its allow-list and does not blank the built-in set", () => {
    const o = toolOptions(["Read", "Grep", "Glob"]);
    expect(o.allowedTools).toEqual(["Read", "Grep", "Glob"]);
    expect(o.tools).toBeUndefined();
  });
});

describe("readOnlyTools", () => {
  it("drops every mutating tool a case asks for", () => {
    expect(readOnlyTools(["Read", ...MUTATING_TOOLS, "Grep"])).toEqual(["Read", "Grep"]);
  });
});

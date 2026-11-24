// node --test evals/scripts/ci-detect.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, fsProbe, toMatrix } from "./ci-detect.mjs";

const probe = {
  skillsWithEvals: ["dependency-checker"],
  agentsWithEvals: ["architecture-reviewer"],
  workflowSuites: ["claude-md-routing", "dependency-checker"],
};

test("a skill with evals runs its skill suite AND its activation suite", () => {
  const r = detect([".claude/skills/dependency-checker/SKILL.md"], probe);
  assert.deepEqual(r.skills, ["dependency-checker"]);
  assert.deepEqual(r.workflow, ["dependency-checker"]);
  assert.deepEqual(r.skipped, []);
});

test("a skill without evals is skipped on both tiers, nothing runs", () => {
  const r = detect([".claude/skills/zod/SKILL.md"], probe);
  assert.deepEqual(r.skills, []);
  assert.deepEqual(r.workflow, []);
  assert.deepEqual(
    r.skipped.map((s) => `${s.tier}:${s.name}`),
    ["skills:zod", "workflow:zod"],
  );
  assert.deepEqual(toMatrix(r), { include: [] });
});

test("an agent with evals runs its suite plus the whole workflow tier", () => {
  const r = detect([".claude/agents/architecture-reviewer.md"], probe);
  assert.deepEqual(r.agents, ["architecture-reviewer"]);
  assert.deepEqual(r.workflow, ["claude-md-routing", "dependency-checker"]);
});

test("an agent without evals is skipped but still re-runs the workflow tier", () => {
  const r = detect([".claude/agents/doc-writer.md"], probe);
  assert.deepEqual(r.agents, []);
  assert.deepEqual(r.skipped.map((s) => `${s.tier}:${s.name}`), ["agents:doc-writer"]);
  assert.deepEqual(r.workflow, ["claude-md-routing", "dependency-checker"]);
});

test(".claude/agents/README.md is not an agent and does not trigger anything", () => {
  const r = detect([".claude/agents/README.md"], probe);
  assert.deepEqual(r, { skills: [], agents: [], workflow: [], skipped: [], reasons: [] });
});

test("root and package AGENTS.md / CLAUDE.md trigger the whole workflow tier", () => {
  for (const f of ["AGENTS.md", "CLAUDE.md", "server/AGENTS.md", "client/CLAUDE.md", ".claude/CLAUDE.md"]) {
    assert.deepEqual(detect([f], probe).workflow, ["claude-md-routing", "dependency-checker"], f);
  }
});

test("an AGENTS.md / CLAUDE.md inside an eval fixture repo is test data, not an instruction change", () => {
  for (const f of [
    ".claude/skills/onion-architecture/evals/fixtures/base/server/AGENTS.md",
    "evals/skills/dependency-checker/fixtures/repo/CLAUDE.md",
  ]) {
    assert.deepEqual(detect([f], probe).reasons, [], f);
  }
});

test("settings, hooks and the eval engine trigger the whole workflow tier", () => {
  for (const f of [".claude/settings.json", ".claude/hooks/agent-guard.mjs", "evals/src/dsl/case.ts", "evals/package.json"]) {
    assert.equal(detect([f], probe).workflow.length, 2, f);
  }
});

test("editing one workflow suite runs only that suite", () => {
  const r = detect(["evals/workflow/claude-md-routing.cases.ts"], probe);
  assert.deepEqual(r.workflow, ["claude-md-routing"]);
});

test("a directory name that is not a safe path token never reaches the matrix", () => {
  const evil = "x$(curl evil)";
  const r = detect([`evals/skills/${evil}/a.eval.ts`, ".claude/skills/a b/SKILL.md"], {
    ...probe,
    skillsWithEvals: [...probe.skillsWithEvals, evil, "a b"],
  });
  assert.deepEqual(r.skills, []);
  assert.deepEqual(toMatrix(r), { include: [] });
  assert.ok(r.skipped.some((s) => s.name === evil && s.why === "invalid name"));
});

test("unrelated files trigger nothing", () => {
  const r = detect(["server/src/app.ts", "README.md", "docs/README.md"], probe);
  assert.deepEqual(toMatrix(r), { include: [] });
});

test("manual run (all) selects every suite that has evals", () => {
  const m = toMatrix(detect([], probe, { all: true }));
  assert.deepEqual(m.include, [
    { tier: "skills", paths: "skills/dependency-checker/" },
    { tier: "agents", paths: "agents/architecture-reviewer/" },
    { tier: "workflow", paths: "workflow/claude-md-routing.eval.ts workflow/dependency-checker.eval.ts" },
  ]);
});

test("agent paths end in / so a sibling '-lite' suite is not matched by the vitest substring filter", () => {
  const m = toMatrix(detect([".claude/agents/architecture-reviewer.md"], probe));
  assert.equal(m.include.find((e) => e.tier === "agents").paths, "agents/architecture-reviewer/");
});

test("fsProbe sees the evals that exist in this repo", () => {
  const p = fsProbe();
  assert.ok(p.skillsWithEvals.includes("dependency-checker"));
  assert.ok(p.agentsWithEvals.includes("architecture-reviewer"));
  assert.ok(p.workflowSuites.includes("claude-md-routing"));
});

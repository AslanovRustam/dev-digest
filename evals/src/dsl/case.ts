/**
 * Case types + the runners that turn a data array into vitest tests. This module owns the ONE
 * true measure → (log) → assert body, so case authors never rewrite it — which is exactly what
 * keeps the "assert before record" bug from recurring once record() lands (T2 slots into the
 * marked spot below, in this one file).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import { DEFAULT_THRESHOLD } from "../config.js";
import { skillTask, agentTask, workflowTask } from "../tasks.js";
import { runClaude, type Result, type RunOptions } from "../runtime/run-claude.js";
import { patternMatch } from "../scoring/pattern-match.js";
import { llmJudge, type Verdict } from "../scoring/llm-judge.js";
import { logTrace, logVerdict } from "../logging/log.js";
import { record } from "../records/record.js";
import { readOnlyTools } from "../artifacts/load.js";
import { skillEngaged, traceMisses, traceStopWhen, wasRead, type TraceExpectations } from "./trace-check.js";

// --- Case shapes ------------------------------------------------------------

/** A judge-and-grounding case. Same shape for skills and agents; only the task differs. */
export interface QualityCase {
  name: string;
  kind?: "quality" | "grounding";
  prompt: string;
  /** Practices the judge scores (quality). Omit for a pure grounding case. */
  practices?: string[];
  /** Substrings that must ALL appear before the judge runs (cheap-tier gate). */
  grounding?: string[];
  /** Judge score gate (default 0.6). */
  threshold?: number;
  maxTurns?: number;
  /**
   * Tools the model may use in this case (default: none → content-only). Mutating tools (Bash,
   * Write, Edit, NotebookEdit) are always dropped: runs use bypassPermissions. For a skill this
   * also switches to production-style loading (see skillTask); for an agent it replaces the tools
   * its frontmatter declares.
   */
  tools?: string[];
  /** Working directory of the run (default: repo root) — e.g. a fixture repository to inspect. */
  cwd?: string;
}
export type SkillCase = QualityCase;
export type AgentCase = QualityCase;

/** A trace-asserted workflow case — a discriminated union routed by `kind`. */
export type WorkflowCase =
  | { kind: "dispatch"; name: string; prompt: string; expectSubagent: string; maxTurns?: number }
  | {
      kind: "activation";
      name: string;
      prompt: string;
      skill: string;
      shouldActivate: boolean;
      maxTurns?: number;
    }
  | {
      kind: "contrast";
      name: string;
      prompt: string;
      expectFileRead: string;
      tools?: string[];
      maxTurns?: number;
    }
  | ({
      // A single-session composite: run ONE workflowTask and assert several trace facets at once.
      // Cheaper than separate dispatch/activation/contrast cases (one session, not N) at the cost
      // of coarser diagnostics and no control run — use contrast when you must isolate CLAUDE.md's
      // contribution. Every provided expectation must hold; omitted fields are not checked.
      // Do not combine `expectText` with `expectSubagents`: text needs the final answer, so the
      // nested subagent would run to completion instead of the session stopping at the dispatch.
      kind: "trace";
      name: string;
      prompt: string;
      maxTurns?: number;
    } & TraceExpectations);

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(result: Result, skill: string): boolean {
  return skillEngaged(result, skill);
}

// --- Runners ----------------------------------------------------------------

type Task = (prompt: string, artifact: string, opts?: RunOptions) => Promise<Result>;

function runQualityCases(artifact: string, cases: QualityCase[], task: Task): void {
  for (const c of cases) {
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      // Only set keys the case provides: an explicit `allowedTools: undefined` would wipe the tools
      // agentTask derives from the agent's frontmatter (it spreads opts after them).
      const opts: RunOptions = { maxTurns: c.maxTurns };
      if (c.tools) opts.allowedTools = readOnlyTools(c.tools);
      if (c.cwd) opts.cwd = c.cwd;
      const result = await task(c.prompt, artifact, opts);
      logTrace(c.name, result);

      // measure → record → assert. Everything measurable runs in the try; record() fires in the
      // finally with whatever accumulated; the asserts happen strictly after. A failing config
      // (e.g. baseline: grounding gate fails, judge skipped) still leaves a record.
      let grounded: number | undefined;
      let verdict: Verdict | undefined;
      try {
        // Cheap deterministic tier first — the grounding gate. When it fails the judge is skipped.
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          logVerdict(c.name, verdict);
        }
      } finally {
        record(c.name, { result, verdict, grounded, threshold });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(threshold);
      }
    });
  }
}

export const runSkillCases = (skill: string, cases: SkillCase[]) => runQualityCases(skill, cases, skillTask);
export const runAgentCases = (agent: string, cases: AgentCase[]) => runQualityCases(agent, cases, agentTask);

export function runWorkflowCases(cases: WorkflowCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      if (c.kind === "dispatch") {
        // Stop the moment the subagent is launched — no need to wait out its nested session.
        const expect1 = c.expectSubagent;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) => p.subagents.includes(expect1),
        });
        logTrace(c.name, result);
        const passed = result.subagents.includes(c.expectSubagent);
        try {
          expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(c.expectSubagent);
        } finally {
          record(c.name, { result, passed });
        }
      } else if (c.kind === "activation") {
        const result = await workflowTask(c.prompt, { maxTurns: c.maxTurns });
        logTrace(c.name, result);
        const passed = activated(result, c.skill) === c.shouldActivate;
        try {
          expect(
            activated(result, c.skill),
            `skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
          ).toBe(c.shouldActivate);
        } finally {
          record(c.name, { result, passed });
        }
      } else if (c.kind === "trace") {
        // One session, many asserts — every provided expectation is checked against the same trace.
        // Stops as soon as all trace expectations hold (or a forbidden subagent launches), unless
        // the case asserts on the final text — see traceStopWhen.
        const result = await workflowTask(c.prompt, { maxTurns: c.maxTurns, stopWhen: traceStopWhen(c) });
        logTrace(c.name, result);
        // An early stop on success is not an error; isError only fails a run that ended badly
        // (e.g. hit maxTurns before the final answer).
        const misses = traceMisses(c, result);
        if (result.isError) misses.push("session ended with an error (maxTurns hit?)");
        const passed = misses.length === 0;
        try {
          // All misses in one message — a merged case must show everything that failed, not the first.
          expect(
            misses,
            `${misses.join("; ")}\n  subagents: ${result.subagents.join(", ")}\n  skills: ${result.skillsInvoked.join(", ")}\n  reads: ${result.filesRead.join(", ")}`,
          ).toEqual([]);
        } finally {
          record(c.name, { result, passed });
        }
      } else {
        // contrast: treatment (real harness) vs control (empty tmpdir, no on-disk config).
        const tools = c.tools ?? ["Read", "Grep", "Glob"];
        const treatment = await workflowTask(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns });
        const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
        const control = await runClaude(c.prompt, {
          allowedTools: tools,
          maxTurns: c.maxTurns,
          cwd: emptyCwd,
          settingSources: [],
        });
        logTrace(`${c.name} [treatment]`, treatment);
        logTrace(`${c.name} [control]`, control);
        const treatmentRead = wasRead(treatment.filesRead, c.expectFileRead);
        const controlRead = wasRead(control.filesRead, c.expectFileRead);
        // Each half records whether IT behaved as the contrast requires.
        try {
          expect(treatmentRead, `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
          expect(controlRead, `control reads: ${control.filesRead.join(", ")}`).toBe(false);
        } finally {
          record(`${c.name} [treatment]`, { result: treatment, passed: treatmentRead });
          record(`${c.name} [control]`, { result: control, passed: !controlRead });
        }
      }
    });
  }
}

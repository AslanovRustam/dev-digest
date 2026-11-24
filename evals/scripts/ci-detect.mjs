/**
 * CI change detector for the harness evals (.github/workflows/evals.yml).
 *
 * Maps the files a PR changed onto the eval suites that should run, ONE run per case:
 *
 *   .claude/skills/<name>/**  or evals/skills/<name>/**  → evals/skills/<name>/     (skill tier)
 *                                                           + evals/workflow/<name>.eval.ts (its activation cases)
 *   .claude/agents/<name>.md  or evals/agents/<name>/**  → evals/agents/<name>/     (agent tier)
 *                                                           + the whole workflow tier
 *   any AGENTS.md / CLAUDE.md (root or package), .claude/settings.json, .claude/hooks/**,
 *   the eval engine (evals/src/**, evals/proxy/**, package/lock/config files)
 *                                                         → the whole workflow tier
 *   evals/workflow/<suite>.{eval,cases}.ts                 → that workflow suite
 *
 * `CLAUDE.md` here is a one-line `@AGENTS.md` stub, so AGENTS.md is the file that actually changes
 * the instructions — both are watched.
 *
 * An artifact with no written evals is NOT a failure: it lands in `skipped` and the CLI prints
 * `SKIP <tier> <name> — no evals` to the job log instead of running anything.
 *
 * Writes GitHub Actions step outputs to $GITHUB_OUTPUT:
 *   matrix     {"include":[{"tier":"skills","paths":"skills/a skills/b"}, …]} — only non-empty tiers
 *   has_work   "true" when the matrix has at least one entry
 * Paths are relative to evals/ (the job's working directory).
 *
 * Inputs: CHANGED_FILES (newline-separated, repo-relative) or EVAL_ALL=1 (manual run: every suite
 * that has evals). Pure filesystem + string work — no deps, so it runs before `pnpm install`.
 */

import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Default filesystem probe: what evals exist under evals/. Injected in tests. */
export function fsProbe(evalsDir = EVALS_DIR) {
  const evalFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".eval.ts")) : []);
  const dirsWithEvals = (tier) =>
    existsSync(join(evalsDir, tier))
      ? readdirSync(join(evalsDir, tier), { withFileTypes: true })
          .filter((d) => d.isDirectory() && evalFiles(join(evalsDir, tier, d.name)).length > 0)
          .map((d) => d.name)
      : [];
  return {
    skillsWithEvals: dirsWithEvals("skills"),
    agentsWithEvals: dirsWithEvals("agents"),
    workflowSuites: evalFiles(join(evalsDir, "workflow")).map((f) => f.replace(/\.eval\.ts$/, "")),
  };
}

// Any of these changes what the live harness does, so the whole workflow tier re-runs.
const HARNESS_WIDE = [
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/hooks\//,
  /^evals\/src\//,
  /^evals\/proxy\//,
  /^evals\/(package\.json|pnpm-lock\.yaml|vitest\.config\.ts|tsconfig\.json)$/,
];

/**
 * Pure mapping: changed files + what evals exist → what to run and what to skip.
 * @param {string[]} changed repo-relative paths (forward slashes)
 * @param {{skillsWithEvals:string[], agentsWithEvals:string[], workflowSuites:string[]}} probe
 * @param {{all?: boolean}} [opts] all = manual run of every suite that has evals
 */
export function detect(changed, probe, opts = {}) {
  const has = (list, name) => list.includes(name);
  const skipped = [];
  const reasons = [];

  if (opts.all) {
    return {
      skills: [...probe.skillsWithEvals].sort(),
      agents: [...probe.agentsWithEvals].sort(),
      workflow: [...probe.workflowSuites].sort(),
      skipped,
      reasons: ["manual run: every suite that has evals"],
    };
  }

  // Names end up in the job's matrix and then on a shell command line — keep only safe path tokens.
  const SAFE = /^[A-Za-z0-9._-]+$/;
  const pick = (re) => {
    const names = [...new Set(changed.map((f) => f.match(re)?.[1]).filter(Boolean))].sort();
    for (const n of names.filter((x) => !SAFE.test(x))) skipped.push({ tier: "any", name: n, why: "invalid name" });
    return names.filter((x) => SAFE.test(x));
  };
  const skillNames = [...new Set([...pick(/^\.claude\/skills\/([^/]+)\//), ...pick(/^evals\/skills\/([^/]+)\//)])].sort();
  const agentNames = [
    ...new Set([...pick(/^\.claude\/agents\/([^/]+)\.md$/), ...pick(/^evals\/agents\/([^/]+)\//)]),
  ]
    .filter((n) => n !== "README")
    .sort();

  const skills = [];
  const workflow = new Set();
  for (const name of skillNames) {
    if (has(probe.skillsWithEvals, name)) skills.push(name);
    else skipped.push({ tier: "skills", name, why: "no evals/skills/" + name + "/*.eval.ts" });
    // A skill's description decides whether it ENGAGES — its activation cases live in the workflow tier.
    if (has(probe.workflowSuites, name)) workflow.add(name);
    else skipped.push({ tier: "workflow", name, why: "no evals/workflow/" + name + ".eval.ts (activation)" });
  }

  const agents = [];
  for (const name of agentNames) {
    if (has(probe.agentsWithEvals, name)) agents.push(name);
    else skipped.push({ tier: "agents", name, why: "no evals/agents/" + name + "/*.eval.ts" });
  }

  // Workflow suites edited directly.
  for (const name of pick(/^evals\/workflow\/([^/]+)\.(?:eval|cases)\.ts$/)) {
    if (has(probe.workflowSuites, name)) workflow.add(name);
  }

  // A fixture repo inside an eval (e.g. .claude/skills/<s>/evals/fixtures/base/server/AGENTS.md) is test
  // data, not this harness's instructions — it must not re-run the whole workflow tier.
  const wide = changed.filter((f) => !/(^|\/)fixtures\//.test(f) && HARNESS_WIDE.some((re) => re.test(f)));
  const agentDefChanged = changed.some((f) => /^\.claude\/agents\/(?!README\.md$)[^/]+\.md$/.test(f));
  if (wide.length || agentDefChanged) {
    for (const s of probe.workflowSuites) workflow.add(s);
    reasons.push(
      "whole workflow tier: " + [...wide, ...(agentDefChanged ? ["an agent definition"] : [])].slice(0, 5).join(", "),
    );
  }

  return { skills, agents, workflow: [...workflow].sort(), skipped, reasons };
}

/**
 * The matrix the evals job fans out over — only tiers with something to run.
 * Directory paths end in `/`: vitest filters are substrings, so a bare `agents/architecture-reviewer`
 * would ALSO run `agents/architecture-reviewer-lite/` and double the cost.
 */
export function toMatrix(r) {
  const include = [];
  if (r.skills.length) include.push({ tier: "skills", paths: r.skills.map((n) => `skills/${n}/`).join(" ") });
  if (r.agents.length) include.push({ tier: "agents", paths: r.agents.map((n) => `agents/${n}/`).join(" ") });
  if (r.workflow.length) {
    include.push({ tier: "workflow", paths: r.workflow.map((n) => `workflow/${n}.eval.ts`).join(" ") });
  }
  return { include };
}

function main() {
  const changed = (process.env.CHANGED_FILES ?? "")
    .split("\n")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
  const result = detect(changed, fsProbe(), { all: process.env.EVAL_ALL === "1" });
  const matrix = toMatrix(result);

  const out = process.env.GITHUB_OUTPUT;
  const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));
  write("matrix", JSON.stringify(matrix));
  write("has_work", String(matrix.include.length > 0));

  console.error("── eval change detection ──");
  console.error(`changed files : ${changed.length}${process.env.EVAL_ALL === "1" ? " (manual run: all)" : ""}`);
  console.error(`skills   → run: ${result.skills.join(", ") || "(none)"}`);
  console.error(`agents   → run: ${result.agents.join(", ") || "(none)"}`);
  console.error(`workflow → run: ${result.workflow.join(", ") || "(none)"}`);
  for (const r of result.reasons) console.error(`  why: ${r}`);
  for (const s of result.skipped) console.error(`SKIP ${s.tier} ${s.name} — ${s.why}`);
  if (!matrix.include.length) console.error("nothing to evaluate — no model jobs will start");
}

// Run as a CLI only — importing it from the test must not write outputs. pathToFileURL, not a raw
// `file://` string: the latter never matches on Windows (root INSIGHTS.md).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

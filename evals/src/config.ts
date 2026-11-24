/**
 * All tunables in one place. No logic here — just the knobs the rest of the package reads.
 * Nothing in this module imports from another src module (it is the bottom of the dependency
 * graph): config knows nothing of runtime, scoring, or the SDK.
 */

// --- Models -----------------------------------------------------------------
// Cheap model under test by default; the judge is a stronger family to soften self-preference.
export const EVAL_MODEL = process.env.EVAL_MODEL ?? "claude-haiku-4-5";
export const EVAL_JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-sonnet-5";
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");

// --- Run-count cap (token economy) -----------------------------------------
// Upper bound AND default for every multi-run CLI: eval:repeat runs a pattern at most this many
// times, eval:benchmark at most this many times PER config (candidate + baseline). A larger -n is
// capped with a notice. Enough to catch a blatantly flaky case; stddev at n=2 is indicative only.
export const MAX_RUNS = 2;

// --- Configuration tag ------------------------------------------------------
// "candidate" = artifact injected (normal). "baseline" = no artifact (benchmark lift baseline).
export const EVAL_CONFIG = process.env.EVAL_CONFIG ?? "candidate";
export const IS_BASELINE = EVAL_CONFIG === "baseline";

// --- Scoring / statistics thresholds ---------------------------------------
export const DEFAULT_THRESHOLD = 0.6; // judge score gate for a quality case
export const FLAKY_LOW = 0.2; // pass rate strictly inside (20%, 80%) is "flaky"
export const FLAKY_HIGH = 0.8;
export const COST_REGRESSION_RATIO = 1.25; // candidate mean tokens > 125% of baseline

// --- Tool allow-lists -------------------------------------------------------
// Subagent-spawning tool name varies by harness; count both.
export const SPAWN_TOOLS = new Set(["Task", "Agent"]);
// workflowTask runs against the LIVE repo with bypassPermissions — keep this read-only.
export const WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"];
// Tools no eval session may ever use, on any tier: every run is bypassPermissions on a live
// checkout. NOTE: `allowedTools` only AUTO-APPROVES tools — it does not restrict them (SDK docs:
// "to restrict which tools are available, use the `tools` option"); runClaude enforces this list
// through `disallowedTools`.
export const MUTATING_TOOLS = ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit"];

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);

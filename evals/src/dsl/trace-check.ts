/**
 * Pure trace checks for workflow cases — no vitest, no SDK, so they are unit-testable
 * (`trace-check.test.ts`) and shared by every workflow `kind`.
 *
 * Paths in a trace come in every shape the model chooses: `server/AGENTS.md`, `./server/AGENTS.md`,
 * `/home/u/repo/server/AGENTS.md`, or on Windows `D:\repo\server\AGENTS.md`. Every comparison goes
 * through `normPath`, so a case can always spell an expectation with forward slashes.
 */

/** Forward slashes only — a Windows `Read` path otherwise never matches `server/AGENTS.md`. */
export const normPath = (p: string): string => p.replace(/\\/g, "/");

/** Did the session read a file whose path contains `expected` (slash-insensitive)? */
export function wasRead(filesRead: string[], expected: string): boolean {
  const want = normPath(expected);
  return filesRead.some((f) => normPath(f).includes(want));
}

/** Was the skill invoked through the Skill tool (name may be `plugin:skill`)? */
export function skillInvoked(skillsInvoked: string[], skill: string): boolean {
  return skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
}

/** Did a skill engage? An explicit Skill tool-call, or a read of its SKILL.md. */
export function skillEngaged(trace: { skillsInvoked: string[]; filesRead: string[] }, skill: string): boolean {
  return skillInvoked(trace.skillsInvoked, skill) || wasRead(trace.filesRead, `skills/${skill}/SKILL.md`);
}

/** The expectations a `trace` case may carry. Omitted fields are not checked. */
export interface TraceExpectations {
  expectSubagents?: string[];
  expectSkills?: string[];
  expectFilesRead?: string[];
  /** Every pattern must match the session's final text. Disables the early stop (needs the answer). */
  expectText?: RegExp[];
  /** None of these subagents may be launched. */
  forbidSubagents?: string[];
  /** None of these skills may be invoked through the Skill tool (reading its SKILL.md is allowed). */
  forbidSkills?: string[];
}

export interface TraceFacts {
  text: string;
  subagents: string[];
  skillsInvoked: string[];
  filesRead: string[];
}

/** Every failed expectation, as a human-readable line. Empty = the trace satisfies the case. */
export function traceMisses(c: TraceExpectations, r: TraceFacts): string[] {
  const misses: string[] = [];
  for (const s of c.expectSubagents ?? []) {
    if (!r.subagents.includes(s)) misses.push(`subagent not launched: ${s}`);
  }
  for (const s of c.forbidSubagents ?? []) {
    if (r.subagents.includes(s)) misses.push(`forbidden subagent launched: ${s}`);
  }
  for (const s of c.expectSkills ?? []) {
    if (!skillEngaged(r, s)) misses.push(`skill not engaged: ${s}`);
  }
  for (const s of c.forbidSkills ?? []) {
    if (skillInvoked(r.skillsInvoked, s)) misses.push(`forbidden skill invoked: ${s}`);
  }
  for (const f of c.expectFilesRead ?? []) {
    if (!wasRead(r.filesRead, f)) misses.push(`file not read: ${f}`);
  }
  for (const re of c.expectText ?? []) {
    if (!re.test(r.text)) misses.push(`text does not match: ${re}`);
  }
  return misses;
}

/**
 * Early-stop predicate for a trace case, or undefined when the case must run to its final answer
 * (`expectText`). Stops once every positive trace expectation holds, or as soon as a forbidden
 * subagent launches — the case has failed and its nested run would only cost tokens.
 */
export function traceStopWhen(
  c: TraceExpectations,
): ((p: Omit<TraceFacts, "text">) => boolean) | undefined {
  if (c.expectText?.length) return undefined;
  return (p) =>
    (c.forbidSubagents ?? []).some((s) => p.subagents.includes(s)) ||
    ((c.expectSubagents ?? []).every((s) => p.subagents.includes(s)) &&
      (c.expectSkills ?? []).every((s) => skillEngaged(p, s)) &&
      (c.expectFilesRead ?? []).every((f) => wasRead(p.filesRead, f)));
}

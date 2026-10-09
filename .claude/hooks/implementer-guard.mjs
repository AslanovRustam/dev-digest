// PreToolUse guard for the `implementer` subagent (wired in `.claude/agents/implementer.md`).
//
// The implementer edits code and runs tests — nothing else. This hook turns the "never commit,
// never migrate, never touch generated/vendored paths" rules from advice into a hard deny.
// It is a guardrail against mistakes, not a security boundary: `bash -c "git push"` hides the
// command inside quotes and passes.
//
// Fails OPEN on every error, same posture as pr-self-review/scripts/gate.mjs: a broken hook
// must never paralyse the session.

import { readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

import { statements } from '../skills/pr-self-review/scripts/gate.mjs';

const HANDOFF =
  'This is outside the implementer role — list it under "Not done / blockers" in your report and let the main session decide.';

/** git global options that take a separate value: `git -C dir commit`, `git -c k=v push`. */
const GIT = String.raw`^git\s+(?:(?:-C|-c)\s+\S+\s+|--?[\w-]+(?:=\S+)?\s+)*`;

/** [regex on one shell statement, why it is denied] */
const BASH_RULES = [
  [
    new RegExp(GIT + String.raw`(?:commit|push|restore|clean|stash|rebase|merge|switch|checkout)\b`),
    'changes git history or discards working-tree changes',
  ],
  [new RegExp(GIT + String.raw`reset\b.*--hard\b`), 'discards working-tree changes'],
  [/^gh\s+pr\b/, 'PRs are opened by the user after `/pr-self-review`'],
  [/^docker(?:\s+|-)compose\b.*\bdown\b/, '`down -v` deletes the devdigest_pgdata volume with every imported repo'],
  [/^rm\s+(?:\S+\s+)*?(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(?:\s|$)/, 'recursive delete'],
  [/^(?:pnpm|npm)\s+(?:run\s+)?db:(?:migrate|seed)\b/, 'writes to the developer database — migrations never run implicitly'],
];

/** [regex on a repo-relative POSIX path, why it is denied] */
const PATH_RULES = [
  [/^server\/src\/db\/migrations\//, 'generated — use `pnpm db:generate`, never hand-edit'],
  [/^server\/clones\//, 'runtime data'],
  [/^\.claude\//, 'agent tooling and vendored skills are not part of an implementation plan'],
  [/^client\/src\/vendor\/ui\//, 'vendored design system'],
  [/(?:^|\/)INSIGHTS\.md$/i, 'insights are recorded by the main session — put candidates under "Worth recording in INSIGHTS"'],
];

/**
 * One statement from `statements()` without grouping and leading `VAR=value` assignments, as gate.mjs does.
 * Also used by agent-guard.mjs — keep the signature stable.
 */
export function normalise(raw) {
  return raw.trim().replace(/^[({\s]+/, '').replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');
}

function bashVerdict(command) {
  for (const raw of statements(command)) {
    const s = normalise(raw);
    for (const [re, why] of BASH_RULES) {
      if (re.test(s)) return { deny: true, reason: `implementer-guard: \`${s}\` is denied (${why}). ${HANDOFF}` };
    }
  }
  return { deny: false };
}

/** Repo-relative POSIX path, or null when the file lies outside the project. */
export function repoPath(filePath, projectDir) {
  if (!filePath) return null;
  const raw = String(filePath);
  let rel = isAbsolute(raw) && projectDir ? relative(projectDir, raw) : raw;
  rel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('/') || /^[A-Za-z]:\//.test(rel)) return null;
  return rel;
}

function pathVerdict(filePath, projectDir) {
  const rel = repoPath(filePath, projectDir);
  if (rel === null) return { deny: false };
  for (const [re, why] of PATH_RULES) {
    if (re.test(rel)) return { deny: true, reason: `implementer-guard: editing \`${rel}\` is denied (${why}). ${HANDOFF}` };
  }
  return { deny: false };
}

/**
 * Pure decision, so implementer-guard.test.mjs can cover it without spawning a process.
 * @returns {{deny:boolean, reason?:string}}
 */
export function decide(input, projectDir) {
  const tool = input?.tool_name;
  if (tool === 'Bash') return bashVerdict(input?.tool_input?.command);
  if (tool === 'Edit' || tool === 'Write') return pathVerdict(input?.tool_input?.file_path, projectDir);
  return { deny: false };
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const verdict = decide(input, process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd());
  if (verdict.deny) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: verdict.reason,
        },
      }),
    );
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('implementer-guard.mjs')) {
  try {
    main();
  } catch {
    process.exit(0); // fail open, always
  }
}

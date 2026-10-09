// PreToolUse guard for the architecture-reviewer, plan-verifier, test-writer and doc-writer subagents.
// Wired in each agent's frontmatter as `node "$CLAUDE_PROJECT_DIR/.claude/hooks/agent-guard.mjs" <profile>`.
//
// All profiles share ONE Bash allowlist: read-only inspection plus the package typecheck / test / lint /
// arch commands. A denylist would leave `node -e`, `bash -c`, `git apply` or a plain `rm` free to change
// production code. Profiles differ only in which paths Edit/Write may touch:
//   readonly    — nothing (architecture-reviewer, plan-verifier)
//   test-writer — test files only, never the architecture gate tests
//   doc-writer  — documentation only, never specs, agent instructions or DB-backed product copies
// Keep the tables in sync with `.claude/agents/README.md` → "agent-guard".
//
// It is a guardrail against mistakes, not a security boundary: anything hidden inside quotes is blanked
// before matching (except `$(` / backticks, which are caught outside single quotes).
// Fails OPEN on every error and on an unknown profile, same posture as implementer-guard.mjs:
// a broken hook must never paralyse the session. agent-guard.test.mjs pins the wired profiles.

import { readFileSync } from 'node:fs';

import { statements } from '../skills/pr-self-review/scripts/gate.mjs';
import { normalise, repoPath } from './implementer-guard.mjs';

/** read-only git: optional `-C dir` / `--no-pager`, never `-c key=value` (a pager or alias can run anything) */
const GIT_READ = /^git\s+(?:-C\s+\S+\s+|--no-pager\s+)*(?:status|diff|log|show|blame|ls-files|grep|merge-base|rev-parse|shortlog|cat-file|describe)\b|^git\s+(?:-C\s+\S+\s+)?branch\s+--show-current$/;

/** a statement must match one of these */
const BASH_ALLOW = [
  /^cd\b/,
  /^pwd$/,
  /^(?:ls|wc|cat|head|tail|grep|rg|echo|cut|tr|diff|basename|dirname|sort)\b/,
  /^uniq(?:\s+-\w+)*$/,
  /^find\b/,
  GIT_READ,
  /^pnpm\s+(?:run\s+)?(?:typecheck|test|lint|arch(?::strict)?)(?:\s|$)/,
  /^pnpm\s+exec\s+(?:vitest\s+run|tsc\s+--noEmit|depcruise)\b/,
  /^npm\s+(?:test|run\s+(?:test|typecheck))(?:\s|$)/,
  /^node\s+--test\b/,
  /^docker\s+(?:info|ps)\b/,
];

/** [regex, why] — denied even when the statement is on the allowlist */
const BASH_DENY = [
  [/(?:^|\s)--(?:fix|write|update|watch)\b/, 'rewrites files, re-baselines snapshots or never exits'],
  [/^(?:pnpm|npm)\b.*\s-u(?:\s|$)/, '`vitest -u` re-baselines snapshots'],
  [/--output/, 'writes its output to a file'],
  [/^find\b.*\s-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)\b/, '`find` that deletes, executes or writes'],
  [/^sort\b.*\s-o\b/, '`sort -o` writes a file'],
];

const ALLOWED_REDIRECT = new Set(['/dev/null', '&1', '&2']);

function deny(profile, what, why) {
  return { deny: true, reason: `agent-guard[${profile}]: \`${what}\` is denied (${why}). ${PROFILES[profile].handoff}` };
}

function bashVerdict(command, profile) {
  const raw = String(command ?? '');
  // command substitution runs inside double quotes too, so only single-quoted spans are literal
  if (/\$\(|`/.test(raw.replace(/'[^']*'/g, ''))) {
    return deny(profile, raw, 'command substitution can hide any command');
  }
  for (const part of statements(raw)) {
    const s = normalise(part);
    if (!s) continue;
    for (const m of s.matchAll(/>{1,2}\s*(\S*)/g)) {
      if (!ALLOWED_REDIRECT.has(m[1])) return deny(profile, s, 'output redirect writes a file');
    }
    for (const [re, why] of BASH_DENY) {
      if (re.test(s)) return deny(profile, s, why);
    }
    if (!BASH_ALLOW.some((re) => re.test(s))) return deny(profile, s, 'not on the read-only command allowlist');
  }
  return { deny: false };
}

/** [regex on a repo-relative POSIX path, why] — checked before `allow` */
const NEVER_EDIT = [
  [/(?:^|\/)(?:AGENTS|CLAUDE|INSIGHTS)\.md$/i, 'agent instructions and insights are maintained by the main session'],
  [/^\.claude\//, 'agent tooling and vendored skills'],
];

export const PROFILES = {
  readonly: {
    handoff: 'This agent is read-only — report what you would run or change instead.',
    edit: () => 'this agent is read-only',
  },
  'test-writer': {
    handoff:
      "test-writer edits test files only — report suspected bugs or needed production changes under 'Suspected bugs' / 'Not covered'.",
    deny: [
      [/^server\/test\/architecture\.test\.ts$/, 'architecture gate — weakening it disables the gate'],
      [/^reviewer-core\/test\/purity\.test\.ts$/, 'engine purity gate — weakening it disables the gate'],
    ],
    allow: [
      /^server\/test\//,
      /^reviewer-core\/test\//,
      /^server\/src\/.+\.test\.ts$/,
      /^client\/src\/.+\.test\.tsx?$/,
      /^client\/src\/test\//,
    ],
    outside: 'production code, config, e2e flows and tooling are outside test-writer scope',
  },
  'doc-writer': {
    handoff: "doc-writer edits documentation only — list other changes under 'Proposed index / AGENTS.md updates'.",
    deny: [
      [/^docs\/(?:agent-prompts|skills)\//, 'canonical copy of DB-backed product content — it changes with the feature'],
      [/^docs\/improvement-plan\.md$/, 'audit/status document owned by the user'],
      [/(?:^|\/)specs\//, 'specs are intended scope, not docs — link to them'],
    ],
    allow: [
      /^docs\/.+\.md$/,
      /^(?:server|client|reviewer-core|e2e)\/docs\/.+\.md$/,
      /^(?:server|client|reviewer-core|e2e)\/README\.md$/,
      /^README\.md$/,
      /^TESTING\.md$/,
      /^server\/src\/modules\/[^/]+\/README\.md$/,
    ],
    outside: 'only documentation files are in doc-writer scope',
  },
};

function pathVerdict(filePath, projectDir, profile) {
  const p = PROFILES[profile];
  if (!p.allow) return deny(profile, String(filePath ?? ''), p.edit());
  const rel = repoPath(filePath, projectDir);
  if (rel === null) return { deny: false };
  for (const [re, why] of [...NEVER_EDIT, ...p.deny]) {
    if (re.test(rel)) return deny(profile, rel, why);
  }
  if (p.allow.some((re) => re.test(rel))) return { deny: false };
  return deny(profile, rel, p.outside);
}

/**
 * Pure decision, so agent-guard.test.mjs can cover it without spawning a process.
 * @returns {{deny:boolean, reason?:string}}
 */
export function decide(input, projectDir, profile) {
  if (!Object.hasOwn(PROFILES, profile ?? '')) return { deny: false };
  const tool = input?.tool_name;
  if (tool === 'Bash') return bashVerdict(input?.tool_input?.command, profile);
  if (tool === 'Edit' || tool === 'Write') return pathVerdict(input?.tool_input?.file_path, projectDir, profile);
  return { deny: false };
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const verdict = decide(input, process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd(), process.argv[2]);
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

if (process.argv[1]?.endsWith('agent-guard.mjs')) {
  try {
    main();
  } catch {
    process.exit(0); // fail open, always
  }
}

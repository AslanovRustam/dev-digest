// Stop hook: ask the agent to run the engineering-insights check — but only when the git working
// tree changed since the last check in this session. A turn that only read, searched or answered
// costs a full extra turn (the whole session context is re-sent) and almost never yields an insight;
// a changed tree (main-session edits, subagent edits, Bash writes) is what a lesson comes from.
// Fails open — any error means "let the agent stop".
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKILL = 'engineering-insights';
export const REASON =
  `${SKILL} check: the working tree changed since the last check — review the work against the gate ` +
  `in .claude/skills/${SKILL}/SKILL.md. Append each qualifying insight to the owning module's ` +
  `INSIGHTS.md, or reply "Insights: nothing new". Keep it short.`;

/** Tools that write files directly from the main session. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

function isRealPrompt(entry) {
  if (entry.type !== 'user' || entry.isMeta) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return true;
  return Array.isArray(content) && !content.some((block) => block.type === 'tool_result');
}

export function toolUsesSinceLastPrompt(entries) {
  let start = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isRealPrompt(entries[i])) {
      start = i + 1;
      break;
    }
  }
  return entries
    .slice(start)
    .filter((entry) => entry.type === 'assistant' && Array.isArray(entry.message?.content))
    .flatMap((entry) => entry.message.content.filter((block) => block.type === 'tool_use'));
}

export function alreadyChecked(toolUses) {
  return toolUses.some(
    (use) =>
      (use.name === 'Skill' && use.input?.skill === SKILL) ||
      /INSIGHTS\.md$/.test(String(use.input?.file_path ?? '')),
  );
}

/**
 * Pure decision. `prevHash` is the tree hash recorded at this session's last check (undefined on
 * the first stop of a session). Returns whether to block and the hash to record (null = keep).
 *  - no tool use this turn → stop silently (nothing happened);
 *  - the agent already ran the check this turn → record and stop;
 *  - tree unchanged since the last check → stop;
 *  - first stop of the session: ask only if this turn edited files itself (a dirty tree left by an
 *    earlier session is not this session's work), otherwise just record the baseline;
 *  - otherwise the tree changed → ask once and record.
 */
export function decide({ toolUses, hash, prevHash }) {
  if (toolUses.length === 0) return { block: false, record: null };
  if (alreadyChecked(toolUses)) return { block: false, record: hash };
  if (hash === prevHash) return { block: false, record: null };
  if (prevHash === undefined && !toolUses.some((u) => EDIT_TOOLS.has(u.name))) {
    return { block: false, record: hash };
  }
  return { block: true, record: hash };
}

/** Hash of tracked changes vs HEAD plus untracked files (name + size + mtime). Ignored paths don't count. */
export function treeHash(cwd) {
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const h = createHash('sha1');
  h.update(git('diff', 'HEAD', '--no-ext-diff', '--binary'));
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').toString('utf8').split('\0').filter(Boolean);
  for (const f of untracked) {
    try {
      const st = statSync(join(cwd, f));
      h.update(`${f}\0${st.size}\0${st.mtimeMs}\n`);
    } catch {
      h.update(`${f}\0gone\n`);
    }
  }
  return h.digest('hex');
}

function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.stop_hook_active || !input.transcript_path) return;

  const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  // State lives OUTSIDE the repo: a file in the tree would change the very hash it records
  // (only some `.devdigest/` subfolders are git-ignored).
  const statePath = join(tmpdir(), 'devdigest-insights-check.json');
  let state = {};
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    /* first run */
  }
  const sessionKey = input.session_id || 'default';

  const toolUses = toolUsesSinceLastPrompt(readJsonl(input.transcript_path));
  const { block, record } = decide({ toolUses, hash: treeHash(cwd), prevHash: state[sessionKey] });

  if (record !== null) {
    state[sessionKey] = record;
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state));
  }
  if (block) process.stdout.write(JSON.stringify({ decision: 'block', reason: REASON }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}

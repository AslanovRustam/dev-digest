// Shared helpers for the pr-self-review scripts.
// Pure Node ESM, zero dependencies — these run before any package is installed.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repo root. $CLAUDE_PROJECT_DIR when a hook runs us, otherwise derived from this file. */
export function repoRoot() {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  if (fromEnv && existsSync(join(fromEnv, '.git'))) return resolve(fromEnv);
  // .claude/skills/pr-self-review/scripts → up four
  return resolve(HERE, '..', '..', '..', '..');
}

export const SKILL_DIR = resolve(HERE, '..');
export function outDir() {
  return join(repoRoot(), '.devdigest', 'pr-self-review');
}
export function ensureOut() {
  const d = outDir();
  mkdirSync(join(d, 'cache'), { recursive: true });
  return d;
}

export const DEFAULT_CONFIG = { fail_on: 'critical', gate_on_push: false, base: 'main' };

export function readConfig() {
  try {
    const raw = JSON.parse(readFileSync(join(SKILL_DIR, 'config.json'), 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------- git

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd ?? repoRoot(),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeout ?? 120_000,
  });
}

/** Never throws. `{ ok, out, err }` — for probes where failure is a normal answer. */
export function gitSafe(args, opts = {}) {
  try {
    return { ok: true, out: git(args, opts), err: '' };
  } catch (e) {
    return { ok: false, out: String(e?.stdout ?? ''), err: String(e?.stderr ?? e?.message ?? e) };
  }
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

// ---------------------------------------------------------------- diff

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|tgz|bz2|7z|woff2?|ttf|eot|otf|mp4|mp3|wav|mov|class|jar|so|dll|dylib|exe|wasm|bin|node)$/i;

export function isProbablyBinary(absPath) {
  if (BINARY_EXT.test(absPath)) return true;
  try {
    const buf = readFileSync(absPath);
    return buf.includes(0);
  } catch {
    return false;
  }
}

/**
 * Build one unified patch covering BOTH the branch-vs-base diff and the working tree
 * (tracked modifications + untracked files), which is what will actually land in the PR.
 *
 * Untracked files are synthesised by hand rather than via `git diff --no-index /dev/null`:
 * that form exits non-zero on every difference and behaves differently across platforms.
 */
export function buildDiff(mergeBase) {
  const root = repoRoot();
  const parts = [];

  if (mergeBase) {
    const committed = gitSafe(['diff', '--no-color', '--no-ext-diff', mergeBase, 'HEAD']);
    if (committed.ok) parts.push(committed.out);
  }

  const worktree = gitSafe(['diff', '--no-color', '--no-ext-diff', 'HEAD']);
  if (worktree.ok) parts.push(worktree.out);

  const untracked = gitSafe(['ls-files', '--others', '--exclude-standard']);
  if (untracked.ok) {
    for (const rel of untracked.out.split('\n').map((s) => s.trim()).filter(Boolean)) {
      const abs = join(root, rel);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile() || st.size > 5 * 1024 * 1024 || isProbablyBinary(abs)) continue;
      let text;
      try {
        text = readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      parts.push(
        `diff --git a/${rel} b/${rel}\n` +
          `new file mode 100644\n` +
          `--- /dev/null\n` +
          `+++ b/${rel}\n` +
          `@@ -0,0 +1,${lines.length} @@\n` +
          lines.map((l) => `+${l}`).join('\n') +
          '\n',
      );
    }
  }

  return parts.join('');
}

/** Stable identity of "the change set as it stands right now". */
export function diffHash(patch, headSha) {
  return sha256(`${headSha}\n${patch}`);
}

export function shortHash(h) {
  return String(h).slice(0, 12);
}

/**
 * Parse a unified patch into per-file line information.
 * Returns Map<path, { newLines:Set<number>, added:[{line,text}] }>.
 * `newLines` is every line number present on the NEW side (context + added) — that is what
 * citation grounding intersects against.
 */
export function parsePatch(patch) {
  const files = new Map();
  let cur = null;
  let newNo = 0;

  for (const raw of String(patch).split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim();
      if (p === '/dev/null') {
        cur = null;
        continue;
      }
      const path = p.replace(/^b\//, '');
      if (!files.has(path)) files.set(path, { newLines: new Set(), added: [] });
      cur = files.get(path);
      continue;
    }
    if (raw.startsWith('@@')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      newNo = m ? Number(m[1]) : 0;
      continue;
    }
    if (!cur || !newNo) continue;

    if (raw.startsWith('+')) {
      cur.newLines.add(newNo);
      cur.added.push({ line: newNo, text: raw.slice(1) });
      newNo++;
    } else if (raw.startsWith('-')) {
      // old side only — does not advance the new-side counter
    } else if (raw.startsWith(' ')) {
      cur.newLines.add(newNo);
      newNo++;
    }
  }
  return files;
}

// ---------------------------------------------------------------- severity gate
//
// MIRROR of reviewer-core/src/output/to-review.ts:23-50 — the source of truth.
// Duplicated because a hook script cannot import raw TS without tsx; gate.test.mjs
// asserts the two stay in sync.

export const SEV_RANK = { SUGGESTION: 1, WARNING: 2, CRITICAL: 3 };
export const FAIL_ON_MIN_RANK = { never: Infinity, critical: 3, warning: 2, any: 1 };

export function gateTriggered(findings, failOn) {
  const min = FAIL_ON_MIN_RANK[failOn];
  if (min === undefined) return false;
  return findings.some((f) => (SEV_RANK[f.severity] ?? 0) >= min);
}

export function countBlockers(findings, failOn) {
  const min = FAIL_ON_MIN_RANK[failOn];
  if (min === undefined) return 0;
  return findings.reduce((n, f) => n + ((SEV_RANK[f.severity] ?? 0) >= min ? 1 : 0), 0);
}

/**
 * Findings from full-file scanners are NOT tied to a diff hunk — they ground against the
 * file merely being present in the diff.
 * MIRROR of reviewer-core/src/grounding.ts:16 (FULL_FILE_KINDS).
 */
export const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

export const SEV_EMOJI = { CRITICAL: '🔴', WARNING: '🟡', SUGGESTION: '🔵' };

// ---------------------------------------------------------------- io

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

/** CLI arg helpers: `--flag` and `--key value` / `--key=value`. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

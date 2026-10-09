#!/usr/bin/env node
// Diff index for review agents: ONE compact map of what a branch changed, so architecture-reviewer
// and plan-verifier read only the files their rules cover instead of each dumping the full diff.
//
//   node scripts/diff-index.mjs [--base <ref>]  > .devdigest/plans/<NN-slug>.diff-index.md
//
// Base defaults to `origin/main` (local `main` often lags after merges on GitHub and drags
// already-merged lessons into the scope), falling back to `main`. Includes the working tree:
// tracked changes vs the merge-base plus untracked files. Read-only: never fetches or writes.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e', '.claude', 'specs', 'docs', 'scripts'];

/** Tags that decide which reviewer cares about a file. */
export function tagsFor(path) {
  const tags = [];
  if (/(^|\/)test\/|\.test\.[cm]?[jt]sx?$/.test(path)) tags.push('test');
  if (path.startsWith('server/src/db/migrations/')) tags.push('migration');
  if (path.startsWith('server/src/db/schema/')) tags.push('schema');
  if (/\/vendor\/shared\//.test(path)) tags.push('contract');
  if (path.startsWith('client/messages/')) tags.push('messages');
  if (/(^|\/)styles\.ts$/.test(path)) tags.push('styles');
  if (/\.md$/.test(path)) tags.push('doc');
  return tags;
}

export function packageOf(path) {
  const first = path.split('/')[0];
  return PACKAGES.includes(first) ? first : 'other';
}

/** Files the architecture rules can apply to: production code in the three packages. */
export function inArchitectureScope(path) {
  const tags = tagsFor(path);
  if (tags.some((t) => ['test', 'messages', 'styles', 'doc'].includes(t))) return false;
  if (tags.includes('migration')) return path.endsWith('.sql'); // the SQL, not drizzle meta
  return /^(server\/src|reviewer-core\/src|client\/src)\//.test(path);
}

/**
 * @param {{ path: string, added: number|null, deleted: number|null, untracked?: boolean }[]} files
 */
export function renderIndex({ base, baseSha, mergeBase, headSha, files }) {
  const lines = [
    `# Diff index`,
    ``,
    `Base: ${base} (${baseSha.slice(0, 7)}) · merge-base ${mergeBase.slice(0, 7)} · Head: ${headSha.slice(0, 7)} (+ working tree)`,
    `Files: ${files.length} · per-file diff: \`git diff ${mergeBase.slice(0, 7)} -- <path>\` (untracked: read the file)`,
    ``,
  ];
  const byPkg = new Map();
  for (const f of files) {
    const pkg = packageOf(f.path);
    if (!byPkg.has(pkg)) byPkg.set(pkg, []);
    byPkg.get(pkg).push(f);
  }
  for (const pkg of [...PACKAGES, 'other']) {
    const list = byPkg.get(pkg);
    if (!list) continue;
    lines.push(`## ${pkg} (${list.length})`);
    for (const f of list) {
      const stat = f.untracked ? 'new, untracked' : f.added === null ? 'binary' : `+${f.added} −${f.deleted}`;
      const tags = tagsFor(f.path);
      lines.push(`- \`${f.path}\` — ${stat}${tags.length ? ` · ${tags.join(', ')}` : ''}`);
    }
    lines.push('');
  }
  const arch = files.filter((f) => inArchitectureScope(f.path)).map((f) => f.path);
  lines.push(`## Architecture scope (${arch.length})`, ...arch.map((p) => `- \`${p}\``), '');
  return lines.join('\n');
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function refExists(ref) {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const i = process.argv.indexOf('--base');
  const base = i > 0 ? process.argv[i + 1] : refExists('origin/main') ? 'origin/main' : 'main';
  const baseSha = git('rev-parse', base);
  const mergeBase = git('merge-base', 'HEAD', base);
  const headSha = git('rev-parse', 'HEAD');

  const files = git('diff', '--numstat', '-z', mergeBase)
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const [added, deleted, path] = row.split('\t');
      return { path, added: added === '-' ? null : Number(added), deleted: deleted === '-' ? null : Number(deleted) };
    });
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  for (const path of untracked) files.push({ path, added: null, deleted: null, untracked: true });
  files.sort((a, b) => a.path.localeCompare(b.path));

  process.stdout.write(renderIndex({ base, baseSha, mergeBase, headSha, files }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

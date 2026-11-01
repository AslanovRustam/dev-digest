#!/usr/bin/env node
// Snapshots of the working tree for /run-plan's review rounds — no commit, no stash, no index change.
//
//   node scripts/tree-snapshot.mjs save <file>               record the working tree (tracked + untracked)
//   node scripts/tree-snapshot.mjs changed <file> [--paths]  files that differ between that snapshot and now
//
// Why: fix rounds run on an uncommitted tree, so `git diff` shows everything since the merge-base, while a
// delta review needs "what THIS round changed". A temporary index (`GIT_INDEX_FILE`) records the whole
// tree without touching the real index, HEAD or the files; `git write-tree` keeps it in .git/objects.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function git(root, env, ...args) {
  return execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** The working tree as a git tree object (ignored files excluded, skip-worktree files as recorded). */
export function snapshotTree(root) {
  const dir = mkdtempSync(join(tmpdir(), 'tree-snapshot-'));
  const index = join(dir, 'index');
  try {
    const real = resolve(root, git(root, process.env, 'rev-parse', '--git-path', 'index').trim());
    if (existsSync(real)) copyFileSync(real, index); // start from the real index: its stat cache keeps `add -A` fast
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(root, env, 'add', '-A');
    return git(root, env, 'write-tree').trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** [{ status: 'A'|'M'|'D'|…, path }] between a snapshot tree and the working tree now. */
export function changedSince(root, tree) {
  const now = snapshotTree(root);
  return git(root, process.env, 'diff-tree', '-r', '--no-renames', '--name-status', tree, now)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status, path };
    });
}

function main([cmd, file, flag]) {
  if (!['save', 'changed'].includes(cmd) || !file) {
    process.stderr.write('usage: node scripts/tree-snapshot.mjs save|changed <file> [--paths]\n');
    return 2;
  }
  const root = git(process.cwd(), process.env, 'rev-parse', '--show-toplevel').trim();
  if (cmd === 'save') {
    const record = {
      tree: snapshotTree(root),
      head: git(root, process.env, 'rev-parse', 'HEAD').trim(),
      created_at: new Date().toISOString(),
    };
    mkdirSync(dirname(resolve(file)), { recursive: true });
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
    process.stdout.write(`snapshot ${record.tree.slice(0, 12)} → ${file}\n`);
    return 0;
  }
  const { tree } = JSON.parse(readFileSync(file, 'utf8'));
  const changed = changedSince(root, tree);
  const lines = flag === '--paths' ? changed.filter((c) => c.status !== 'D').map((c) => c.path) : changed.map((c) => `${c.status}\t${c.path}`);
  process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  process.stderr.write(`${changed.length} file(s) changed since ${tree.slice(0, 12)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`tree-snapshot.mjs: ${err.message}\n`);
    process.exitCode = 1;
  }
}

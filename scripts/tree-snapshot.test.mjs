import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { changedSince, snapshotTree } from './tree-snapshot.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'tree-snapshot-test-'));
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  writeFileSync(join(dir, 'gone.txt'), 'x\n');
  writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  writeFileSync(join(dir, 'wip.txt'), 'uncommitted before the snapshot\n');
  return dir;
}

test('changedSince lists only what changed after the snapshot, untracked and deleted files included', () => {
  const dir = repo();
  try {
    const snap = snapshotTree(dir);
    writeFileSync(join(dir, 'a.txt'), 'a2\n');
    writeFileSync(join(dir, 'new.txt'), 'n\n');
    writeFileSync(join(dir, 'ignored.txt'), 'i\n');
    unlinkSync(join(dir, 'gone.txt'));
    assert.deepEqual(
      changedSince(dir, snap).map((c) => `${c.status} ${c.path}`),
      ['M a.txt', 'D gone.txt', 'A new.txt'],
      'wip.txt predates the snapshot; ignored.txt is ignored',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a snapshot touches neither the index nor HEAD', () => {
  const dir = repo();
  try {
    const before = git(dir, 'status', '--porcelain');
    const head = git(dir, 'rev-parse', 'HEAD');
    snapshotTree(dir);
    assert.equal(git(dir, 'status', '--porcelain'), before);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
    assert.deepEqual(changedSince(dir, snapshotTree(dir)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alreadyChecked, decide, toolUsesSinceLastPrompt, treeHash } from './stop-check.mjs';

const read = { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } };
const edit = { type: 'tool_use', name: 'Edit', input: { file_path: 'server/src/a.ts' } };
const insights = { type: 'tool_use', name: 'Edit', input: { file_path: 'server/INSIGHTS.md' } };

test('no tool use this turn → stop silently, keep state', () => {
  assert.deepEqual(decide({ toolUses: [], hash: 'h1', prevHash: 'h0' }), { block: false, record: null });
});

test('tree unchanged since the last check → do not ask', () => {
  assert.deepEqual(decide({ toolUses: [read, edit], hash: 'h1', prevHash: 'h1' }), { block: false, record: null });
});

test('tree changed since the last check → ask once and record', () => {
  assert.deepEqual(decide({ toolUses: [read], hash: 'h2', prevHash: 'h1' }), { block: true, record: 'h2' });
});

test('check already done this turn → record, do not ask', () => {
  assert.deepEqual(decide({ toolUses: [edit, insights], hash: 'h2', prevHash: 'h1' }), { block: false, record: 'h2' });
  assert.equal(alreadyChecked([{ type: 'tool_use', name: 'Skill', input: { skill: 'engineering-insights' } }]), true);
});

test('first stop of a session: read-only turn records a baseline, an editing turn asks', () => {
  assert.deepEqual(decide({ toolUses: [read], hash: 'h1', prevHash: undefined }), { block: false, record: 'h1' });
  assert.deepEqual(decide({ toolUses: [edit], hash: 'h1', prevHash: undefined }), { block: true, record: 'h1' });
});

test('tool uses are counted from the last real prompt only', () => {
  const entries = [
    { type: 'user', message: { content: 'first prompt' } },
    { type: 'assistant', message: { content: [edit] } },
    { type: 'user', message: { content: 'second prompt' } },
    { type: 'assistant', message: { content: [read] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'assistant', message: { content: [read] } },
  ];
  assert.deepEqual(toolUsesSinceLastPrompt(entries), [read, read]);
});

test('treeHash changes with a tracked edit and a new untracked file, not with an ignored one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'insights-hook-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, '.gitignore'), '.devdigest/\n');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  git('add', '.');
  git('commit', '-qm', 'init');

  const clean = treeHash(dir);
  mkdirSync(join(dir, '.devdigest'));
  writeFileSync(join(dir, '.devdigest', 'plan.md'), '#');
  assert.equal(treeHash(dir), clean, 'a git-ignored file must not change the hash');

  writeFileSync(join(dir, 'new.txt'), '');
  const withUntracked = treeHash(dir);
  assert.notEqual(withUntracked, clean);

  writeFileSync(join(dir, 'a.txt'), 'two\n');
  assert.notEqual(treeHash(dir), withUntracked);
});

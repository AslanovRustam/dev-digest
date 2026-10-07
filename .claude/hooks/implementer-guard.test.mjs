// node --test .claude/hooks/implementer-guard.test.mjs

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { decide, repoPath } from './implementer-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const bash = (command) => decide({ tool_name: 'Bash', tool_input: { command } }, ROOT).deny;
const edit = (file_path, tool_name = 'Edit') => decide({ tool_name, tool_input: { file_path } }, ROOT).deny;

test('denies state-changing git, PRs, compose down, recursive rm and DB writes', () => {
  for (const cmd of [
    'git commit -m "x"',
    'git push origin HEAD',
    'cd server && git commit -am wip',
    'git -C server stash',
    'git -c core.editor=true rebase main',
    'git reset --hard HEAD~1',
    'git checkout -- src/app.ts',
    'git switch main',
    'GIT_DIR=.git git push',
    'gh pr create --fill',
    'docker compose down -v',
    'docker-compose down',
    'rm -rf server/node_modules',
    'rm -fr dist',
    'rm --recursive dist',
    'cd server && pnpm db:migrate',
    'pnpm run db:seed',
    'npm run db:migrate',
  ]) {
    assert.equal(bash(cmd), true, cmd);
  }
});

test('allows tests, typecheck, generate, read-only git and quoted mentions', () => {
  for (const cmd of [
    'cd server && pnpm typecheck',
    "pnpm exec vitest run --exclude '**/*.it.test.ts'",
    'pnpm arch',
    'pnpm db:generate',
    'git status --short',
    'git diff --stat',
    'git log --oneline -5',
    'git reset HEAD src/x.ts',
    'echo "git push"',
    'grep -rn "gh pr create" docs',
    'rm server/tmp.txt',
    'rm -f server/tmp.txt',
  ]) {
    assert.equal(bash(cmd), false, cmd);
  }
});

test('denies edits to generated, vendored and insights paths', () => {
  for (const p of [
    join(ROOT, 'server', 'src', 'db', 'migrations', '0018_x.sql'),
    join(ROOT, 'server', 'clones', 'a', 'b.ts'),
    join(ROOT, '.claude', 'skills', 'zod', 'SKILL.md'),
    join(ROOT, 'client', 'src', 'vendor', 'ui', 'Button.tsx'),
    join(ROOT, 'server', 'INSIGHTS.md'),
    join(ROOT, 'INSIGHTS.md'),
    'server/src/db/migrations/meta/_journal.json',
  ]) {
    assert.equal(edit(p), true, p);
    assert.equal(edit(p, 'Write'), true, p);
  }
});

test('allows ordinary source edits and files outside the project', () => {
  for (const p of [
    join(ROOT, 'server', 'src', 'modules', 'reviews', 'service.ts'),
    join(ROOT, 'client', 'src', 'app', 'page.tsx'),
    join(ROOT, 'server', 'src', 'db', 'schema', 'reviews.ts'),
    join(ROOT, 'client', 'src', 'vendor', 'shared', 'contracts', 'x.ts'),
    join(ROOT, '..', 'elsewhere', 'INSIGHTS.md'),
  ]) {
    assert.equal(edit(p), false, p);
  }
});

test('repoPath normalises separators and rejects paths outside the root', () => {
  assert.equal(repoPath(join(ROOT, 'server', 'a.ts'), ROOT), 'server/a.ts');
  assert.equal(repoPath('server\\a.ts', ROOT), 'server/a.ts');
  assert.equal(repoPath(join(ROOT, '..', 'x.ts'), ROOT), null);
  assert.equal(repoPath('', ROOT), null);
});

test('other tools pass through', () => {
  assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: join(ROOT, 'INSIGHTS.md') } }, ROOT).deny, false);
});

test('process: emits a PreToolUse deny on stdout, nothing on allow, exit 0 on garbage', () => {
  const run = (stdin) =>
    spawnSync(process.execPath, [join(HERE, 'implementer-guard.mjs')], {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    });

  const denied = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' } }));
  assert.equal(denied.status, 0);
  const out = JSON.parse(denied.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /implementer-guard/);

  const allowed = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } }));
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');

  const garbage = run('not json');
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, '');
});

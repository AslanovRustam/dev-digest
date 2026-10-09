// node --test .claude/hooks/agent-guard.test.mjs

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { decide, PROFILES as GUARD_PROFILES } from './agent-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const bash = (command, profile = 'readonly') => decide({ tool_name: 'Bash', tool_input: { command } }, ROOT, profile).deny;
const edit = (file_path, profile, tool_name = 'Edit') =>
  decide({ tool_name, tool_input: { file_path } }, ROOT, profile).deny;

const PROFILES = ['readonly', 'test-writer', 'doc-writer'];

test('Bash allowlist: read-only inspection and package checks pass for every profile', () => {
  for (const cmd of [
    'git diff main...HEAD --stat',
    'git -C server log --oneline -5',
    'git --no-pager diff --name-only',
    'git merge-base HEAD main',
    'git status --short',
    'git branch --show-current',
    'cd server && pnpm arch',
    'cd client && pnpm lint 2>&1 | grep no-restricted-paths',
    'pnpm exec vitest run test/x.test.ts',
    'pnpm exec vitest run .it.test 2>&1 | tail -20',
    'cd server && pnpm typecheck',
    'pnpm test 2>&1 | tail -40',
    'cd reviewer-core && npm test -- test/purity.test.ts',
    'npm run typecheck',
    'node --test .claude/hooks/agent-guard.test.mjs',
    'docker info >/dev/null 2>&1',
    'ls server/test | head',
    'find server/src -name "*.ts"',
    'grep -rn "x" server/src | sort -u | wc -l',
    'echo "git commit > out.txt"',
    "grep -n '$(' server/src/app.ts",
  ]) {
    for (const p of PROFILES) assert.equal(bash(cmd, p), false, `${p}: ${cmd}`);
  }
});

test('Bash: state changes, writes, installs, generators and unknown commands are denied for every profile', () => {
  for (const cmd of [
    'git commit -m x',
    'git checkout main',
    'git stash',
    'git apply fix.patch',
    'git -c core.pager=sh diff',
    'git diff --output=x.patch',
    'cd server && pnpm arch:baseline',
    'pnpm lint --fix',
    'pnpm exec vitest run -u',
    'pnpm exec vitest run --update',
    'pnpm test -- -u',
    'pnpm exec vitest',
    'pnpm db:generate',
    'pnpm db:migrate',
    'pnpm install',
    'pnpm add -D x',
    'npm ci',
    'npx vitest',
    'echo x > f',
    'cat a >> b',
    'git diff | tee out.patch',
    'rm x',
    'rm -rf server/node_modules',
    'touch x',
    'mkdir d',
    'mv a b',
    "sed -i 's/a/b/' f",
    'node scripts/x.mjs',
    'node -e "require(\'fs\').writeFileSync(\'a\', \'b\')"',
    'bash -c "rm x"',
    'find . -delete',
    'find . -name x -exec rm {} +',
    'sort a -o b',
    'echo $(rm -rf x)',
    'echo "$(rm -rf x)"',
    'echo `rm x`',
    'curl https://example.com',
    './scripts/e2e.sh',
    'gh pr create --fill',
    'docker compose down -v',
  ]) {
    for (const p of PROFILES) assert.equal(bash(cmd, p), true, `${p}: ${cmd}`);
  }
});

test('readonly: Edit and Write are denied on every path', () => {
  for (const p of [
    join(ROOT, 'server', 'test', 'foo.test.ts'),
    join(ROOT, 'docs', 'README.md'),
    join(ROOT, '..', 'elsewhere', 'x.md'),
  ]) {
    assert.equal(edit(p, 'readonly'), true, p);
    assert.equal(edit(p, 'readonly', 'Write'), true, p);
  }
});

test('test-writer: test files and test helpers are writable', () => {
  for (const p of [
    join(ROOT, 'server', 'test', 'foo.test.ts'),
    join(ROOT, 'server', 'test', 'helpers', 'pg.ts'),
    join(ROOT, 'server', 'test', 'foo.it.test.ts'),
    join(ROOT, 'reviewer-core', 'test', 'run.test.ts'),
    join(ROOT, 'client', 'src', 'app', 'agents', '_components', 'AgentCard', 'AgentCard.test.tsx'),
    join(ROOT, 'client', 'src', 'lib', 'findings.test.ts'),
    join(ROOT, 'client', 'src', 'test', 'setup.ts'),
    join(ROOT, 'server', 'src', 'x', 'y.test.ts'),
    join(ROOT, '..', 'elsewhere', 'scratch.ts'),
  ]) {
    assert.equal(edit(p, 'test-writer'), false, p);
    assert.equal(edit(p, 'test-writer', 'Write'), false, p);
  }
});

test('test-writer: production code, gate tests, config, e2e flows and tooling are denied', () => {
  for (const p of [
    join(ROOT, 'server', 'src', 'modules', 'reviews', 'service.ts'),
    join(ROOT, 'client', 'src', 'app', 'page.tsx'),
    join(ROOT, 'server', 'test', 'architecture.test.ts'),
    join(ROOT, 'reviewer-core', 'test', 'purity.test.ts'),
    join(ROOT, 'server', 'vitest.config.ts'),
    join(ROOT, 'client', 'vitest.config.ts'),
    join(ROOT, 'server', 'package.json'),
    join(ROOT, 'server', '.dependency-cruiser-known-violations.json'),
    join(ROOT, 'e2e', 'specs', '01-x.flow.json'),
    join(ROOT, '.claude', 'agents', 'x.md'),
    join(ROOT, 'INSIGHTS.md'),
    join(ROOT, 'server', 'test', 'INSIGHTS.md'),
    join(ROOT, 'server', 'src', 'db', 'migrations', '0001_x.sql'),
    join(ROOT, 'client', 'src', 'app', '__snapshots__', 'x.snap'),
  ]) {
    assert.equal(edit(p, 'test-writer'), true, p);
    assert.equal(edit(p, 'test-writer', 'Write'), true, p);
  }
});

test('doc-writer: documentation files are writable', () => {
  for (const p of [
    'docs/features/04-x.md',
    'docs/README.md',
    'docs/adr/0001-x.md',
    'server/docs/x.md',
    'server/docs/adr/0001-x.md',
    'server/README.md',
    'client/README.md',
    'README.md',
    'TESTING.md',
    'e2e/docs/x.md',
    'server/src/modules/repo-intel/README.md',
  ]) {
    assert.equal(edit(join(ROOT, p), 'doc-writer'), false, p);
    assert.equal(edit(join(ROOT, p), 'doc-writer', 'Write'), false, p);
  }
});

test('doc-writer: product copies, specs, agent instructions, code and tooling are denied', () => {
  for (const p of [
    'docs/agent-prompts/general-reviewer.md',
    'docs/skills/README.md',
    'docs/improvement-plan.md',
    'specs/05-x.md',
    'e2e/docs/specs/x.md',
    'AGENTS.md',
    'server/AGENTS.md',
    'CLAUDE.md',
    'INSIGHTS.md',
    'server/src/app.ts',
    'docs/diagram.png',
    '.claude/agents/README.md',
    'e2e/specs/x.flow.json',
  ]) {
    assert.equal(edit(join(ROOT, p), 'doc-writer'), true, p);
    assert.equal(edit(join(ROOT, p), 'doc-writer', 'Write'), true, p);
  }
});

test('deny reasons name the profile and its hand-off', () => {
  const r = decide({ tool_name: 'Write', tool_input: { file_path: join(ROOT, 'server', 'src', 'a.ts') } }, ROOT, 'test-writer');
  assert.match(r.reason, /^agent-guard\[test-writer\]: `server\/src\/a\.ts` is denied/);
  assert.match(r.reason, /Suspected bugs/);
});

test('unknown or missing profile and other tools fail open', () => {
  assert.equal(bash('git push', 'nope'), false);
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'git push' } }, ROOT, undefined).deny, false);
  assert.equal(bash('git push', 'toString'), false);
  assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: join(ROOT, 'INSIGHTS.md') } }, ROOT, 'readonly').deny, false);
});

test('process: emits a PreToolUse deny on stdout, nothing on allow, exit 0 on garbage', () => {
  const run = (stdin, profile = 'readonly') =>
    spawnSync(process.execPath, [join(HERE, 'agent-guard.mjs'), profile], {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    });

  const denied = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' } }));
  assert.equal(denied.status, 0);
  const out = JSON.parse(denied.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /agent-guard\[readonly\]/);

  const allowed = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }));
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');

  const garbage = run('not json');
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, '');
});

test('wiring: every agent that uses agent-guard names a real profile and matches its tool policy', () => {
  const AGENTS = join(ROOT, '.claude', 'agents');
  const wired = {};
  for (const file of readdirSync(AGENTS).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(AGENTS, file), 'utf8');
    const fm = text.startsWith('---') ? text.split(/^---\s*$/m)[1] ?? '' : '';
    const m = fm.match(/agent-guard\.mjs"\s+(\S+)/);
    if (!m) continue;
    const name = basename(file, '.md');
    const field = (key) => (fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1] ?? '').split(/\s*,\s*/);
    const matcher = fm.match(/matcher:\s*"([^"]+)"/)?.[1];
    wired[name] = m[1];

    assert.ok(Object.hasOwn(GUARD_PROFILES, m[1]), `${file}: unknown profile ${m[1]}`);
    assert.deepEqual(field('name'), [name], `${file}: name must equal the file name`);
    if (m[1] === 'readonly') {
      assert.ok(!field('tools').some((t) => t === 'Write' || t === 'Edit'), `${file}: readonly agent lists Write/Edit`);
      for (const t of ['Write', 'Edit']) assert.ok(field('disallowedTools').includes(t), `${file}: must disallow ${t}`);
      assert.equal(matcher, 'Bash', file);
    } else {
      assert.equal(matcher, 'Bash|Edit|Write', file);
    }
  }
  assert.deepEqual(wired, {
    'architecture-reviewer': 'readonly',
    'doc-writer': 'doc-writer',
    'plan-verifier': 'readonly',
    planner: 'readonly',
    researcher: 'readonly',
    'test-writer': 'test-writer',
  });
});

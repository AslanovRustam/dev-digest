import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checksFor, fingerprint, parseCounts, pathsForPackages, renderSummary } from './verify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lanes = (checks) => checks.map((c) => `${c.pkg} ${c.name}${c.skipped ? ' (skipped)' : ''}`).filter((l) => !l.endsWith(' install'));

test('parseCounts reads the vitest summary, ANSI colours included', () => {
  const out = [
    ' ✓ test/a.test.ts (3 tests) 12ms',
    '',
    '\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m12 passed\x1b[39m\x1b[22m\x1b[90m (12)\x1b[39m',
    '\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m73 passed\x1b[39m\x1b[22m | \x1b[33m2 skipped\x1b[39m\x1b[90m (75)\x1b[39m',
    '   Duration  41.2s',
  ].join('\n');
  assert.deepEqual(parseCounts(out), { files: { passed: 12 }, tests: { passed: 73, skipped: 2 } });
  assert.deepEqual(parseCounts(' Tests  1 failed | 120 passed (121)').tests, { failed: 1, passed: 120 });
  assert.equal(parseCounts('Found 0 errors.'), null);
});

test('server changes add the integration lane, or record it as skipped without Docker', () => {
  const withDocker = lanes(checksFor(['server/src/modules/blast/routes.ts'], { docker: true }));
  assert.deepEqual(withDocker, ['server typecheck', 'server lint', 'server arch', 'server unit', 'server integration']);
  const without = lanes(checksFor(['reviewer-core/src/prompt.ts'], { docker: false }));
  assert.ok(without.includes('server integration (skipped)'), without.join(', '));
  assert.ok(without.includes('reviewer-core test'), without.join(', '));
  assert.ok(!lanes(checksFor(['server/src/x'], { integration: false, docker: true })).includes('server integration'));
});

test('client-only and mcp-only changes run their own lanes and no integration lane', () => {
  assert.deepEqual(lanes(checksFor(['client/src/app/page.tsx'], { docker: true })), ['client typecheck', 'client lint', 'client test']);
  assert.deepEqual(lanes(checksFor(pathsForPackages(['mcp']), { docker: true })), ['mcp typecheck', 'mcp arch', 'mcp test']);
});

test('--packages maps names to the lanes a real diff would pick; shared means both copies', () => {
  const shared = lanes(checksFor(pathsForPackages(['shared']), { docker: true }));
  for (const l of ['server unit', 'client test', 'reviewer-core test', 'server integration']) assert.ok(shared.includes(l), l);
  assert.throws(() => pathsForPackages(['web']), /unknown package "web"/);
});

test('fingerprint is stable for an unchanged tree', () => {
  const a = fingerprint(ROOT);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(fingerprint(ROOT), a);
});

test('summary: a failing lane shows its tail, a skipped lane says why', () => {
  const text = renderSummary(
    {
      ok: false,
      fingerprint: 'abc',
      tree_changed_during_run: false,
      results: [
        { pkg: 'server', name: 'unit', ok: false, sec: 9, counts: { tests: { failed: 1, passed: 5 } }, tail: 'AssertionError: x' },
        { pkg: 'server', name: 'integration', ok: null, skipped: 'Docker unavailable' },
      ],
    },
    'v.json',
  );
  assert.match(text, /^verify: FAIL · fingerprint abc · 2 lane\(s\) · v\.json/);
  assert.match(text, /FAIL server unit\s+9s 1 failed \| 5 passed/);
  assert.match(text, /AssertionError: x/);
  assert.match(text, /SKIP server integration\s+Docker unavailable/);
});

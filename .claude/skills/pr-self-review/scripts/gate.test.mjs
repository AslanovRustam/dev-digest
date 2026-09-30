// node --test .claude/skills/pr-self-review/scripts/gate.test.mjs
//
// Covers the gate's decision table, the deterministic scanners, and the one duplication that
// could silently drift: the severity gate mirrored from reviewer-core.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FAIL_ON_MIN_RANK, FULL_FILE_KINDS, SEV_RANK, gateTriggered, parsePatch } from './lib.mjs';
import { bodyText, classify, decide } from './gate.mjs';
import { cacheKey, globToRe } from './collect.mjs';
import { decideEarlyExit } from './checks.mjs';
import { SECRET_PATTERNS, maskSecret, netDelta } from './invariants.mjs';
import { applySuppression, ground } from './report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const noFile = () => {
  throw new Error('no file');
};

const reportOf = (over = {}) => ({
  verdict: 'PASS',
  diff_hash: 'a'.repeat(64),
  merge_base: 'deadbeef',
  checks_skipped: false,
  blockers_count: 0,
  findings: [],
  ...over,
});
const MARKER = `<!-- pr-self-review:${'a'.repeat(12)} -->`;

// ---------------------------------------------------------------- command classification

test('classify recognises only the gated commands', () => {
  assert.equal(classify('gh pr create --fill'), 'pr-create');
  assert.equal(classify('cd /x && gh  pr   create --title t'), 'pr-create');
  assert.equal(classify('gh pr merge 12 --squash'), 'pr-merge');
  assert.equal(classify('GH_TOKEN=x gh pr create'), 'pr-create');
  assert.equal(classify('npm test'), null);
  assert.equal(classify('gh pr list'), null);
  assert.equal(classify('gh pr view 3'), null);
});

test('classify ignores the command name inside a quoted string', () => {
  // Regression: matching the bare substring denied `echo`, docs writing and the gate's own tests.
  assert.equal(classify('echo "gh pr create --fill"'), null);
  assert.equal(classify("printf '%s' 'gh pr merge 3' > notes.md"), null);
  assert.equal(classify('echo \'{"command":"gh pr create"}\' | node gate.mjs'), null);
  // …but a real invocation after a separator is still caught.
  assert.equal(classify('echo "writing a pr"; gh pr create --fill'), 'pr-create');
});

test('git push is gated only when gate_on_push is enabled', () => {
  assert.equal(classify('git push origin HEAD'), null);
  assert.equal(classify('git push origin HEAD', { gateOnPush: true }), 'push');
});

// ---------------------------------------------------------------- decision table

test('an irrelevant command is not a decision at all', () => {
  assert.equal(decide({ action: null, command: 'ls', report: null, readFile: noFile }).deny, false);
});

test('condition 1 — a missing report denies and names the command to run', () => {
  const d = decide({ action: 'pr-create', command: 'gh pr create', report: null, readFile: noFile });
  assert.equal(d.deny, true);
  assert.match(d.reason, /pr-self-review/);
});

test('every denial tells the agent to ask the user — the skill cannot be model-invoked', () => {
  // SKILL.md sets `disable-model-invocation: true`. A reason that says "run /pr-self-review" makes
  // the agent try (and fail) to invoke it, then improvise the steps by hand.
  const fresh = { currentDiffHash: 'a'.repeat(64), readFile: noFile };
  const denials = [
    decide({ action: 'pr-create', command: 'gh pr create', report: null, readFile: noFile }),
    decide({ action: 'pr-create', command: 'gh pr create', report: reportOf(), currentDiffHash: 'b'.repeat(64), readFile: noFile }),
    decide({ action: 'pr-merge', command: 'gh pr merge 1', report: reportOf({ checks_skipped: true }), ...fresh }),
    decide({
      action: 'pr-merge',
      command: 'gh pr merge 1',
      report: reportOf({ verdict: 'BLOCKED', findings: [{ severity: 'CRITICAL', file: 'a.ts', start_line: 1, title: 'x' }] }),
      ...fresh,
    }),
  ];
  for (const d of denials) {
    assert.equal(d.deny, true);
    assert.match(d.reason, /ask the user to (re-)?run `\/pr-self-review`/i);
    assert.match(d.reason, /cannot invoke it yourself/);
  }
});

test('condition 2 — a stale diff hash denies', () => {
  const d = decide({
    action: 'pr-create',
    command: `gh pr create --body "${MARKER}"`,
    report: reportOf(),
    currentDiffHash: 'b'.repeat(64),
    readFile: noFile,
  });
  assert.equal(d.deny, true);
  assert.match(d.reason, /stale/i);
});

test('condition 2 — skipped verification commands can never pass the gate', () => {
  const d = decide({
    action: 'pr-create',
    command: `gh pr create --body "${MARKER}"`,
    report: reportOf({ checks_skipped: true }),
    currentDiffHash: 'a'.repeat(64),
    readFile: noFile,
  });
  assert.equal(d.deny, true);
  // Name the real flags: `--no-checks` does not exist anywhere in the skill.
  assert.match(d.reason, /checks\.mjs --skip/);
  assert.match(d.reason, /report\.mjs --checks-skipped/);
});

test('condition 3 — BLOCKED denies and lists the blocking findings', () => {
  const d = decide({
    action: 'pr-merge',
    command: 'gh pr merge 4',
    report: reportOf({
      verdict: 'BLOCKED',
      blockers_count: 1,
      findings: [{ severity: 'CRITICAL', file: 'server/src/a.ts', start_line: 12, title: 'SQL in a route' }],
    }),
    currentDiffHash: 'a'.repeat(64),
    readFile: noFile,
  });
  assert.equal(d.deny, true);
  assert.match(d.reason, /server\/src\/a\.ts:12 — SQL in a route/);
});

test('condition 3 honours a non-default threshold, not just CRITICAL', () => {
  const d = decide({
    action: 'pr-merge',
    command: 'gh pr merge 4',
    report: reportOf({
      verdict: 'BLOCKED',
      fail_on: 'warning',
      blockers_count: 1,
      findings: [{ severity: 'WARNING', blocking: true, file: 'client/src/a.tsx', start_line: 8, title: 'barrel re-export' }],
    }),
    currentDiffHash: 'a'.repeat(64),
    readFile: noFile,
  });
  assert.equal(d.deny, true);
  assert.match(d.reason, /client\/src\/a\.tsx:8 — barrel re-export/);
});

test('an override lifts the BLOCKED denial but the PR marker is still mandatory', () => {
  const report = reportOf({
    verdict: 'BLOCKED',
    overridden: { reason: 'flaky rule', findings: [] },
    findings: [{ severity: 'CRITICAL', file: 'a.ts', start_line: 1, title: 'x' }],
  });
  const withoutMarker = decide({ action: 'pr-create', command: 'gh pr create --body "hi"', report, currentDiffHash: 'a'.repeat(64), readFile: noFile });
  assert.equal(withoutMarker.deny, true);
  assert.match(withoutMarker.reason, /self-review section/);

  const withMarker = decide({ action: 'pr-create', command: `gh pr create --body "${MARKER}"`, report, currentDiffHash: 'a'.repeat(64), readFile: noFile });
  assert.equal(withMarker.deny, false);
});

test('condition 4 — the marker may arrive via --body-file', () => {
  const report = reportOf();
  const args = { action: 'pr-create', command: 'gh pr create --body-file body.md', report, currentDiffHash: 'a'.repeat(64) };
  assert.equal(decide({ ...args, readFile: () => 'no marker here' }).deny, true);
  assert.equal(decide({ ...args, readFile: () => `intro\n${MARKER}\n` }).deny, false);
});

test('bodyText reads every --body-file / -F path it finds', () => {
  const t = bodyText('gh pr create -F a.md --body-file "b .md"', (p) => `[${p}]`);
  assert.match(t, /\[a\.md\]/);
  assert.match(t, /\[b \.md\]/);
});

test('gh pr merge does not require the marker', () => {
  const d = decide({ action: 'pr-merge', command: 'gh pr merge 1', report: reportOf(), currentDiffHash: 'a'.repeat(64), readFile: noFile });
  assert.equal(d.deny, false);
});

// ---------------------------------------------------------------- fail-open

test('malformed hook input fails OPEN (exit 0, no decision emitted)', () => {
  const res = spawnSync(process.execPath, [join(HERE, 'gate.mjs')], { input: 'definitely not json', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

test('a non-Bash tool is ignored', () => {
  const res = spawnSync(process.execPath, [join(HERE, 'gate.mjs')], {
    input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x' } }),
    encoding: 'utf8',
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

test('an unrelated Bash command is ignored end to end', () => {
  const res = spawnSync(process.execPath, [join(HERE, 'gate.mjs')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO },
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

// ---------------------------------------------------------------- mirrored constants

test('the severity gate still matches reviewer-core/src/output/to-review.ts', () => {
  const src = readFileSync(join(REPO, 'reviewer-core', 'src', 'output', 'to-review.ts'), 'utf8');

  const rank = /SEV_RANK[^=]*=\s*\{([^}]*)\}/.exec(src);
  assert.ok(rank, 'SEV_RANK not found upstream');
  for (const [sev, n] of Object.entries(SEV_RANK)) {
    assert.match(rank[1], new RegExp(`${sev}\\s*:\\s*${n}\\b`), `SEV_RANK.${sev} drifted`);
  }

  const failOn = /FAIL_ON_MIN_RANK[^=]*=\s*\{([\s\S]*?)\}/.exec(src);
  assert.ok(failOn, 'FAIL_ON_MIN_RANK not found upstream');
  for (const [key, n] of Object.entries(FAIL_ON_MIN_RANK)) {
    // Upstream spells it `Number.POSITIVE_INFINITY`; accept either form for the same value.
    const want = n === Infinity ? '(?:Number\\.POSITIVE_INFINITY|Infinity)' : String(n);
    assert.match(failOn[1], new RegExp(`${key}\\s*:\\s*${want}\\b`), `FAIL_ON_MIN_RANK.${key} drifted`);
  }
});

test('the full-file grounding exemption still matches reviewer-core/src/grounding.ts', () => {
  const src = readFileSync(join(REPO, 'reviewer-core', 'src', 'grounding.ts'), 'utf8');
  const m = /FULL_FILE_KINDS\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(src);
  assert.ok(m, 'FULL_FILE_KINDS not found upstream');
  const upstream = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  assert.deepEqual([...FULL_FILE_KINDS].sort(), [...upstream].sort());
});

test('gateTriggered honours every fail_on level', () => {
  const f = (severity) => ({ severity });
  assert.equal(gateTriggered([f('CRITICAL')], 'never'), false);
  assert.equal(gateTriggered([f('WARNING')], 'critical'), false);
  assert.equal(gateTriggered([f('CRITICAL')], 'critical'), true);
  assert.equal(gateTriggered([f('WARNING')], 'warning'), true);
  assert.equal(gateTriggered([f('SUGGESTION')], 'any'), true);
  assert.equal(gateTriggered([], 'any'), false);
});

// ---------------------------------------------------------------- grounding

test('grounding keeps hunk-intersecting findings and drops hallucinated lines', () => {
  const lineIndex = new Map([['a.ts', new Set([10, 11, 12])]]);
  const files = new Set(['a.ts']);
  const { kept, dropped } = ground(
    [
      { id: '1', file: 'a.ts', start_line: 11, end_line: 11, kind: 'finding' },
      { id: '2', file: 'a.ts', start_line: 90, end_line: 91, kind: 'finding' },
      { id: '3', file: 'b.ts', start_line: 1, end_line: 1, kind: 'finding' },
    ],
    lineIndex,
    files,
  );
  assert.deepEqual(kept.map((f) => f.id), ['1']);
  assert.deepEqual(dropped.map((d) => d.finding.id), ['2', '3']);
});

test('grounding does NOT drop full-file kinds that miss a hunk', () => {
  // The regression this guards: a naive "must intersect a hunk" filter deletes every secret leak.
  const lineIndex = new Map([['a.ts', new Set([10])]]);
  const { kept } = ground(
    [{ id: 's', file: 'a.ts', start_line: 999, end_line: 999, kind: 'secret_leak' }],
    lineIndex,
    new Set(['a.ts']),
  );
  assert.deepEqual(kept.map((f) => f.id), ['s']);
});

test('deterministic findings bypass grounding entirely', () => {
  const { kept } = ground(
    [{ id: 'd', file: '.', start_line: 0, end_line: 0, kind: 'hook', deterministic: true }],
    new Map(),
    new Set(),
  );
  assert.equal(kept.length, 1);
});

// ---------------------------------------------------------------- secrets

test('secret patterns match real shapes', () => {
  const hits = (s) => SECRET_PATTERNS.filter((p) => p.re.test(s)).map((p) => p.id);
  assert.deepEqual(hits(`const k = "ghp_${'a'.repeat(36)}"`), ['github-token']);
  // pr-self-review-ignore: INV-SECRET — literals under test, not credentials
  assert.deepEqual(hits('AKIA1234567890ABCDEF'), ['aws-access-key']);
  // pr-self-review-ignore: INV-SECRET — literals under test, not credentials
  assert.deepEqual(hits('-----BEGIN RSA PRIVATE KEY-----'), ['private-key']);
  assert.ok(hits(`sk-${'a'.repeat(32)}`).includes('openai-key'));
  assert.ok(hits(`sk-ant-${'a'.repeat(32)}`).includes('anthropic-key'));
});

test('secret patterns do not fire on references or ordinary words', () => {
  const any = (s) => SECRET_PATTERNS.some((p) => p.re.test(s));
  assert.equal(any('const key = process.env.OPENAI_API_KEY;'), false);
  assert.equal(any('const task-runner = 1;'), false); // "sk-" inside a word
  assert.equal(any('// see docs/agent-prompts/security-reviewer.md'), false);
  assert.equal(any('AKIA_PREFIX_ONLY'), false);
});

test('maskSecret never echoes a whole credential', () => {
  const secret = `ghp_${'x'.repeat(36)}`;
  const masked = maskSecret(secret);
  assert.equal(masked.includes(secret), false);
  assert.match(masked, /^ghp_x{2}…x{2} \(40 chars\)$/);
});

// ---------------------------------------------------------------- patch maths

test('netDelta counts only the target file', () => {
  const patch = [
    'diff --git a/x.json b/x.json',
    '--- a/x.json',
    '+++ b/x.json',
    '@@ -1,2 +1,3 @@',
    ' keep',
    '+added one',
    '+added two',
    '-removed one',
    'diff --git a/y.json b/y.json',
    '--- a/y.json',
    '+++ b/y.json',
    '@@ -1,1 +1,1 @@',
    '+unrelated',
    '',
  ].join('\n');
  assert.deepEqual(netDelta(patch, 'x.json'), { added: 2, removed: 1, net: 1 });
  assert.deepEqual(netDelta(patch, 'y.json'), { added: 1, removed: 0, net: 1 });
});

test('parsePatch numbers new-side lines correctly across a removal', () => {
  const patch = ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -5,3 +5,3 @@', ' ctx', '-gone', '+fresh', ' tail', ''].join('\n');
  const info = parsePatch(patch).get('a.ts');
  assert.deepEqual(info.added, [{ line: 6, text: 'fresh' }]);
  assert.deepEqual([...info.newLines].sort((a, b) => a - b), [5, 6, 7]);
});

// ---------------------------------------------------------------- routing globs

test('globToRe handles the shapes the routing table uses', () => {
  assert.ok(globToRe('server/src/**').test('server/src/db/client.ts'));
  assert.ok(globToRe('server/src/modules/**/routes.ts').test('server/src/modules/pulls/routes.ts'));
  assert.ok(globToRe('server/src/modules/**/routes.ts').test('server/src/modules/routes.ts'));
  assert.ok(globToRe('client/src/**/*.test.tsx').test('client/src/components/a/A.test.tsx'));
  assert.ok(globToRe('client/next.config.*').test('client/next.config.mjs'));
  assert.equal(globToRe('server/src/**').test('client/src/a.ts'), false);
  assert.equal(globToRe('**/*.test.tsx').test('a/b/C.tsx'), false);
});

// ---------------------------------------------------------------- cache identity

test('the cache key changes when the SKILL.md changes, not just the file', () => {
  const a = cacheKey('file1', 'react-best-practices', 'skillA');
  assert.notEqual(a, cacheKey('file2', 'react-best-practices', 'skillA'), 'file content must matter');
  assert.notEqual(a, cacheKey('file1', 'react-best-practices', 'skillB'), 'skill revision must matter');
  assert.notEqual(a, cacheKey('file1', 'next-best-practices', 'skillA'), 'skill identity must matter');
  assert.equal(a, cacheKey('file1', 'react-best-practices', 'skillA'), 'must be stable');
});

// ---------------------------------------------------------------- fail-fast

test('the fail-fast gate ignores suppressed findings', () => {
  // Regression: an accepted fixture credential would otherwise short-circuit every future run,
  // so the fan-out would never happen again.
  const dir = mkdtempSync(join(tmpdir(), 'prsr-ff-'));
  writeFileSync(join(dir, 'fixture.ts'), 'const k = "AKIA0000000000000000"; // pr-self-review-ignore: INV-SECRET — test fixture\n', 'utf8');

  const suppressed = { rule_id: 'INV-SECRET', severity: 'CRITICAL', file: 'fixture.ts', start_line: 1, end_line: 1 };
  assert.deepEqual(decideEarlyExit([{ ...suppressed }], { root: dir }).earlyExit, false);

  const real = { rule_id: 'INV-MIGRATION', severity: 'CRITICAL', file: 'fixture.ts', start_line: 1, end_line: 1 };
  assert.equal(decideEarlyExit([{ ...real }], { root: dir }).earlyExit, true, 'a different rule is not covered by that directive');
  assert.equal(decideEarlyExit([{ ...real }], { root: dir, force: true }).earlyExit, false, '--force-review continues anyway');
});

// ---------------------------------------------------------------- inline suppression

test('inline suppression needs a rule id AND a reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prsr-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'src', 'a.ts'),
    [
      /* 1 */ 'const a = 1; // pr-self-review-ignore: R6 — repository lives one layer up here',
      /* 2 */ 'const filler = 0;',
      /* 3 */ 'const b = 2; // pr-self-review-ignore: R6',
      /* 4 */ '// pr-self-review-ignore: R7 -- ascii dashes are accepted too',
      /* 5 */ 'const c = 3;',
    ].join('\n'),
    'utf8',
  );

  const mk = (line, rule) => ({ file: 'src/a.ts', start_line: line, end_line: line, rule_id: rule, severity: 'CRITICAL' });
  const findings = [mk(1, 'R6'), mk(3, 'R6'), mk(5, 'R7'), mk(1, 'R9')];
  applySuppression(findings, dir);

  assert.ok(findings[0].suppressed, 'reason given → suppressed');
  assert.match(findings[0].suppressed.reason, /repository lives one layer up/);
  assert.equal(findings[1].suppressed, undefined, 'no reason → must NOT parse');
  assert.ok(findings[2].suppressed, 'directive on the line above applies');
  assert.equal(findings[3].suppressed, undefined, 'a directive for another rule does not apply');
});

#!/usr/bin/env node
// One deterministic test run for the agent pipeline, done ONCE by the main session after the last
// implementer phase (and again after fixes): the CI lanes of every package the branch touches — the
// same command table as /pr-self-review's `checks.mjs` — plus the server integration lane.
//
//   node scripts/verify.mjs [--base <ref>] [--packages server,client,reviewer-core,mcp,shared]
//                           [--no-integration] [--out .devdigest/plans/<NN-slug>.verify.json]
//   node scripts/verify.mjs --fingerprint        print the working-tree fingerprint (read-only)
//   node scripts/verify.mjs --check <json>       fresh | stale: was <json> produced on this exact tree? (read-only)
//
// The JSON is bound to a fingerprint of HEAD + the uncommitted diff + untracked files, so plan-verifier
// can cite it as observed evidence (a script ran it, not an LLM) instead of re-running every suite.
// Why: implementer phases and the verifier each re-ran full suites — every run is a turn that re-sends
// the agent's whole context, and the integration lane alone takes minutes.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { planChecks } from '../.claude/skills/pr-self-review/scripts/checks.mjs';
import { changedFiles, defaultBase, mergeBaseOf } from './diff-index.mjs';

const TIMEOUT_MS = 15 * 60 * 1000;
const TAIL_LINES = 30;
export const DEFAULT_OUT = '.devdigest/plans/verify.json';

const INTEGRATION = { pkg: 'server', name: 'integration', cmd: 'pnpm exec vitest run .it.test', cwd: 'server' };

/** `--packages` → one representative path per package, so `planChecks` picks the same lanes as for a real diff. */
export function pathsForPackages(list) {
  const map = {
    server: ['server/src/x'],
    client: ['client/src/x'],
    'reviewer-core': ['reviewer-core/src/x'],
    mcp: ['mcp/src/x'],
    shared: ['server/src/vendor/shared/x', 'client/src/vendor/shared/x'],
  };
  return list.flatMap((p) => {
    if (!map[p]) throw new Error(`unknown package "${p}" — one of ${Object.keys(map).join(', ')}`);
    return map[p];
  });
}

/** The lanes for these paths: `checks.mjs` + the server integration lane (skipped, and said so, without Docker). */
export function checksFor(paths, { integration = true, docker = false } = {}) {
  const checks = planChecks(paths);
  if (integration && paths.some((p) => /^(?:server|reviewer-core)\//.test(p))) {
    checks.push(docker ? { ...INTEGRATION } : { ...INTEGRATION, skipped: 'Docker unavailable — the *.it.test.ts files would self-skip' });
  }
  return checks;
}

/** vitest's summary lines: `Test Files  12 passed (12)`, `Tests  73 passed | 2 skipped (75)`. */
export function parseCounts(output) {
  const clean = String(output).replace(/\x1b\[[0-9;]*m/g, '');
  const pick = (label) => {
    const m = clean.match(new RegExp(`^\\s*${label}\\s+(.+?)\\s*$`, 'm'));
    if (!m) return null;
    const counts = {};
    for (const [, n, kind] of m[1].matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)) counts[kind] = Number(n);
    return Object.keys(counts).length ? counts : null;
  };
  const files = pick('Test Files');
  const tests = pick('Tests');
  return files || tests ? { files, tests } : null;
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

/** HEAD + the uncommitted diff + every untracked, non-ignored file: what the tests actually ran on. */
export function fingerprint(root) {
  const h = createHash('sha256');
  h.update(git(root, 'rev-parse', 'HEAD'));
  h.update(git(root, 'diff', 'HEAD', '--binary'));
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').toString('utf8').split('\0').filter(Boolean).sort();
  for (const p of untracked) {
    h.update(`${p}\0`);
    try {
      h.update(readFileSync(join(root, p)));
    } catch {
      h.update('<unreadable>');
    }
  }
  return h.digest('hex').slice(0, 16);
}

function dockerAvailable() {
  return spawnSync('docker info', { shell: true, stdio: 'ignore', timeout: 30_000 }).status === 0;
}

function execute(check, root) {
  const started = Date.now();
  // shell:true because pnpm/npm are .cmd shims on Windows (same as checks.mjs)
  const res = spawnSync(check.cmd, {
    cwd: join(root, check.cwd),
    shell: true,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  const ok = res.status === 0;
  return {
    pkg: check.pkg,
    name: check.name,
    cmd: `cd ${check.cwd} && ${check.cmd}`,
    ok,
    code: res.status ?? 1,
    sec: Math.round((Date.now() - started) / 1000),
    counts: parseCounts(output),
    ...(ok ? {} : { tail: output.split('\n').slice(-TAIL_LINES).join('\n'), error: res.error ? String(res.error.message) : undefined }),
  };
}

function countsText(c) {
  if (!c?.tests) return '';
  return Object.entries(c.tests).map(([k, n]) => `${n} ${k}`).join(' | ');
}

export function renderSummary(record, out) {
  const lines = [
    `verify: ${record.ok ? 'OK' : 'FAIL'} · fingerprint ${record.fingerprint} · ${record.results.length} lane(s) · ${out}`,
  ];
  if (record.tree_changed_during_run) lines.push('WARNING the tree changed during the run — the record is already stale');
  for (const r of record.results) {
    const status = r.skipped ? 'SKIP' : r.ok ? 'ok  ' : 'FAIL';
    const detail = r.skipped ? r.skipped : `${r.sec}s ${countsText(r.counts)}`.trim();
    lines.push(`  ${status} ${`${r.pkg} ${r.name}`.padEnd(26)} ${detail}`);
    if (!r.ok && r.tail) lines.push(...r.tail.split('\n').map((l) => `       ${l}`));
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[a.slice(2)] = next;
      i++;
    } else {
      args[a.slice(2)] = true;
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const root = resolve(git(process.cwd(), 'rev-parse', '--show-toplevel').toString('utf8').trim());

  if (args.fingerprint) {
    process.stdout.write(`${fingerprint(root)}\n`);
    return 0;
  }
  if (args.check) {
    const record = JSON.parse(readFileSync(args.check, 'utf8'));
    const now = fingerprint(root);
    const fresh = record.fingerprint === now && !record.tree_changed_during_run;
    process.stdout.write(
      fresh
        ? `fresh · ${now} · ${record.ok ? 'OK' : 'FAIL'} · ${record.generated_at}\n`
        : `stale · record ${record.fingerprint} · tree ${now} — re-run node scripts/verify.mjs\n`,
    );
    return fresh ? 0 : 1;
  }

  const base = typeof args.base === 'string' ? args.base : defaultBase();
  const paths =
    typeof args.packages === 'string'
      ? pathsForPackages(args.packages.split(',').map((s) => s.trim()).filter(Boolean))
      : changedFiles(mergeBaseOf(base)).map((f) => f.path);
  const out = typeof args.out === 'string' ? args.out : DEFAULT_OUT;
  const checks = checksFor(paths, { integration: !args['no-integration'], docker: dockerAvailable() });

  const fp = fingerprint(root);
  const results = [];
  for (const check of checks) {
    if (check.skipped) {
      results.push({ pkg: check.pkg, name: check.name, cmd: `cd ${check.cwd} && ${check.cmd}`, ok: null, skipped: check.skipped });
      continue;
    }
    process.stderr.write(`· ${check.cwd}: ${check.cmd}\n`);
    const r = execute(check, root);
    results.push(r);
    if (!r.ok && check.name === 'install') break; // a failed install poisons every later lane of that package
  }

  const record = {
    tool: 'scripts/verify.mjs',
    generated_at: new Date().toISOString(),
    base: typeof args.packages === 'string' ? null : base,
    packages: typeof args.packages === 'string' ? args.packages : null,
    head: git(root, 'rev-parse', 'HEAD').toString('utf8').trim(),
    fingerprint: fp,
    tree_changed_during_run: fingerprint(root) !== fp,
    ok: results.every((r) => r.ok !== false),
    results,
  };
  const outPath = resolve(root, out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
  if (spawnSync('git', ['check-ignore', '-q', outPath], { cwd: root }).status !== 0) {
    process.stderr.write(`warning: ${out} is not git-ignored — it changes the fingerprint, so --check will say stale\n`);
  }
  process.stdout.write(`${renderSummary(record, out)}\n`);
  return record.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`verify.mjs: ${err.message}\n`);
    process.exitCode = 2;
  }
}

// Phase 3 — the verification lane, plus the fail-fast gate.
//
// Runs exactly what CI would run for the packages present in the diff, then decides whether the
// expensive LLM fan-out is worth starting at all. Reviewing code that does not compile is money
// thrown away, and it is the most common case.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { outDir, parseArgs, readJson, repoRoot, writeJson } from './lib.mjs';
import { applySuppression } from './report.mjs';

/**
 * The fail-fast decision must respect inline suppression. Otherwise one legitimately suppressed
 * finding — a credential-shaped literal in a test fixture, say — short-circuits every future
 * review and the fan-out never runs again.
 */
export function decideEarlyExit(deterministic, { force = false, root = repoRoot() } = {}) {
  applySuppression(deterministic, root);
  const blockers = deterministic.filter((f) => f.severity === 'CRITICAL' && !f.suppressed);
  return { blockers, earlyExit: blockers.length > 0 && !force };
}

const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Commands are the `pnpm exec …` / `npm run …` forms CI uses rather than named scripts:
 * the local `server/package.json` diverges from the committed one, so named scripts are not
 * a reliable contract.
 */
function planChecks(paths) {
  const touches = (re) => paths.some((p) => re.test(p));
  const server = touches(/^server\//);
  const core = touches(/^reviewer-core\//);
  const client = touches(/^client\//);
  const sharedServer = touches(/^server\/src\/vendor\/shared\//);

  const checks = [];

  // reviewer-core deps must exist before ANY server typecheck: the server imports its raw TS
  // source via tsconfig paths, and that source imports openai/zod.
  if ((server || core) && !existsSync(join(repoRoot(), 'reviewer-core', 'node_modules'))) {
    checks.push({ pkg: 'reviewer-core', name: 'install', cmd: 'npm ci', cwd: 'reviewer-core' });
  }

  if (server || core) {
    checks.push(
      { pkg: 'server', name: 'typecheck', cmd: 'pnpm typecheck', cwd: 'server' },
      { pkg: 'server', name: 'lint', cmd: 'pnpm exec eslint .', cwd: 'server' },
      {
        pkg: 'server',
        name: 'arch',
        cmd: 'pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known',
        cwd: 'server',
      },
      {
        pkg: 'server',
        name: 'unit',
        cmd: 'pnpm exec vitest run --exclude "**/*.it.test.ts"',
        cwd: 'server',
      },
    );
  }

  if (client) {
    checks.push(
      { pkg: 'client', name: 'typecheck', cmd: 'pnpm typecheck', cwd: 'client' },
      { pkg: 'client', name: 'lint', cmd: 'pnpm lint', cwd: 'client' },
      { pkg: 'client', name: 'test', cmd: 'pnpm test', cwd: 'client' },
    );
  }

  if (core || sharedServer) {
    checks.push(
      { pkg: 'reviewer-core', name: 'typecheck', cmd: 'npm run typecheck', cwd: 'reviewer-core' },
      { pkg: 'reviewer-core', name: 'test', cmd: 'npm test', cwd: 'reviewer-core' },
    );
  }

  return checks;
}

function run(check, root) {
  const started = Date.now();
  // shell:true because pnpm/npm are .cmd shims on Windows. Double quotes inside `cmd` survive
  // both cmd.exe and /bin/sh, which single quotes do not.
  const res = spawnSync(check.cmd, {
    cwd: join(root, check.cwd),
    shell: true,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  const output = `${stdout}${stderr}`.trim();
  return {
    ...check,
    code: res.status ?? (res.error ? 1 : 0),
    ok: res.status === 0,
    ms: Date.now() - started,
    error: res.error ? String(res.error.message ?? res.error) : null,
    tail: output.split('\n').slice(-25).join('\n'),
  };
}

function toFinding(result) {
  return {
    id: `CHECK-${result.pkg}-${result.name}`,
    rule_id: `CHECK-${result.pkg}-${result.name}`,
    source_skill: 'pr-self-review/checks',
    severity: 'CRITICAL',
    category: result.name === 'test' || result.name === 'unit' ? 'test' : 'bug',
    kind: 'hook',
    title: `\`${result.cmd}\` failed in \`${result.cwd}/\` (exit ${result.code})`,
    file: `${result.cwd}/`,
    start_line: 0,
    end_line: 0,
    rationale:
      `CI runs this exact command for a diff touching \`${result.cwd}/\`, so this PR cannot go green.\n\n` +
      '```\n' +
      result.tail.replace(/```/g, "'''") +
      '\n```',
    suggestion: `Reproduce locally: \`cd ${result.cwd} && ${result.cmd}\`.`,
    confidence: 1,
    deterministic: true,
  };
}

export function runChecks({ skip = false, quiet = false } = {}) {
  const root = repoRoot();
  const dir = outDir();
  const plan = readJson(join(dir, 'plan.json'));
  if (!plan) throw new Error('plan.json not found — run collect.mjs first');

  const paths = (plan.files ?? []).filter((f) => !f.noise).map((f) => f.path);
  const planned = planChecks(paths);

  if (skip) {
    return { skipped: true, results: [], findings: [], planned: planned.map((c) => `${c.cwd}: ${c.cmd}`) };
  }

  const results = [];
  for (const check of planned) {
    if (!quiet) process.stderr.write(`· ${check.cwd}: ${check.cmd}\n`);
    const r = run(check, root);
    results.push(r);
    // An install failure poisons every later check in that package — stop the lane here.
    if (!r.ok && r.name === 'install') break;
  }

  return { skipped: false, results, findings: results.filter((r) => !r.ok).map(toFinding), planned: [] };
}

if (process.argv[1]?.endsWith('checks.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const dir = outDir();

  const res = runChecks({ skip: !!args.skip, quiet: !!args.quiet });
  writeJson(join(dir, 'check-findings.json'), res.findings);

  // Merge with the Phase 2 invariants and decide the fail-fast gate in one place.
  const invariants = readJson(join(dir, 'invariant-findings.json'), []) ?? [];
  const preflight = (readJson(join(dir, 'plan.json'), {}) ?? {}).preflight_findings ?? [];
  const deterministic = [...preflight, ...invariants, ...res.findings];
  const { blockers, earlyExit } = decideEarlyExit(deterministic, { force: !!args['force-review'] });
  // written after the decision so the file records the suppression marks too
  writeJson(join(dir, 'deterministic-findings.json'), deterministic);

  process.stdout.write(
    `${JSON.stringify(
      {
        checks_skipped: res.skipped,
        ran: res.results.map((r) => ({ cmd: `${r.cwd}: ${r.cmd}`, ok: r.ok, code: r.code, sec: Math.round(r.ms / 1000) })),
        planned_but_skipped: res.planned,
        deterministic_findings: deterministic.length,
        blockers: blockers.map((f) => `${f.rule_id} ${f.file}:${f.start_line} — ${f.title}`),
        early_exit: earlyExit,
        next: earlyExit
          ? 'STOP — do not fan out. Run report.mjs with --stopped-at deterministic.'
          : 'Proceed to the skill fan-out (Phase 4).',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(earlyExit ? 1 : 0);
}

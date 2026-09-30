// Phase 4 support — the per-(file, skill) findings cache.
//
// The real loop is "run → fix two files → run again". Without a cache every re-run costs full
// price. The cache key includes the skill's own SKILL.md sha, so editing a skill's rules
// invalidates everything that skill ever cached.
//
//   node cache.mjs plan                      → routes-to-run.json + cached-findings.json
//   node cache.mjs store                     → persist this run's findings
//   node cache.mjs clear                     → drop the cache

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { ensureOut, outDir, parseArgs, readJson, writeJson } from './lib.mjs';

const cacheDir = () => join(outDir(), 'cache');
const entryPath = (key) => join(cacheDir(), `${key}.json`);

/** Split every route into what must be reviewed now and what can be restored. */
export function planRun(plan, { useCache = true } = {}) {
  const toRun = [];
  const restored = [];

  for (const route of plan.routes ?? []) {
    const fresh = [];
    for (const f of route.files) {
      const hit = useCache ? readJson(entryPath(f.cache_key), null) : null;
      if (hit && Array.isArray(hit.findings)) restored.push(...hit.findings);
      else fresh.push(f);
    }
    if (fresh.length > 0) toRun.push({ ...route, files: fresh });
  }
  return { toRun, restored };
}

/** Persist one entry per (file, skill) pair that was actually reviewed this run. */
export function store(routesToRun, findings) {
  ensureOut();
  let written = 0;
  for (const route of routesToRun) {
    for (const f of route.files) {
      const forFile = findings.filter((x) => x.file === f.path && x.source_skill === route.skill);
      // A negative result is worth caching too — most files have no findings.
      writeJson(entryPath(f.cache_key), { skill: route.skill, path: f.path, findings: forFile });
      written++;
    }
  }
  return written;
}

if (process.argv[1]?.endsWith('cache.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? 'plan';
  const dir = ensureOut();

  if (cmd === 'clear') {
    if (existsSync(cacheDir())) rmSync(cacheDir(), { recursive: true, force: true });
    ensureOut();
    process.stdout.write(`${JSON.stringify({ cleared: true })}\n`);
    process.exit(0);
  }

  const plan = readJson(join(dir, 'plan.json'));
  if (!plan) {
    process.stderr.write('plan.json not found — run collect.mjs first\n');
    process.exit(2);
  }

  if (cmd === 'plan') {
    const { toRun, restored } = planRun(plan, { useCache: !args['no-cache'] });
    writeJson(join(dir, 'routes-to-run.json'), toRun);
    writeJson(join(dir, 'cached-findings.json'), restored);
    process.stdout.write(
      `${JSON.stringify(
        {
          restored_findings: restored.length,
          cached_files: (plan.routes ?? []).reduce((n, r) => n + r.files.length, 0) - toRun.reduce((n, r) => n + r.files.length, 0),
          routes_to_run: toRun.map((r) => ({ skill: r.skill, skill_path: r.skill_path, files: r.files.map((f) => f.path) })),
        },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }

  if (cmd === 'store') {
    const routes = readJson(join(dir, 'routes-to-run.json'), []) ?? [];
    const findings = readJson(join(dir, 'agent-findings.json'), []) ?? [];
    const n = store(routes, findings);
    process.stdout.write(`${JSON.stringify({ entries_written: n, cache_size: existsSync(cacheDir()) ? readdirSync(cacheDir()).length : 0 })}\n`);
    process.exit(0);
  }

  process.stderr.write(`Unknown command "${cmd}" (plan|store|clear)\n`);
  process.exit(2);
}

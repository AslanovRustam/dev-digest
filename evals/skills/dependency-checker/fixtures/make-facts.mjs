#!/usr/bin/env node
// Regenerates fixtures/repo/dependency-facts.md — the frozen output of the REAL collector
// (.claude/skills/dependency-checker/scripts/collect.mjs) over the fixture repository.
//
//   node evals/skills/dependency-checker/fixtures/make-facts.mjs
//
// node_modules cannot be committed, so this copies fixtures/repo to a temp folder, fakes each
// installed dependency (package.json + one file truncated to the size below — no real bytes
// written), runs the collector there and normalizes date/commit so the file only changes when the
// fixture or the collector does. Re-run it after changing either; commit the result.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, 'repo');
const COLLECT = resolve(HERE, '../../../../.claude/skills/dependency-checker/scripts/collect.mjs');
const OUT = join(REPO, 'dependency-facts.md');
const MB = 1024 * 1024;

// package folder → dependency → [installed version, size in MB, bin names]
const INSTALLED = {
  server: {
    'drizzle-orm': ['0.36.0', 8.1], fastify: ['5.1.0', 6.5], moment: ['2.30.1', 4.2], pg: ['8.13.0', 3.8],
    zod: ['3.23.8', 2.1], tsx: ['4.19.0', 0.5, ['tsx']], typescript: ['5.6.3', 22.5, ['tsc']], vitest: ['2.1.4', 1.6, ['vitest']],
  },
  client: {
    '@tanstack/react-query': ['5.59.0', 4.1], 'date-fns': ['4.1.0', 22.0], next: ['15.0.3', 132.0, ['next']],
    react: ['19.0.0', 0.3], 'react-dom': ['19.0.0', 6.9], zod: ['3.22.4', 1.9],
    tailwindcss: ['3.4.14', 5.0, ['tailwindcss']], typescript: ['5.6.3', 22.5, ['tsc']], vitest: ['2.1.4', 1.6, ['vitest']],
  },
  'reviewer-core': {
    zod: ['3.23.8', 2.1], tsx: ['4.19.0', 0.5, ['tsx']], typescript: ['5.6.3', 22.5, ['tsc']],
  },
  mcp: {
    '@modelcontextprotocol/sdk': ['1.0.0', 4.0], zod: ['4.1.0', 3.6], typescript: ['5.6.3', 22.5, ['tsc']],
  },
  e2e: {
    playwright: ['1.48.2', 3.2, ['playwright']], typescript: ['5.6.3', 22.5, ['tsc']],
  },
};

const tmp = mkdtempSync(join(tmpdir(), 'depcheck-fixture-'));
try {
  cpSync(REPO, join(tmp, 'repo'), { recursive: true, filter: (src) => !src.endsWith('dependency-facts.md') });
  const root = join(tmp, 'repo');
  for (const [pkg, deps] of Object.entries(INSTALLED)) {
    for (const [name, [version, mb, bins = []]] of Object.entries(deps)) {
      const dir = join(root, pkg, 'node_modules', ...name.split('/'));
      mkdirSync(dir, { recursive: true });
      const bin = bins.length ? Object.fromEntries(bins.map((b) => [b, `bin/${b}.js`])) : undefined;
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, ...(bin ? { bin } : {}) }));
      const payload = join(dir, 'payload.bin');
      writeFileSync(payload, '');
      truncateSync(payload, Math.round(mb * MB)); // apparent size only — the collector reads lstat().size
    }
  }
  const r = spawnSync(process.execPath, [COLLECT, '--root', root, '--out', join(tmp, 'out')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`collector failed:\n${r.stderr || r.stdout}`);
  const factsPath = /FACTS: (.+\.facts\.md)/.exec(r.stdout)?.[1]?.trim();
  if (!factsPath) throw new Error(`no FACTS line in:\n${r.stdout}`);
  const facts = readFileSync(factsPath, 'utf8')
    .replace(/\d{4}-\d{2}-\d{2}/g, '2026-01-01')
    .replace(/\bnogit\b|\b[0-9a-f]{7}\b(?= ·| \n|$)/gm, 'fixture');
  writeFileSync(OUT, facts);
  console.log(`wrote ${OUT}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

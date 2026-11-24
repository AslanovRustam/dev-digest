#!/usr/bin/env node
// Собирает рабочую фикстуру для одного eval-кейса: fixtures/base + fixtures/cases/<case>.
//
//   node .claude/skills/onion-architecture/evals/assemble.mjs <case> <outDir>
//   node .claude/skills/onion-architecture/evals/assemble.mjs --check
//
// --check: собирает каждый кейс во временную папку и падает, если в фикстурах есть
// слова-подсказки (кейс должен быть «слепым») или если у кейса нет записи в evals.json.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, 'fixtures', 'base');
const casesDir = join(here, 'fixtures', 'cases');
const evalsJson = join(here, 'evals.json');

/** Слова, которых не должно быть в фикстуре: они выдали бы, где заложено нарушение. */
const HINTS = /\b(violation|violates|planted|bad example|anti-?pattern|FIXME|TODO|wrong layer|should not)\b/i;

export function assemble(caseName, outDir) {
  const overlay = join(casesDir, caseName);
  if (!existsSync(overlay)) throw new Error(`unknown case '${caseName}' (see ${casesDir})`);
  mkdirSync(outDir, { recursive: true });
  cpSync(base, outDir, { recursive: true });
  cpSync(overlay, outDir, { recursive: true });
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function check() {
  const cases = readdirSync(casesDir);
  const registered = JSON.parse(readFileSync(evalsJson, 'utf8')).evals.map((e) => e.fixture);
  const problems = [];
  for (const c of cases) {
    if (!registered.includes(c)) problems.push(`case '${c}' has no entry in evals.json`);
    const tmp = mkdtempSync(join(tmpdir(), 'onion-eval-'));
    try {
      assemble(c, tmp);
      const overlay = join(casesDir, c);
      for (const f of walk(overlay)) {
        const rel = f.slice(overlay.length + 1);
        if (existsSync(join(base, rel))) continue; // copy of a base file, not authored by the case
        const hit = readFileSync(f, 'utf8').match(HINTS);
        if (hit) problems.push(`${c}: hint word '${hit[0]}' in ${rel}`);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  for (const r of registered) if (!cases.includes(r)) problems.push(`evals.json points to missing case '${r}'`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`ok: ${cases.length} cases (${cases.join(', ')})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2);
  if (a === '--check') check();
  else if (a && b) assemble(a, resolve(b));
  else {
    console.error('usage: assemble.mjs <case> <outDir> | --check');
    process.exit(2);
  }
}

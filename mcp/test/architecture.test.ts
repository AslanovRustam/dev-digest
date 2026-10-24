/**
 * Ring rules MR1-MR8, asserted in the unit lane.
 *
 *   1. Runs the SAME `.dependency-cruiser.cjs` as `npm run arch` and expects 0 violations
 *      (no baseline: greenfield).
 *   2. Greps `src/**` for what depcruise cannot see, because these are globals:
 *      `fetch(` outside adapters/, `process.env` outside config.ts, and anything that writes
 *      to stdout (the stdio protocol channel) anywhere.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise, type ICruiseResult } from 'dependency-cruiser';
import extractDepcruiseConfig from 'dependency-cruiser/config-utl/extract-depcruise-config';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listSources(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** Drops comments so a doc line that mentions `fetch(` or `console.log` is not a finding. */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const FETCH_CALL = /(?<![\w.$])fetch\s*\(/;
const PROCESS_ENV = /\bprocess\s*\.\s*env\b/;
const STDOUT_WRITE = /\bconsole\s*\.\s*(log|info|debug)\s*\(|\bprocess\s*\.\s*stdout\b/;

const rel = (file: string): string => path.relative(root, file).split(path.sep).join('/');

function offenders(pattern: RegExp, allowed: (relPath: string) => boolean): string[] {
  return listSources(srcDir)
    .map(rel)
    .filter((f) => !allowed(f))
    .filter((f) => pattern.test(stripComments(readFileSync(path.join(root, f), 'utf8'))));
}

async function cruiseMcp(): Promise<ICruiseResult> {
  const config = await extractDepcruiseConfig(path.join(root, '.dependency-cruiser.cjs'));
  // `validate: true` is NOT implied by passing a ruleSet; without it violations is silently [].
  const result = await cruise(['src'], { ...config.options, ruleSet: config, validate: true });
  return result.output as ICruiseResult;
}

describe('mcp onion rings', () => {
  it('has no dependency-cruiser violation (MR1, MR3-MR8)', async () => {
    const { summary } = await cruiseMcp();
    expect(
      summary.violations.map((v) => `${v.rule.name} :: ${v.from} -> ${v.to}`),
    ).toEqual([]);
    expect(summary.totalCruised).toBeGreaterThan(10);
  });

  it('MR2: fetch( only in adapters/**', () => {
    expect(offenders(FETCH_CALL, (f) => f.startsWith('src/adapters/'))).toEqual([]);
  });

  it('MR2: process.env only in config.ts', () => {
    expect(offenders(PROCESS_ENV, (f) => f === 'src/config.ts')).toEqual([]);
  });

  it('never writes to stdout from src (console.log / info / debug, process.stdout)', () => {
    expect(offenders(STDOUT_WRITE, () => false)).toEqual([]);
  });

  it('the grep patterns can fail (they flag the code they are meant to catch)', () => {
    expect(FETCH_CALL.test('const r = await fetch(url)')).toBe(true);
    expect(FETCH_CALL.test('createHttpApi(config, fetchFn)')).toBe(false);
    expect(PROCESS_ENV.test('const k = process.env.KEY')).toBe(true);
    expect(STDOUT_WRITE.test('console.log("x")')).toBe(true);
    expect(STDOUT_WRITE.test('process.stdout.write("x")')).toBe(true);
    expect(STDOUT_WRITE.test('console.error("x")')).toBe(false);
    expect(FETCH_CALL.test(stripComments('// calls fetch(x) here\nconst a = 1'))).toBe(false);
  });
});

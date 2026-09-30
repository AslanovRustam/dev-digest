/**
 * reviewer-core is ring 0 of the Onion: the pure review engine.
 *
 * "Pure" here means one thing precisely — the only side effect is the INJECTED
 * `LLMProvider`. No DB, no filesystem, no network of its own, no `process.env`.
 * That is what lets the CI runner and the studio server share this code and what
 * lets `run.test.ts` exercise the whole pipeline against a mock provider.
 *
 * Purity is not self-enforcing: it breaks the moment someone adds a dependency
 * or reaches for `node:fs`. The server side is guarded by dependency-cruiser
 * (`server/.dependency-cruiser.cjs`), but this package deliberately has only two
 * dependencies and must not gain a third just to police itself — so the fence is
 * this test.
 *
 * See `.claude/skills/onion-architecture/SKILL.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

/** The only runtime dependencies ring 0 is allowed to have. */
const ALLOWED_DEPENDENCIES = ['openai', 'zod'];

/** Bare specifiers a source file may import. Anything else is an outer ring. */
const ALLOWED_SPECIFIERS = [/^openai(\/|$)/, /^zod(\/|$)/, /^@devdigest\/shared(\/|$)/];

/** Node builtins, with and without the `node:` prefix — all of them mean I/O. */
const NODE_BUILTINS = [
  'fs', 'path', 'os', 'crypto', 'child_process', 'http', 'https', 'net', 'tls',
  'dns', 'stream', 'zlib', 'worker_threads', 'process', 'url', 'util', 'events',
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Every module specifier in the file: static imports, re-exports and dynamic import(). */
function specifiersOf(source: string): string[] {
  const out: string[] = [];
  const patterns = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) out.push(m[1]!);
  }
  return out;
}

describe('reviewer-core purity (ring 0)', () => {
  it('has exactly the two allowed runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
    };
    // Adding a dependency is the only way purity really breaks, so this is the
    // strongest and cheapest of the two assertions.
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(ALLOWED_DEPENDENCIES);
  });

  it('imports nothing but relative paths, openai, zod and @devdigest/shared', () => {
    const offenders: string[] = [];

    for (const file of tsFiles(srcDir)) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      for (const spec of specifiersOf(readFileSync(file, 'utf-8'))) {
        if (spec.startsWith('.')) continue;

        const bare = spec.replace(/^node:/, '').split('/')[0]!;
        if (spec.startsWith('node:') || NODE_BUILTINS.includes(bare)) {
          offenders.push(`${rel} imports node builtin "${spec}" — ring 0 performs no I/O`);
          continue;
        }
        if (!ALLOWED_SPECIFIERS.some((re) => re.test(spec))) {
          offenders.push(`${rel} imports "${spec}" — not allowed in ring 0`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

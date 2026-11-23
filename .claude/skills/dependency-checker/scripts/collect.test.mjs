// node --test collect.test.mjs — synthetic repository in a temp folder; never touches the real one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  classifyFile, collect, extractSpecifiers, fmtBytes, highestVersion, packageNameOf, proposeCommand, renderCandidates, renderFacts,
  stripJsonc, typesTarget,
} from './collect.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'collect.mjs');
let root;
const w = (rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return Buffer.byteLength(content);
};

// ---- fixture sizes we assert on
let usedLibBytes;
let linkedBytes;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'depcheck-'));

  // ---- package a: pnpm-style, aliases, a pin, every usage state
  w('a/package.json', JSON.stringify({
    name: 'pkg-a',
    scripts: { test: 'toolbin run' },
    dependencies: { 'used-lib': '^1.0.0', 'unused-lib': '^1.0.0', 'test-lib': '^1.0.0', linked: '1.0.0', zod: '^3.0.0' },
    devDependencies: { 'tool-lib': '^1.0.0', '@types/used-lib': '^1.0.0', 'dev-in-prod': '^1.0.0', 'stale-dev': '^1.0.0' },
  }));
  w('a/pnpm-lock.yaml', '');
  w('a/tsconfig.json', `{
    // comments and trailing commas are legal in a tsconfig
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@shared": ["./src/vendor/shared/index.ts"],
        "@shared/*": ["./src/vendor/shared/*"],
        "zod": ["./node_modules/zod"],
      },
    },
  }`);
  w('a/src/main.ts', [
    'import { x } from "used-lib";',
    'import y from "@shared/types";',
    'import z from "dev-in-prod/sub";',
    'import { z2 } from "zod";',
    'import fs from "node:fs";',
    'import "ghost-lib";',
    'import l from "linked";',
  ].join('\n'));
  w('a/src/main.test.ts', 'import t from "test-lib";\n');
  w('a/test/fixtures/sample-repo/index.ts', 'import x from "fixture-only-lib";\n'); // another project's code
  w('a/src/vendor/shared/index.ts', 'export const a = 1;\n');
  w('a/src/vendor/shared/types.ts', 'export type T = string;\r\n');

  usedLibBytes = w('a/node_modules/used-lib/package.json', JSON.stringify({ name: 'used-lib', version: '1.2.3' }))
    + w('a/node_modules/used-lib/index.js', 'x'.repeat(1000));
  w('a/node_modules/used-lib/node_modules/inner/index.js', 'y'.repeat(5000)); // nested: must NOT count
  w('a/node_modules/unused-lib/package.json', JSON.stringify({ name: 'unused-lib', version: '1.0.0' }));
  w('a/node_modules/test-lib/package.json', JSON.stringify({ name: 'test-lib', version: '1.0.0' }));
  w('a/node_modules/tool-lib/package.json', JSON.stringify({ name: 'tool-lib', version: '1.0.0', bin: { toolbin: 'bin.js' } }));
  w('a/node_modules/dev-in-prod/package.json', JSON.stringify({ name: 'dev-in-prod', version: '1.0.0' }));
  w('a/node_modules/@types/used-lib/package.json', JSON.stringify({ name: '@types/used-lib', version: '1.0.0' }));
  w('a/node_modules/zod/package.json', JSON.stringify({ name: 'zod', version: '3.1.0' }));
  w('a/node_modules/stale-dev/package.json', JSON.stringify({ name: 'stale-dev', version: '1.4.0' }));
  linkedBytes = w('a/node_modules/.store/linked-real/package.json', JSON.stringify({ name: 'linked', version: '1.0.0' }))
    + w('a/node_modules/.store/linked-real/index.js', 'z'.repeat(2000));
  // pnpm: node_modules/<dep> is a link into the store — the size must come from the real path
  symlinkSync(join(root, 'a/node_modules/.store/linked-real'), join(root, 'a/node_modules/linked'), 'junction');

  // ---- package b: npm-style, drifted version, relative import around the alias, a diverged copy
  w('b/package.json', JSON.stringify({ name: 'pkg-b', dependencies: { 'used-lib': '^2.0.0' } }));
  w('b/package-lock.json', '{}');
  w('b/tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@shared/*': ['./src/vendor/shared/*'], '@shared': ['./src/vendor/shared/index.ts'] } } }));
  w('b/src/vendor/shared/index.ts', 'export const a = 2;\n'); // changed vs a
  w('b/src/vendor/shared/types.ts', 'export type T = string;\n'); // CRLF vs LF only → identical
  w('b/src/vendor/shared/extra.ts', 'export const e = 1;\n'); // only in b
  w('b/src/use.ts', 'import { m } from "../../a/src/main";\nimport u from "used-lib";\n');
  w('b/node_modules/used-lib/package.json', JSON.stringify({ name: 'used-lib', version: '2.0.1' }));

  // ---- package c: dev-only (an e2e-style package) — its code is test code, nothing is "misplaced"
  w('c/package.json', JSON.stringify({ name: 'pkg-c', devDependencies: { 'browser-lib': '1.0.0' } }));
  w('c/package-lock.json', '{}');
  w('c/flows/login.flow.ts', 'import { launch } from "browser-lib";\n');
  w('c/node_modules/browser-lib/package.json', JSON.stringify({ name: 'browser-lib', version: '1.0.0' }));

  // ---- package d: uses used-lib at a third major, but shares no code with a or b (an mcp-style package)
  w('d/package.json', JSON.stringify({ name: 'pkg-d', dependencies: { 'used-lib': '^3.0.0' } }));
  w('d/package-lock.json', '{}');
  w('d/src/index.ts', 'import u from "used-lib";\n');
  w('d/node_modules/used-lib/package.json', JSON.stringify({ name: 'used-lib', version: '3.0.0' }));
});

after(() => rmSync(root, { recursive: true, force: true }));

// ------------------------------------------------------------------ pure helpers

test('stripJsonc: comments and trailing commas, but not "//" inside strings', () => {
  const j = JSON.parse(stripJsonc('{ // c\n "u": "http://x", /* b */ "a": [1,2,], }'));
  assert.deepEqual(j, { u: 'http://x', a: [1, 2] });
});

test('packageNameOf / typesTarget', () => {
  assert.equal(packageNameOf('@scope/pkg/deep/file'), '@scope/pkg');
  assert.equal(packageNameOf('pkg/sub'), 'pkg');
  assert.equal(typesTarget('@types/react-dom'), 'react-dom');
  assert.equal(typesTarget('@types/foo__bar'), '@foo/bar');
  assert.equal(typesTarget('react'), null);
});

test('extractSpecifiers: static, multi-line, export-from, side-effect, dynamic, require — with lines', () => {
  const src = [
    'import {',
    '  a,',
    '  b,',
    '} from "multi";',
    'export * from "reexport";',
    'import "side-effect";',
    'const m = await import("dyn");',
    'const r = require("req");',
  ].join('\n');
  const got = Object.fromEntries(extractSpecifiers(src).map((s) => [s.spec, s.line]));
  assert.deepEqual(got, { multi: 4, reexport: 5, 'side-effect': 6, dyn: 7, req: 8 });
});

test('classifyFile', () => {
  assert.equal(classifyFile('src/a.test.ts'), 'test');
  assert.equal(classifyFile('test/helpers.ts'), 'test');
  assert.equal(classifyFile('vitest.config.ts'), 'config');
  assert.equal(classifyFile('scripts/seed.ts'), 'config');
  assert.equal(classifyFile('src/service.ts'), 'prod');
});

test('fmtBytes', () => {
  assert.equal(fmtBytes(null), '—');
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(2048), '2.0 KB');
  assert.equal(fmtBytes(5 * 1024 ** 2), '5.0 MB');
});

// ------------------------------------------------------------------ the synthetic repository

test('discovers packages and their package manager from the lockfile', () => {
  const f = collect({ root });
  assert.deepEqual(f.packages.map((p) => [p.name, p.manager]), [['a', 'pnpm'], ['b', 'npm'], ['c', 'npm'], ['d', 'npm']]);
  assert.equal(f.mode, 'offline');
});

test('size is the dependency\'s own files: nested node_modules excluded, links resolved to the real path', () => {
  const a = collect({ root }).packages[0];
  const dep = (n) => a.deps.find((d) => d.name === n);
  assert.equal(dep('used-lib').bytes, usedLibBytes);
  assert.equal(dep('used-lib').resolved, '1.2.3');
  assert.equal(dep('linked').bytes, linkedBytes);
});

test('usage states and flags', () => {
  const a = collect({ root }).packages[0];
  const dep = (n) => a.deps.find((d) => d.name === n);
  assert.equal(dep('used-lib').usage, 'prod');
  assert.equal(dep('unused-lib').usage, 'none');
  assert.ok(dep('unused-lib').flags.includes('unused'));
  assert.equal(dep('test-lib').usage, 'tests-only');
  assert.ok(dep('test-lib').flags.includes('prod-dep-only-in-tests'));
  assert.equal(dep('tool-lib').usage, 'tooling', 'a bin used in package.json scripts is tooling, not unused');
  assert.ok(!dep('tool-lib').flags.includes('unused'));
  assert.equal(dep('@types/used-lib').usage, 'types-companion');
  assert.ok(dep('dev-in-prod').flags.includes('dev-dep-in-prod-code'));
});

test('a devDependency used in the code of a package that ships no runtime deps is not flagged', () => {
  const c = collect({ root }).packages.find((p) => p.name === 'c');
  const dep = c.deps.find((d) => d.name === 'browser-lib');
  assert.equal(dep.usage, 'prod');
  assert.deepEqual(dep.flags, []);
});

test('an alias into the own node_modules is a pin: still a use of the dependency, never an internal edge', () => {
  const f = collect({ root });
  const a = f.packages[0];
  assert.equal(a.deps.find((d) => d.name === 'zod').usage, 'prod');
  assert.deepEqual(a.pins.map((p) => p.alias), ['zod']);
  assert.ok(!a.aliases.some((x) => x.alias === 'zod'));
});

test('undeclared imports: ghost-lib yes; node: builtins, aliases and fixture folders no', () => {
  const a = collect({ root }).packages[0];
  assert.deepEqual(a.undeclared.map((u) => u.name), ['ghost-lib']);
});

test('alias use is counted per alias', () => {
  const a = collect({ root }).packages[0];
  assert.equal(a.aliasUse['@shared'].imports, 1);
});

test('version drift across packages flags a major difference', () => {
  const { drift } = collect({ root });
  assert.equal(drift.length, 1);
  assert.equal(drift[0].name, 'used-lib');
  assert.equal(drift[0].majorDiffers, true);
});

test('drift is split by the graph: linked packages (import / shared copy) vs an unlinked one', () => {
  const [d] = collect({ root }).drift;
  assert.deepEqual(d.linked.map((v) => v.package).sort(), ['a', 'b']);
  assert.deepEqual(d.isolated.map((v) => v.package), ['d']);
});

test('candidate lines carry the manager and a ready command in THAT package\'s manager', () => {
  const f = collect({ root });
  const md = renderFacts(f, f.heavyBytes);
  assert.match(md, /\[unused\] a\/unused-lib \(prod, pnpm, .*\) → propose: cd a && pnpm remove unused-lib/);
  assert.match(md, /\[unused-dev\] a\/stale-dev \(dev, pnpm, .*\) → propose: cd a && pnpm remove stale-dev/);
  assert.match(md, /\[prod-dep-only-in-tests\] a\/test-lib .* → propose: cd a && pnpm remove test-lib && pnpm add -D test-lib@1\.0\.0/);
  // linked drift: aligned to the highest LINKED version, with b's own manager (npm)
  assert.match(md, /\[drift-linked-major\] used-lib: .* → propose \(align to 2\.0\.1\): cd a && pnpm add used-lib@2\.0\.1/);
  assert.match(md, /\[drift-isolated\] used-lib: d 3\.0\.0 \(prod, npm\)/);
  assert.doesNotMatch(md, /--workspace|--filter/);
});

test('proposeCommand speaks each manager and knows nothing of workspaces', () => {
  const pnpm = { dir: 'server', manager: 'pnpm' };
  const npm = { dir: 'mcp', manager: 'npm' };
  assert.equal(proposeCommand(pnpm, 'remove', 'moment'), 'cd server && pnpm remove moment');
  assert.equal(proposeCommand(npm, 'remove', 'tsx'), 'cd mcp && npm uninstall tsx');
  assert.equal(proposeCommand(npm, 'set', 'zod', '3.23.8', 'prod'), 'cd mcp && npm install zod@3.23.8');
  assert.equal(proposeCommand(pnpm, 'set', 'vitest', '2.1.4', 'dev'), 'cd server && pnpm add -D vitest@2.1.4');
  assert.equal(proposeCommand({ dir: 'x', manager: 'unknown' }, 'remove', 'y'), null);
});

test('a heavy devDependency in 3+ packages is ONE [dup-dev-tool] fact, not N [heavy] findings', () => {
  const MB = 1024 * 1024;
  const pkg = (name) => ({
    name, dir: name, manager: 'npm', undeclared: [], pins: [],
    deps: [{ name: 'typescript', type: 'dev', bytes: 20 * MB, flags: [], usage: 'tooling' }],
  });
  const packages = ['p1', 'p2', 'p3'].map(pkg);
  const f = {
    packages, edges: [], aliasCopies: [], drift: [], heavyBytes: 10 * MB,
    summary: { top: packages.map((p) => ({ package: p.name, name: 'typescript', type: 'dev', bytes: 20 * MB })) },
  };
  const md = renderCandidates(f);
  assert.match(md, /\[dup-dev-tool\] typescript \(dev\) in 3 packages/);
  assert.doesNotMatch(md, /\[heavy\] p\d\/typescript/);
});

test('highestVersion compares numerically, not as strings', () => {
  assert.equal(highestVersion(['3.9.0', '3.23.8', '3.22.4']), '3.23.8');
});

test('a relative import into another package is a bypass edge (and says whether production code does it)', () => {
  const { edges } = collect({ root });
  const e = edges.find((x) => x.kind === 'relative-bypass');
  assert.deepEqual([e.from, e.to, e.imports, e.nonTest], ['b', 'a', 1, 1]);
  assert.match(e.examples[0], /src\/use\.ts:1/);
});

test('the same alias over two folders is compared by content; CRLF vs LF is not a change', () => {
  const { aliasCopies } = collect({ root });
  assert.equal(aliasCopies.length, 1);
  const c = aliasCopies[0];
  assert.equal(c.alias, '@shared');
  assert.equal(c.identical, false);
  assert.deepEqual(c.changed, ['index.ts']);
  assert.deepEqual(Object.values(c.onlyIn).flat(), ['extra.ts']);
  assert.deepEqual(c.copies.map((x) => x.owner).sort(), ['a', 'b']);
});

test('--package limits the packages but keeps edges toward the others', () => {
  const f = collect({ root, only: ['b'] });
  assert.deepEqual(f.packages.map((p) => p.name), ['b']);
  assert.equal(f.edges.find((x) => x.kind === 'relative-bypass').to, 'a');
});

test('renderFacts: the five blocks, a mermaid graph, no NaN', () => {
  const f = collect({ root });
  const md = renderFacts(f, f.heavyBytes);
  for (const h of ['## 1. Scope', '## 2. Dependency graph', '## 3. Size breakdown', '## 4. Finding candidates', '## 5. Limits']) {
    assert.ok(md.includes(h), h);
  }
  assert.ok(md.includes('```mermaid') && md.includes('flowchart LR'));
  assert.ok(!/NaN|undefined/.test(md));
  assert.match(md, /\[copy-diverged\] alias @shared/);
  assert.match(md, /\[bypass\] b → a/);
});

test('CLI writes .facts.md and .facts.json and prints their paths', () => {
  const out = join(root, 'out');
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, '--out', out, '--skip-total'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const m = /FACTS: (.+\.facts\.md)/.exec(r.stdout);
  assert.ok(m && existsSync(m[1].trim()));
  const json = JSON.parse(readFileSync(m[1].trim().replace('.facts.md', '.facts.json'), 'utf8'));
  assert.equal(json.packages.length, 4);
  assert.equal(json.packages[0].nodeModulesBytes, null, '--skip-total leaves the total empty');
});

test('CLI: an unknown flag is an error, not a silent default', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown argument/);
});

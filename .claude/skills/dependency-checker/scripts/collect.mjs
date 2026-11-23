#!/usr/bin/env node
// dependency-checker — the FACTS about every package's dependencies, gathered deterministically
// so the agent only has to judge (priorities, advice), never to measure. Repo-agnostic, zero
// dependencies, read-only on the repository.
//
//   node collect.mjs [--root <dir>] [--package <dir-name>]... [--online] [--out <dir>]
//                    [--heavy-mb <n>] [--skip-total] [--help]
//
// A "package" is every direct child folder of the root that has a package.json (the repo is
// NOT a workspace: each package has its own lockfile and node_modules). Writes
//   <out>/<YYYY-MM-DD>-<commit7>.facts.md    ready tables + a draft Mermaid graph + raw finding candidates
//   <out>/<YYYY-MM-DD>-<commit7>.facts.json  every number, per dependency
// and prints both paths with a one-line digest. Offline by default; --online adds
// `outdated` and `audit` (needs the network).
//
// Sizes: bytes of the dependency's own files on disk (apparent size), measured on the REAL
// path — pnpm links node_modules/<dep> into .pnpm, so a naive `du` is wrong off Windows —
// without its nested node_modules and without its transitive dependencies.
// Usage: import / export-from / require / dynamic import specifiers are matched by regex
// (comments are not stripped), so "unused" can miss a dependency, never invent one.

import {
  existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', 'coverage', '.turbo', 'out', 'clones',
  '.devdigest', 'playwright-report', 'test-results', '.cache',
  // Test fixtures hold OTHER projects' code (sample repos, code in strings): their imports are not
  // this package's usage and would show up as phantom `undeclared` dependencies.
  'fixtures', '__fixtures__',
]);
const SRC_EXT = /\.[cm]?[jt]sx?$/;
const DEP_SECTIONS = [
  ['dependencies', 'prod'],
  ['devDependencies', 'dev'],
  ['optionalDependencies', 'optional'],
  ['peerDependencies', 'peer'],
];
const CONFIG_FILE_RE = /^(?:.*\.config\.[cm]?[jt]s|\.eslintrc.*|\.prettierrc.*|postcss\..*|tsconfig.*\.json|\.babelrc.*)$/;
// Packages a framework needs without the app ever importing them.
const FRAMEWORK_IMPLICIT = {
  next: ['react', 'react-dom', 'typescript', 'postcss', 'tailwindcss', 'autoprefixer', /^eslint/],
};
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '').split('/')[0]));

// ------------------------------------------------------------------ small helpers

export const posix = (p) => p.split(sep).join('/');

export function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

/** Remove // and /* *\/ comments and trailing commas, so a tsconfig parses as JSON. */
export function stripJsonc(text) {
  const src = text.replace(/^﻿/, '');
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}
function readJsonc(path) {
  try { return JSON.parse(stripJsonc(readFileSync(path, 'utf8'))); } catch { return null; }
}

function* walkFiles(dir, skip = SKIP_DIRS) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    // Dirent of a symlink / junction is neither file nor directory: links are never followed.
    if (e.isDirectory()) { if (!skip.has(e.name)) yield* walkFiles(p, skip); }
    else if (e.isFile()) yield p;
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `@scope/name/sub` → `@scope/name`; `name/sub` → `name`. */
export function packageNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** `@types/foo__bar` → `@foo/bar`, `@types/react-dom` → `react-dom`. */
export function typesTarget(name) {
  const m = /^@types\/(.+)$/.exec(name);
  if (!m) return null;
  return m[1].includes('__') ? `@${m[1].replace('__', '/')}` : m[1];
}

function majorOf(version) {
  const m = /(\d+)\./.exec(String(version ?? '').replace(/^[^\d]*/, '') + '.');
  return m ? Number(m[1]) : null;
}

// ------------------------------------------------------------------ specifiers & classification

const SPEC_RES = [
  /\bimport\s+(?:type\s+)?[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /\brequire(?:\.resolve)?\s*\(\s*['"]([^'"]+)['"]/g,
];

/** Every module specifier in a JS/TS source text, with its 1-based line. */
export function extractSpecifiers(text) {
  const seen = new Set();
  const found = [];
  for (const re of SPEC_RES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const key = `${m.index}:${m[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const specAt = m.index + m[0].lastIndexOf(m[1]);
      found.push({ spec: m[1], line: text.slice(0, specAt).split('\n').length });
    }
  }
  return found;
}

/** prod | test | config — decides which column of the usage table an import counts in. */
export function classifyFile(rel) {
  if (/(^|\/)(__tests__|__mocks__|tests?|specs?|e2e)(\/|$)/.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)) return 'test';
  if (/(^|\/)[^/]*\.config\.[cm]?[jt]s$/.test(rel) || /^(?:scripts|tools|bin)\//.test(rel)) return 'config';
  return 'prod';
}

// ------------------------------------------------------------------ sizes

const sizeCache = new Map();

/** Own files of a package directory (real path), nested node_modules excluded. */
export function dirSize(dir) {
  const real = realpathSync(dir);
  if (sizeCache.has(real)) return sizeCache.get(real);
  let bytes = 0;
  let files = 0;
  for (const f of walkFiles(real, new Set(['node_modules']))) {
    try { bytes += lstatSync(f).size; files++; } catch { /* vanished */ }
  }
  const r = { bytes, files };
  sizeCache.set(real, r);
  return r;
}

/** Whole node_modules, every file once (hardlinks from the pnpm store are not double counted). */
export function nodeModulesTotal(pkgDir) {
  const root = join(pkgDir, 'node_modules');
  if (!existsSync(root)) return null;
  let bytes = 0;
  const links = new Set();
  for (const f of walkFiles(root, new Set())) {
    try {
      const st = lstatSync(f, { bigint: true });
      if (st.nlink > 1n) {
        const key = `${st.dev}:${st.ino}`;
        if (links.has(key)) continue;
        links.add(key);
      }
      bytes += Number(st.size);
    } catch { /* vanished */ }
  }
  return bytes;
}

function normalizeBin(bin, name) {
  if (typeof bin === 'string') return [name.split('/').pop()];
  if (bin && typeof bin === 'object') return Object.keys(bin);
  return [];
}

function installedInfo(pkgDir, name) {
  const dir = join(pkgDir, 'node_modules', ...name.split('/'));
  if (!existsSync(dir)) return null;
  let real;
  try { real = realpathSync(dir); } catch { return null; }
  const pj = readJson(join(real, 'package.json')) ?? {};
  const { bytes, files } = dirSize(real);
  return { version: pj.version ?? null, bytes, files, bin: normalizeBin(pj.bin, name), deprecated: pj.deprecated ?? null };
}

// ------------------------------------------------------------------ tsconfig aliases

export function loadTsPaths(tsconfigPath, seen = new Set()) {
  if (seen.has(tsconfigPath) || !existsSync(tsconfigPath)) return null;
  seen.add(tsconfigPath);
  const cfg = readJsonc(tsconfigPath);
  if (!cfg) return null;
  const dir = dirname(tsconfigPath);
  let result = { paths: {}, baseDir: dir };
  if (typeof cfg.extends === 'string' && cfg.extends.startsWith('.')) {
    const ext = resolve(dir, cfg.extends.endsWith('.json') ? cfg.extends : `${cfg.extends}.json`);
    const parent = loadTsPaths(ext, seen);
    if (parent) result = parent;
  }
  const co = cfg.compilerOptions ?? {};
  if (co.baseUrl) result.baseDir = resolve(dir, co.baseUrl);
  if (co.paths) {
    result.paths = co.paths;
    if (!co.baseUrl) result.baseDir = dir;
  }
  return result;
}

/** `paths` → [{ alias, target (absolute) }], one per alias name, longest alias first. */
export function aliasesOf(pkgDir) {
  const ts = loadTsPaths(join(pkgDir, 'tsconfig.json'));
  if (!ts) return [];
  const out = new Map();
  for (const [key, targets] of Object.entries(ts.paths)) {
    if (!Array.isArray(targets) || typeof targets[0] !== 'string') continue;
    const alias = key.replace(/\/?\*$/, '');
    if (!alias || out.has(alias)) continue;
    let target = resolve(ts.baseDir, targets[0].replace(/\/?\*$/, ''));
    // `@x/shared` → `./src/vendor/shared/index.ts`: the unit that matters is the folder.
    try { if (lstatSync(target).isFile()) target = dirname(target); } catch { /* may not exist */ }
    out.set(alias, target);
  }
  return [...out].map(([alias, target]) => ({ alias, target })).sort((a, b) => b.alias.length - a.alias.length);
}

const matchesAlias = (spec, alias) => spec === alias || spec.startsWith(`${alias}/`);
const isPin = (a) => a.target.split(sep).includes('node_modules');
const NPM_NAME = /^(?:@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]+$/; // lowercase, ≥ 2 chars: drops `x` from code in strings

function ownerOf(abs, pkgs) {
  let best = null;
  for (const p of pkgs) {
    const rel = relative(p.dir, abs);
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      if (!best || p.dir.length > best.dir.length) best = p;
    }
  }
  return best;
}

// ------------------------------------------------------------------ per-package scan

function scanSources(pkg, aliases, pkgs) {
  const usage = new Map();
  const bump = (name, cls) => {
    const u = usage.get(name) ?? { prod: 0, test: 0, config: 0 };
    u[cls]++;
    usage.set(name, u);
  };
  const aliasUse = new Map();
  const bypass = [];
  const imported = new Map();
  let sourceFiles = 0;

  for (const file of walkFiles(pkg.dir)) {
    const rel = posix(relative(pkg.dir, file));
    const isCss = /\.css$/.test(file);
    if (!SRC_EXT.test(file) && !isCss) continue;
    let text;
    try {
      if (lstatSync(file).size > 2_000_000) continue;
      text = readFileSync(file, 'utf8');
    } catch { continue; }
    if (isCss) {
      for (const m of text.matchAll(/@(?:import|plugin)\s+["']([^"']+)["']/g)) {
        if (!m[1].startsWith('.')) bump(packageNameOf(m[1]), 'config');
      }
      continue;
    }
    sourceFiles++;
    const cls = classifyFile(rel);
    for (const { spec, line } of extractSpecifiers(text)) {
      if (spec.startsWith('.')) {
        const owner = ownerOf(resolve(dirname(file), spec), pkgs);
        if (owner && owner.name !== pkg.name) bypass.push({ to: owner.name, file: rel, line, spec, cls });
        continue;
      }
      if (spec.startsWith('#') || spec.includes(':') || isAbsolute(spec)) continue;
      // An alias into the package's own node_modules is a version PIN of an npm dependency
      // (`"zod": ["./node_modules/zod"]`), not an internal link: it still counts as a use of it.
      const hit = aliases.find((a) => matchesAlias(spec, a.alias) && !isPin(a));
      if (hit) {
        const u = aliasUse.get(hit.alias) ?? { imports: 0, files: new Set() };
        u.imports++;
        u.files.add(rel);
        aliasUse.set(hit.alias, u);
        continue;
      }
      const name = packageNameOf(spec);
      if (BUILTINS.has(name) || name === pkg.json.name || !NPM_NAME.test(name)) continue;
      bump(name, cls);
      const im = imported.get(name) ?? { count: 0, example: `${rel}:${line}`, nonTest: 0 };
      im.count++;
      if (cls !== 'test') im.nonTest++;
      imported.set(name, im);
    }
  }

  // Configs refer to plugins by string, tsconfig `types` by `pkg/globals`: substring scan.
  const configTexts = [];
  try {
    for (const e of readdirSync(pkg.dir, { withFileTypes: true })) {
      if (e.isFile() && CONFIG_FILE_RE.test(e.name)) configTexts.push(readFileSync(join(pkg.dir, e.name), 'utf8'));
    }
  } catch { /* unreadable */ }

  return { usage, aliasUse, bypass, imported, configTexts, sourceFiles };
}

function scriptMentions(scriptsText, tokens) {
  return tokens.some((t) => new RegExp(`(?:^|[\\s;&|"'=:/\\\\])${escapeRe(t)}(?=$|[\\s;&|"'@/\\\\])`).test(scriptsText));
}

function isFrameworkImplicit(name, declaredNames) {
  for (const [framework, implied] of Object.entries(FRAMEWORK_IMPLICIT)) {
    if (!declaredNames.has(framework)) continue;
    if (implied.some((x) => (x instanceof RegExp ? x.test(name) : x === name))) return framework;
  }
  return null;
}

function analyzePackage(pkg, pkgs, opts) {
  const pj = pkg.json;
  const aliases = aliasesOf(pkg.dir);
  const scan = scanSources(pkg, aliases, pkgs);
  const manager = existsSync(join(pkg.dir, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(join(pkg.dir, 'package-lock.json')) ? 'npm'
      : existsSync(join(pkg.dir, 'yarn.lock')) ? 'yarn'
        : existsSync(join(pkg.dir, 'bun.lockb')) || existsSync(join(pkg.dir, 'bun.lock')) ? 'bun' : 'unknown';
  const scriptsText = Object.values(pj.scripts ?? {}).join('\n');

  const deps = [];
  for (const [section, type] of DEP_SECTIONS) {
    for (const [name, declared] of Object.entries(pj[section] ?? {})) deps.push({ name, type, declared });
  }
  const declaredNames = new Set(deps.map((d) => d.name));
  // A package with no runtime dependencies (an e2e / tooling package) ships nothing: its "src" is
  // test or tooling code, so a devDependency imported there is not misplaced.
  const shipsRuntime = deps.some((d) => d.type === 'prod' || d.type === 'optional');

  for (const d of deps) {
    const inst = installedInfo(pkg.dir, d.name);
    d.resolved = inst?.version ?? null;
    d.bytes = inst?.bytes ?? null;
    d.files = inst?.files ?? null;
    d.deprecated = inst?.deprecated ?? null;
    d.installed = Boolean(inst);

    const u = scan.usage.get(d.name) ?? { prod: 0, test: 0, config: 0 };
    d.imports = { prod: u.prod, test: u.test, config: u.config };
    const tokens = [d.name, ...(inst?.bin ?? [])];
    const inScripts = scriptMentions(scriptsText, tokens);
    const inConfigText = scan.configTexts.some((t) => ['"', "'", '`'].some((q) => t.includes(`${q}${d.name}`)));
    d.inScripts = inScripts;

    const companion = typesTarget(d.name);
    const framework = isFrameworkImplicit(d.name, declaredNames);
    if (u.prod) d.usage = 'prod';
    else if (u.test) d.usage = 'tests-only';
    else if (u.config || inScripts || inConfigText) d.usage = 'tooling';
    else if (companion) d.usage = 'types-companion';
    else if (framework) d.usage = 'framework-implicit';
    else d.usage = 'none';

    d.flags = [];
    if (!d.installed && d.type !== 'peer') d.flags.push('not-installed');
    // Separate tags: an unused devDependency never ships, so it ranks differently from an unused prod one.
    if (d.usage === 'none' && d.type !== 'peer') d.flags.push(d.type === 'dev' ? 'unused-dev' : 'unused');
    if ((d.type === 'prod' || d.type === 'optional') && d.usage === 'tests-only') d.flags.push('prod-dep-only-in-tests');
    if (d.type === 'prod' && d.usage === 'tooling') d.flags.push('prod-dep-only-tooling');
    if (d.type === 'dev' && d.usage === 'prod' && shipsRuntime) d.flags.push('dev-dep-in-prod-code');
    if (d.deprecated) d.flags.push('deprecated');
  }

  const undeclared = [...scan.imported]
    .filter(([name]) => !declaredNames.has(name))
    .map(([name, v]) => ({ name, count: v.count, example: v.example, onlyInTests: v.nonTest === 0 }));

  return {
    name: pkg.name,
    dir: pkg.rel,
    pkgName: pj.name ?? null,
    manager,
    nodeModulesBytes: opts.skipTotal ? null : nodeModulesTotal(pkg.dir),
    installed: existsSync(join(pkg.dir, 'node_modules')),
    sourceFiles: scan.sourceFiles,
    counts: Object.fromEntries(DEP_SECTIONS.map(([, t]) => [t, deps.filter((d) => d.type === t).length])),
    deps,
    undeclared,
    aliases: aliases.filter((a) => !isPin(a)),
    pins: aliases.filter(isPin).map((a) => ({ alias: a.alias, target: posix(relative(pkg.dir, a.target)) })),
    aliasUse: Object.fromEntries([...scan.aliasUse].map(([a, v]) => [a, { imports: v.imports, files: v.files.size }])),
    bypass: scan.bypass,
  };
}

// ------------------------------------------------------------------ cross-package facts

const isUnused = (d) => d.flags.includes('unused') || d.flags.includes('unused-dev');

/**
 * Packages that exchange values with another package: they import it (alias or relative) or share a
 * copied module with it (the same alias over two folders — typically contract types / schemas).
 * Version drift only matters between these; an unlinked package can run its own version.
 */
export function linkedPackages(edges, copies) {
  const linked = new Set();
  for (const e of edges) { linked.add(e.from); linked.add(e.to); }
  for (const c of copies) for (const copy of c.copies) { linked.add(copy.owner); copy.packages.forEach((p) => linked.add(p)); }
  return linked;
}

/** Each drift entry gets `linked` / `isolated` halves, so the ranking rule is data, not inference. */
export function splitDrift(drift, linked) {
  return drift.map((d) => ({
    ...d,
    linked: d.versions.filter((v) => linked.has(v.package)),
    isolated: d.versions.filter((v) => !linked.has(v.package)),
  }));
}

const versionOf = (v) => v.resolved ?? String(v.declared).replace(/^[~^>=<\s]+/, '');

/** Highest of a list of versions, compared numerically part by part. */
export function highestVersion(versions) {
  const parts = (s) => String(s).split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  return [...versions].sort((a, b) => {
    const pa = parts(a);
    const pb = parts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
    }
    return 0;
  })[0];
}

const PM = {
  pnpm: { remove: 'pnpm remove', add: 'pnpm add', addDev: 'pnpm add -D' },
  npm: { remove: 'npm uninstall', add: 'npm install', addDev: 'npm install -D' },
  yarn: { remove: 'yarn remove', add: 'yarn add', addDev: 'yarn add -D' },
  bun: { remove: 'bun remove', add: 'bun add', addDev: 'bun add -d' },
};

/**
 * The exact command for one package, in ITS manager — packages here do not share one. null when the
 * manager is unknown. Actions: remove · to-dev · to-prod (move between sections) · set (pin a version).
 */
export function proposeCommand(pkg, action, name, version, type = 'prod') {
  const pm = PM[pkg.manager];
  if (!pm) return null;
  const at = version ? `${name}@${version}` : name;
  const add = type === 'dev' ? pm.addDev : pm.add;
  const cmd = {
    remove: `${pm.remove} ${name}`,
    'to-dev': `${pm.remove} ${name} && ${pm.addDev} ${at}`,
    'to-prod': `${pm.remove} ${name} && ${pm.add} ${at}`,
    set: `${add} ${at}`,
  }[action];
  return cmd ? `cd ${pkg.dir} && ${cmd}` : null;
}

const FLAG_ACTION = {
  unused: 'remove',
  'unused-dev': 'remove',
  'prod-dep-only-in-tests': 'to-dev',
  'prod-dep-only-tooling': 'to-dev',
  'dev-dep-in-prod-code': 'to-prod',
};

export function versionDrift(packages) {
  const byName = new Map();
  for (const p of packages) {
    for (const d of p.deps) {
      if (d.type === 'peer') continue;
      const list = byName.get(d.name) ?? [];
      list.push({ package: p.name, type: d.type, declared: d.declared, resolved: d.resolved });
      byName.set(d.name, list);
    }
  }
  const drift = [];
  for (const [name, versions] of byName) {
    const distinct = new Set(versions.map((v) => v.resolved ?? v.declared));
    if (distinct.size < 2) continue;
    const majors = new Set(versions.map((v) => majorOf(v.resolved ?? v.declared)));
    drift.push({ name, majorDiffers: majors.size > 1, versions });
  }
  return drift.sort((a, b) => a.name.localeCompare(b.name));
}

function buildEdges(packages, pkgs) {
  const map = new Map();
  const add = (from, to, kind) => {
    const key = `${from}>${to}|${kind}`;
    if (!map.has(key)) map.set(key, { from, to, kind, aliases: [], imports: 0, nonTest: 0, examples: [] });
    return map.get(key);
  };
  for (const p of packages) {
    for (const a of p.aliases) {
      const owner = ownerOf(a.target, pkgs);
      if (!owner || owner.name === p.name) continue;
      const e = add(p.name, owner.name, 'alias');
      e.aliases.push(a.alias);
      e.imports += p.aliasUse[a.alias]?.imports ?? 0;
    }
    for (const b of p.bypass) {
      const e = add(p.name, b.to, 'relative-bypass');
      e.imports++;
      if (b.cls !== 'test') e.nonTest++;
      if (e.examples.length < 3) e.examples.push(`${b.file}:${b.line} → ${b.spec}`);
    }
  }
  return [...map.values()];
}

function dirDigest(dir) {
  const files = new Map();
  for (const f of walkFiles(dir, new Set(['node_modules']))) {
    try {
      const buf = readFileSync(f);
      const data = buf.includes(0) ? buf : Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'));
      files.set(posix(relative(dir, f)), createHash('sha1').update(data).digest('hex'));
    } catch { /* unreadable */ }
  }
  return files;
}

/** The same alias pointing at different folders = a copy that can drift (e.g. a vendored `shared`). */
export function aliasCopies(packages, root, pkgs = []) {
  const byAlias = new Map();
  for (const p of packages) {
    for (const a of p.aliases) {
      if (!existsSync(a.target) || a.target.includes(`${sep}node_modules`)) continue;
      const g = byAlias.get(a.alias) ?? new Map();
      let real;
      try { real = realpathSync(a.target); } catch { continue; }
      const entry = g.get(real) ?? { dir: real, packages: [] };
      entry.packages.push(p.name);
      g.set(real, entry);
      byAlias.set(a.alias, g);
    }
  }
  const out = [];
  for (const [alias, group] of byAlias) {
    if (group.size < 2) continue;
    const copies = [...group.values()];
    const digests = copies.map((c) => dirDigest(c.dir));
    const base = digests[0];
    const changed = new Set();
    const onlyIn = {};
    copies.forEach((c, i) => {
      if (i === 0) return;
      const d = digests[i];
      for (const [f, h] of d) {
        if (!base.has(f)) (onlyIn[posix(relative(root, c.dir))] ??= []).push(f);
        else if (base.get(f) !== h) changed.add(f);
      }
      for (const f of base.keys()) {
        if (!d.has(f)) (onlyIn[posix(relative(root, copies[0].dir))] ??= []).push(f);
      }
    });
    out.push({
      alias,
      copies: copies.map((c, i) => ({
        dir: posix(relative(root, c.dir)),
        owner: ownerOf(c.dir, pkgs)?.name ?? c.packages[0], // the package whose folder holds the copy
        packages: c.packages,
        files: digests[i].size,
      })),
      identical: changed.size === 0 && Object.keys(onlyIn).length === 0,
      changed: [...changed].sort().slice(0, 15),
      changedCount: changed.size,
      onlyIn: Object.fromEntries(Object.entries(onlyIn).map(([k, v]) => [k, [...new Set(v)].sort().slice(0, 15)])),
    });
  }
  return out;
}

// ------------------------------------------------------------------ online (best effort)

function runJson(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120_000, shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { error: r.error.message };
  try { return { data: JSON.parse(r.stdout) }; } catch { return { error: (r.stderr || r.stdout || `exit ${r.status}`).toString().slice(0, 200) }; }
}

function collectOnline(p, pkgDir) {
  const pm = p.manager === 'pnpm' ? 'pnpm' : 'npm';
  const result = { errors: [] };
  const out = runJson(pm, pm === 'pnpm' ? ['outdated', '--format', 'json'] : ['outdated', '--json'], pkgDir);
  if (out.error) result.errors.push(`outdated: ${out.error}`);
  else {
    for (const d of p.deps) {
      const o = out.data[d.name];
      if (!o) continue;
      d.latest = o.latest ?? null;
      d.majorBehind = majorOf(d.resolved ?? d.declared) != null && majorOf(o.latest) != null && majorOf(o.latest) > majorOf(d.resolved ?? d.declared);
      if (o.isDeprecated && !d.flags.includes('deprecated')) d.flags.push('deprecated');
    }
  }
  const aud = runJson(pm, ['audit', '--json'], pkgDir);
  if (aud.error) result.errors.push(`audit: ${aud.error}`);
  else {
    const items = [];
    const advisories = aud.data.advisories ?? {};
    for (const a of Object.values(advisories)) items.push({ name: a.module_name, severity: a.severity, title: a.title });
    for (const [name, v] of Object.entries(aud.data.vulnerabilities ?? {})) items.push({ name, severity: v.severity, title: (v.via ?? []).map((x) => x.title ?? x).filter((x) => typeof x === 'string').join('; ') });
    result.audit = { counts: aud.data.metadata?.vulnerabilities ?? null, items: items.slice(0, 30) };
  }
  return result;
}

// ------------------------------------------------------------------ renderers

const mmId = (s) => `n_${s.replace(/[^A-Za-z0-9]/g, '_')}`;

export function renderScope(f) {
  const rows = f.packages.map((p) => `| ${p.name} | ${p.manager} | ${p.counts.prod + p.counts.optional} | ${p.counts.dev} | ${p.counts.peer} | ${p.installed ? fmtBytes(p.nodeModulesBytes) : 'not installed'} |`);
  return [
    `Analyzed ${f.packages.length} packages · mode: ${f.mode} · commit ${f.commit} · ${f.date}`,
    '',
    '| package | manager | prod | dev | peer | node_modules (incl. transitive) |',
    '|---|---|---:|---:|---:|---:|',
    ...rows,
  ].join('\n');
}

export function renderGraph(f, heavyBytes) {
  const lines = ['flowchart LR'];
  for (const p of f.packages) lines.push(`  ${mmId(p.name)}["${p.name}\\n${p.manager}"]`);
  const heavy = new Map();
  for (const p of f.packages) {
    for (const d of p.deps) if ((d.bytes ?? 0) >= heavyBytes) heavy.set(d.name, Math.max(heavy.get(d.name) ?? 0, d.bytes));
  }
  if (heavy.size) {
    lines.push('  subgraph heavy["external deps ≥ ' + fmtBytes(heavyBytes) + '"]');
    for (const [name, bytes] of heavy) lines.push(`    ${mmId('x_' + name)}["${name}\\n${fmtBytes(bytes)}"]`);
    lines.push('  end');
  }
  const styles = [];
  let idx = 0;
  const link = (arrow, from, to, label, bad) => {
    lines.push(`  ${from} ${arrow}|"${label}"| ${to}`);
    if (bad) styles.push(`  linkStyle ${idx} stroke:#d33,stroke-width:2px`);
    idx++;
  };
  for (const e of f.edges) {
    if (e.kind === 'alias') link('-->', mmId(e.from), mmId(e.to), `${e.aliases.join(', ')} · ${e.imports} imports`, false);
    else link('-.->', mmId(e.from), mmId(e.to), `⚠ relative import · ${e.imports}${e.nonTest ? '' : ' (tests only)'}`, true);
  }
  for (const c of f.aliasCopies) {
    const [a, ...rest] = c.copies;
    for (const b of rest) {
      const from = mmId(b.owner);
      const to = mmId(a.owner);
      link('-.-', from, to, `${c.alias} copy ${c.identical ? 'identical' : `DIVERGED (${c.changedCount} changed)`}`, !c.identical);
    }
  }
  for (const p of f.packages) {
    for (const d of p.deps) {
      if ((d.bytes ?? 0) >= heavyBytes) link('-->', mmId(p.name), mmId('x_' + d.name), d.type, false);
    }
  }
  return ['```mermaid', ...lines, ...styles, '```'].join('\n');
}

export function renderSizes(f) {
  const out = [];
  for (const p of f.packages) {
    const sized = p.deps.filter((d) => d.bytes != null);
    const total = sized.reduce((s, d) => s + d.bytes, 0);
    out.push(`### ${p.name} — ${p.manager}, direct deps own size ${fmtBytes(total)}${p.nodeModulesBytes != null ? `, node_modules ${fmtBytes(p.nodeModulesBytes)}` : ''}`);
    if (!p.deps.length) { out.push('', '_no dependencies declared_', ''); continue; }
    out.push('', '| dependency | type | declared → resolved | size | % of direct | usage | flags |', '|---|---|---|---:|---:|---|---|');
    const sorted = [...p.deps].sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1) || a.name.localeCompare(b.name));
    for (const d of sorted) {
      const pct = d.bytes != null && total ? `${((d.bytes / total) * 100).toFixed(1)}%` : '—';
      out.push(`| ${d.name} | ${d.type} | ${d.declared} → ${d.resolved ?? 'n/a'} | ${fmtBytes(d.bytes)} | ${pct} | ${d.usage} | ${d.flags.join(', ') || '—'} |`);
    }
    out.push('');
  }
  out.push('### Top 10 across the repo (own size, per package)', '', '| # | package | dependency | type | size |', '|--:|---|---|---|---:|');
  f.summary.top.forEach((t, i) => out.push(`| ${i + 1} | ${t.package} | ${t.name} | ${t.type} | ${fmtBytes(t.bytes)} |`));
  return out.join('\n');
}

export function renderCandidates(f) {
  const L = [];
  for (const e of f.edges.filter((x) => x.kind === 'relative-bypass')) {
    L.push(`- [bypass] ${e.from} → ${e.to}: ${e.imports} relative import(s) around the alias, ${e.nonTest ? `${e.nonTest} in production code` : 'tests only'} — ${e.examples.join('; ')}`);
  }
  for (const c of f.aliasCopies.filter((x) => !x.identical)) {
    L.push(`- [copy-diverged] alias ${c.alias}: ${c.copies.map((x) => `${x.dir} (${x.files} files)`).join(' vs ')} — ${c.changedCount} changed: ${c.changed.slice(0, 6).join(', ') || '—'}; only in one copy: ${JSON.stringify(c.onlyIn)}`);
  }
  for (const c of f.aliasCopies.filter((x) => x.identical)) L.push(`- [copy-identical] alias ${c.alias}: ${c.copies.map((x) => x.dir).join(' = ')}`);
  const byName = new Map(f.packages.map((p) => [p.name, p]));
  const list = (vs) => vs.map((v) => `${v.package} ${versionOf(v)} (${v.type}, ${byName.get(v.package)?.manager ?? '?'})`).join(', ');
  const majorsDiffer = (vs) => new Set(vs.map((v) => majorOf(versionOf(v)))).size > 1;
  for (const d of f.drift) {
    const linked = d.linked ?? [];
    const isolated = d.isolated ?? d.versions;
    if (!linked.length) {
      L.push(`- [drift${majorsDiffer(isolated) ? '-major' : ''}] ${d.name}: ${list(isolated)} — none of these packages share code with each other`);
      continue;
    }
    if (new Set(linked.map(versionOf)).size > 1) {
      const target = highestVersion(linked.map(versionOf));
      const cmds = linked
        .filter((v) => versionOf(v) !== target)
        .map((v) => proposeCommand(byName.get(v.package), 'set', d.name, target, v.type))
        .filter(Boolean);
      L.push(`- [drift-linked${majorsDiffer(linked) ? '-major' : ''}] ${d.name}: ${list(linked)} — these packages import each other or share a copied module, so they exchange ${d.name} values${cmds.length ? ` → propose (align to ${target}): ${cmds.join(' ; ')}` : ''}`);
    }
    const linkedVersions = new Set(linked.map(versionOf));
    const odd = isolated.filter((v) => !linkedVersions.has(versionOf(v)));
    if (odd.length) {
      L.push(`- [drift-isolated] ${d.name}: ${list(odd)} vs ${[...linkedVersions].join(' / ')} in the linked packages — ${odd.map((v) => v.package).join(', ')} ${odd.length === 1 ? 'shares' : 'share'} no imports or copied modules with them, so this version does not have to match`);
    }
  }
  for (const p of f.packages) {
    for (const d of p.deps) {
      for (const flag of d.flags) {
        const action = FLAG_ACTION[flag];
        const cmd = action ? proposeCommand(p, action, d.name, d.resolved ?? versionOf(d), d.type) : null;
        L.push(`- [${flag}] ${p.name}/${d.name} (${d.type}, ${p.manager}, ${fmtBytes(d.bytes)}, usage ${d.usage})${cmd ? ` → propose: ${cmd}` : ''}`);
      }
      if (d.majorBehind) L.push(`- [outdated-major] ${p.name}/${d.name}: ${d.resolved ?? d.declared} → ${d.latest}`);
    }
    for (const pin of p.pins) L.push(`- [alias-pin] ${p.name}: tsconfig paths pin ${pin.alias} → ${pin.target} (a second copy of the dependency can be resolved by other packages' code)`);
    for (const u of p.undeclared) {
      L.push(`- [${u.onlyInTests ? 'undeclared-in-tests' : 'undeclared'}] ${p.name}: imports ${u.name} ×${u.count} (e.g. ${u.example}) but does not declare it${u.onlyInTests ? ' — may be code inside a test fixture string' : ''}`);
    }
    for (const it of p.online?.audit?.items ?? []) L.push(`- [vuln-${it.severity}] ${p.name}/${it.name}: ${it.title}`);
    for (const e of p.online?.errors ?? []) L.push(`- [online-error] ${p.name}: ${e}`);
  }
  // The same devDependency installed in 3+ independent packages (typescript, vitest…) is one fact,
  // not N findings: it is the expected cost of independent packages, not a reason for a workspace.
  const heavyDevByName = new Map();
  for (const p of f.packages) {
    for (const d of p.deps) {
      if (d.type === 'dev' && (d.bytes ?? 0) >= f.heavyBytes) heavyDevByName.set(d.name, [...(heavyDevByName.get(d.name) ?? []), p.name]);
    }
  }
  const duplicated = new Set([...heavyDevByName].filter(([, pkgs]) => pkgs.length >= 3).map(([name]) => name));
  for (const name of duplicated) {
    const pkgs = heavyDevByName.get(name);
    const one = f.packages.flatMap((p) => p.deps).find((d) => d.name === name && d.type === 'dev');
    L.push(`- [dup-dev-tool] ${name} (dev) in ${pkgs.length} packages (${pkgs.join(', ')}): ~${fmtBytes(one?.bytes)} each — expected cost of independent packages, never a reason to propose a workspace`);
  }
  for (const t of f.summary.top.filter((x) => x.bytes >= f.heavyBytes && !(x.type === 'dev' && duplicated.has(x.name)))) {
    L.push(`- [heavy] ${t.package}/${t.name} (${t.type}): ${fmtBytes(t.bytes)}`);
  }
  return L.length ? L.join('\n') : '_no candidates_';
}

export function renderFacts(f, heavyBytes) {
  return [
    `# Dependency facts — ${f.date} @ ${f.commit}`,
    '',
    '> Numbers below are measured, not estimated. Candidates are UNRANKED: assign P0–Info yourself.',
    '',
    '## 1. Scope', '', renderScope(f), '',
    '## 2. Dependency graph (draft — edit freely, keep edge facts)', '', renderGraph(f, heavyBytes), '',
    '## 3. Size breakdown', '', renderSizes(f), '',
    '## 4. Finding candidates (raw, unranked)', '', renderCandidates(f), '',
    '## 5. Limits of these facts', '',
    '- Size = the dependency\'s own files on its real path; transitive dependencies are not added to it.',
    '- `unused` is by static import scan + package.json scripts + config files; dynamic `require(variable)` and framework conventions can hide a real use — verify before removing.',
    '- `tests-only` / `tooling` mean no import from production code was found.',
    f.mode === 'offline' ? '- Offline run: no `outdated` / `audit` data. Re-run with `--online` for those.' : '- Online run: `outdated` / `audit` results are best-effort (see [online-error] lines).',
    '',
  ].join('\n');
}

// ------------------------------------------------------------------ main

export function discoverPackages(root, only = []) {
  const found = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (only.length && !only.includes(e.name)) continue;
    const dir = join(root, e.name);
    const json = readJson(join(dir, 'package.json'));
    if (json) found.push({ name: e.name, dir, rel: e.name, json });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function collect({ root, only = [], online = false, heavyMb = 10, skipTotal = false }) {
  const pkgs = discoverPackages(root, only);
  const allPkgs = only.length ? discoverPackages(root) : pkgs; // edges may point at a package outside --package
  const packages = pkgs.map((p) => analyzePackage(p, allPkgs, { skipTotal }));
  if (online) for (const p of packages) p.online = collectOnline(p, join(root, p.dir));
  const edges = buildEdges(packages, allPkgs);
  const copies = aliasCopies(packages, root, allPkgs);
  const drift = splitDrift(versionDrift(packages), linkedPackages(edges, copies));
  const heavyBytes = heavyMb * 1024 * 1024;
  const top = packages
    .flatMap((p) => p.deps.filter((d) => d.bytes != null).map((d) => ({ package: p.name, name: d.name, type: d.type, bytes: d.bytes })))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const commit = git(['rev-parse', '--short=7', 'HEAD']);
  const facts = {
    date: new Date().toISOString().slice(0, 10),
    commit: commit.status === 0 ? commit.stdout.trim() : 'nogit',
    mode: online ? 'online' : 'offline',
    heavyBytes,
    packages,
    edges,
    aliasCopies: copies,
    drift,
    summary: {
      top,
      unused: packages.flatMap((p) => p.deps.filter(isUnused).map((d) => `${p.name}/${d.name}`)),
      reclaimableBytes: packages.reduce((s, p) => s + p.deps.filter(isUnused).reduce((a, d) => a + (d.bytes ?? 0), 0), 0),
    },
  };
  return facts;
}

function parseArgs(argv) {
  const o = { only: [], online: false, heavyMb: 10, skipTotal: false, root: null, out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') o.root = argv[++i];
    else if (a === '--package') o.only.push(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--heavy-mb') o.heavyMb = Number(argv[++i]);
    else if (a === '--online') o.online = true;
    else if (a === '--skip-total') o.skipTotal = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

const HELP = `dependency-checker facts
  node collect.mjs [--root <dir>] [--package <dir-name>]... [--online] [--out <dir>] [--heavy-mb <n>] [--skip-total]
  --root        repository root (default: git top-level of cwd, else cwd)
  --package     limit to one package folder (repeatable)
  --online      also run \`outdated\` and \`audit\` per package (network)
  --out         default <root>/.devdigest/dependency-reports
  --heavy-mb    size that makes an external dep appear in the graph (default 10)
  --skip-total  do not walk node_modules for the per-package total (faster)`;

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(HELP); return; }
  let root = o.root ? resolve(o.root) : null;
  if (!root) {
    const g = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    root = g.status === 0 ? resolve(g.stdout.trim()) : process.cwd();
  }
  const facts = collect({ root, only: o.only, online: o.online, heavyMb: o.heavyMb, skipTotal: o.skipTotal });
  if (!facts.packages.length) throw new Error(`no package.json found in the child folders of ${root}`);
  const outDir = resolve(o.out ?? join(root, '.devdigest', 'dependency-reports'));
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `${facts.date}-${facts.commit}`);
  writeFileSync(`${base}.facts.json`, JSON.stringify(facts, null, 2));
  writeFileSync(`${base}.facts.md`, renderFacts(facts, facts.heavyBytes));
  const ignored = spawnSync('git', ['check-ignore', '-q', outDir], { cwd: root });
  console.log(`FACTS: ${base}.facts.md`);
  console.log(`JSON:  ${base}.facts.json`);
  console.log(`packages ${facts.packages.length} · unused ${facts.summary.unused.length} (${fmtBytes(facts.summary.reclaimableBytes)}) · drift ${facts.drift.length} · edges ${facts.edges.length} · bypass ${facts.edges.filter((e) => e.kind === 'relative-bypass').length} · diverged copies ${facts.aliasCopies.filter((c) => !c.identical).length}`);
  if (ignored.status === 1) console.log(`WARN: ${outDir} is not git-ignored — add it to .gitignore.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error(`dependency-checker: ${e.message}`); process.exit(1); }
}

// Phase 1 — deterministic collection: change set, noise filtering, skill routing, hashes.
//
// Writes  .devdigest/pr-self-review/diff.patch  and  plan.json.
// The routing table below is the MACHINE copy; references/routing.md documents it for humans.
// Keep the two in sync.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildDiff,
  diffHash,
  ensureOut,
  gitSafe,
  isProbablyBinary,
  outDir,
  parseArgs,
  parsePatch,
  repoRoot,
  sha256,
  writeJson,
  writeText,
} from './lib.mjs';
import { preflight } from './preflight.mjs';

// ---------------------------------------------------------------- glob

/** Minimal glob → RegExp. Supports `**`/`**​/`, `*`, `?`. Paths are posix, repo-relative. */
export function globToRe(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:[^/]+/)*';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\/'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`${re}$`);
}

const matchAny = (path, globs) => (globs ?? []).some((g) => globToRe(g).test(path));

// ---------------------------------------------------------------- tables

/** Paths whose churn is noise, never worth a reviewer's attention. */
const NOISE = [
  // Local variant diverges from the committed one — permanent diff noise.
  'server/package.json',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
];

/**
 * Prose, config and agent tooling: checked by the deterministic invariants only, never routed
 * to a reviewing skill. `.claude/**` is excluded so the skill does not review itself — the
 * dangerous case there (editing a vendored skill) is already an invariant.
 */
const NEVER_ROUTED = [
  '**/*.md',
  '**/*.mdc',
  '.github/workflows/**',
  'specs/**',
  '.claude/**',
  '**/messages/**/*.json',
];

/** Findings about test files are noise for these skills — their own guides say so. */
const TEST_FILES = ['**/*.test.ts', '**/*.test.tsx', '**/test/**', '**/__tests__/**', 'e2e/**'];

const CODE_SCOPE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * A file is routed to a skill when it matches `include`, OR when `content` matches one of its
 * ADDED lines (within `scope`). `exclude` always wins.
 */
const ROUTES = [
  { skill: 'onion-architecture', include: ['server/src/**', 'reviewer-core/src/**'] },
  {
    skill: 'fastify-best-practices',
    include: [
      'server/src/modules/**/routes.ts',
      'server/src/app.ts',
      'server/src/server.ts',
      'server/src/platform/**',
    ],
  },
  {
    skill: 'drizzle-orm-patterns',
    include: ['server/src/db/**', '**/repository.ts', '**/*.repo.ts'],
    exclude: ['server/src/db/migrations/**'],
  },
  {
    skill: 'postgresql-table-design',
    include: ['server/src/db/schema/**', 'server/src/db/migrations/**'],
  },
  { skill: 'frontend-ui-architecture', include: ['client/src/**'], exclude: ['client/src/vendor/**'] },
  { skill: 'next-best-practices', include: ['client/src/app/**', 'client/next.config.*'] },
  { skill: 'react-best-practices', include: ['client/src/**/*.tsx', 'client/src/lib/hooks/**'] },
  { skill: 'react-testing-library', include: ['client/src/**/*.test.tsx'] },
  {
    skill: 'zod',
    include: ['**/vendor/shared/contracts/**'],
    content: /(^|[^A-Za-z0-9_$.])z\.[a-z]/,
    scope: CODE_SCOPE,
  },
  {
    skill: 'security',
    include: ['server/src/modules/**/routes.ts', 'server/src/adapters/**', 'server/src/platform/config*'],
    exclude: TEST_FILES,
    content: /process\.env|\bexec(File|Sync)?\s*\(|\bspawn\s*\(|\bfs\.[a-z]|fetch\s*\(/,
    scope: CODE_SCOPE,
  },
  {
    // Conditional by design: type-level review is expensive and rarely the point of a PR.
    skill: 'typescript-expert',
    include: ['**/*.d.ts', '**/tsconfig*.json'],
    exclude: TEST_FILES,
    content: /\binfer\s+[A-Z]|as\s+unknown\s+as|<[A-Z]\w*\s+extends\s/,
    scope: CODE_SCOPE,
  },
];

const OVERSIZED_LINES = 2000;

// ---------------------------------------------------------------- collection

function changedPaths(mergeBase) {
  const seen = new Map();
  const add = (status, path) => {
    if (!path) return;
    const prev = seen.get(path);
    // A delete anywhere wins; otherwise keep the first status we saw.
    if (!prev || status === 'D') seen.set(path, status);
  };

  const parseNameStatus = (out) => {
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const status = parts[0][0];
      // Renames/copies report two paths — take the destination.
      add(status, parts[parts.length - 1].trim());
    }
  };

  if (mergeBase) {
    const r = gitSafe(['diff', '--name-status', '-M', mergeBase, 'HEAD']);
    if (r.ok) parseNameStatus(r.out);
  }
  const wt = gitSafe(['diff', '--name-status', '-M', 'HEAD']);
  if (wt.ok) parseNameStatus(wt.out);

  const un = gitSafe(['ls-files', '--others', '--exclude-standard']);
  if (un.ok) for (const p of un.out.split('\n').map((s) => s.trim()).filter(Boolean)) add('A', p);

  return [...seen.entries()].map(([path, status]) => ({ path, status })).sort((a, b) => a.path.localeCompare(b.path));
}

function skillSha(root, skill) {
  const p = join(root, '.claude', 'skills', skill, 'SKILL.md');
  try {
    return sha256(readFileSync(p, 'utf8')).slice(0, 16);
  } catch {
    return 'missing';
  }
}

/**
 * Cache identity for one (file, skill) pair. The skill's own SKILL.md sha is part of the key:
 * without it, editing a skill's rules would never re-review anything.
 */
export function cacheKey(contentSha, skill, skillSha) {
  return sha256(`${contentSha}|${skill}|${skillSha}`).slice(0, 32);
}

function fileContentSha(root, path, status) {
  if (status === 'D') return 'deleted';
  const abs = join(root, path);
  try {
    if (!statSync(abs).isFile()) return 'absent';
    return sha256(readFileSync(abs)).slice(0, 16);
  } catch {
    return 'absent';
  }
}

export function collect({ base, offline = false } = {}) {
  const root = repoRoot();
  const pre = preflight({ base, offline });
  if (pre.stop) return { stop: true, preflight: pre };

  const patch = buildDiff(pre.merge_base);
  const parsed = parsePatch(patch);
  const hash = diffHash(patch, pre.head_sha);

  const files = [];
  for (const { path, status } of changedPaths(pre.merge_base)) {
    const info = parsed.get(path);
    const added = info?.added ?? [];
    const changed = added.length;
    const abs = join(root, path);
    const binary = status !== 'D' && existsSync(abs) && isProbablyBinary(abs);

    const noise = matchAny(path, NOISE);
    const oversized = changed > OVERSIZED_LINES;
    const excluded = noise || oversized || binary || matchAny(path, NEVER_ROUTED);

    const routed = [];
    if (!excluded) {
      for (const rule of ROUTES) {
        if (matchAny(path, rule.exclude)) continue;
        let hit = matchAny(path, rule.include);
        if (!hit && rule.content && (!rule.scope || rule.scope.test(path))) {
          hit = added.some((l) => rule.content.test(l.text));
        }
        if (hit) routed.push(rule.skill);
      }
    }

    files.push({
      path,
      status,
      changed_lines: changed,
      binary,
      noise,
      oversized,
      routed_to: routed,
      content_sha: fileContentSha(root, path, status),
    });
  }

  const shaCache = new Map();
  const routes = [];
  for (const rule of ROUTES) {
    const picked = files.filter((f) => f.routed_to.includes(rule.skill));
    if (picked.length === 0) continue;
    if (!shaCache.has(rule.skill)) shaCache.set(rule.skill, skillSha(root, rule.skill));
    const sSha = shaCache.get(rule.skill);
    routes.push({
      skill: rule.skill,
      skill_path: `.claude/skills/${rule.skill}/SKILL.md`,
      skill_sha: sSha,
      files: picked.map((f) => ({
        path: f.path,
        cache_key: cacheKey(f.content_sha, rule.skill, sSha),
      })),
    });
  }

  return {
    stop: false,
    generated_at: new Date().toISOString(),
    branch: pre.branch,
    base_ref: pre.base_ref,
    merge_base: pre.merge_base,
    head_sha: pre.head_sha,
    diff_hash: hash,
    preflight_findings: pre.findings,
    stats: {
      files_total: files.length,
      files_routed: files.filter((f) => f.routed_to.length > 0).length,
      files_noise: files.filter((f) => f.noise).length,
      files_oversized: files.filter((f) => f.oversized).length,
      skills_matched: routes.length,
    },
    files,
    routes,
    patch,
  };
}

if (process.argv[1]?.endsWith('collect.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const res = collect({ base: typeof args.base === 'string' ? args.base : undefined, offline: !!args.offline });

  if (res.stop) {
    writeJson(join(ensureOut(), 'plan.json'), res);
    process.stdout.write(`${JSON.stringify({ stop: true, findings: res.preflight.findings }, null, 2)}\n`);
    process.exit(1);
  }

  const dir = ensureOut();
  const { patch, ...plan } = res;
  writeText(join(dir, 'diff.patch'), patch);
  writeJson(join(dir, 'plan.json'), plan);

  process.stdout.write(
    `${JSON.stringify(
      {
        diff_hash: plan.diff_hash,
        base_ref: plan.base_ref,
        stats: plan.stats,
        routes: plan.routes.map((r) => ({ skill: r.skill, files: r.files.length })),
        out: outDir(),
      },
      null,
      2,
    )}\n`,
  );
}

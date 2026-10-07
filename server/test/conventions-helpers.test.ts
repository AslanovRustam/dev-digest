import { describe, it, expect } from 'vitest';
import { ConventionCategory } from '@devdigest/shared';
import { CONVENTION_CATEGORIES } from '../src/db/schema/knowledge.js';
import {
  buildExtractionMessages,
  buildSkillDraft,
  clampConfidence,
  configCandidatesFor,
  diversifySample,
  groundCandidates,
  isProjectSource,
  isTrivialSample,
  knownConventions,
  locateSnippet,
  normaliseRepoPath,
  truncateForPrompt,
  type RawCandidate,
} from '../src/modules/conventions/helpers.js';

/**
 * Pure rules of the Conventions Extractor: sampling, the evidence gate and the
 * skill draft. No I/O.
 */

const USERS_TS = [
  "import { db } from '../lib/db.js';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
  '',
  'export async function getAdmin(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
].join('\n');

const raw = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  category: 'async',
  rule: 'Always use async/await instead of .then() chains',
  evidence_path: 'src/api/users.ts',
  evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
  evidence_line: 4,
  confidence: 0.91,
  ...over,
});

describe('normaliseRepoPath', () => {
  it('accepts repo-relative paths and normalises separators', () => {
    expect(normaliseRepoPath('src/a.ts')).toBe('src/a.ts');
    expect(normaliseRepoPath('./src/a.ts')).toBe('src/a.ts');
    expect(normaliseRepoPath('src\\api\\a.ts')).toBe('src/api/a.ts');
  });

  it('rejects anything that could escape the clone', () => {
    expect(normaliseRepoPath('../secrets.json')).toBeNull();
    expect(normaliseRepoPath('src/../../etc/passwd')).toBeNull();
    expect(normaliseRepoPath('/etc/passwd')).toBeNull();
    expect(normaliseRepoPath('C:/Windows/win.ini')).toBeNull();
    expect(normaliseRepoPath('src//a.ts')).toBeNull();
    expect(normaliseRepoPath('  ')).toBeNull();
  });
});

describe('locateSnippet', () => {
  it('finds a multi-line snippet across a blank line, ignoring indentation', () => {
    const loc = locateSnippet(USERS_TS, raw().evidence_snippet, null);
    expect(loc).toEqual({
      start: 4,
      end: 6,
      snippet: '  const user = await db.users.find(id);\n\n  const posts = await db.posts.findMany({ userId: id });',
    });
  });

  it('computes lines from the match — the model hint only picks between duplicates', () => {
    const snippet = 'const user = await db.users.find(id);';
    expect(locateSnippet(USERS_TS, snippet, null)?.start).toBe(4);
    expect(locateSnippet(USERS_TS, snippet, 12)?.start).toBe(11);
    expect(locateSnippet(USERS_TS, snippet, 999)?.start).toBe(11);
  });

  it('returns the file text, not the model text', () => {
    const loc = locateSnippet(USERS_TS, 'const   user =   await db.users.find(id);', 4);
    expect(loc?.snippet).toBe('  const user = await db.users.find(id);');
  });

  it('rejects snippets that are not in the file or prove nothing', () => {
    expect(locateSnippet(USERS_TS, 'const user = await db.users.findOne(id);', null)).toBeNull();
    expect(locateSnippet(USERS_TS, '}', null)).toBeNull();
    expect(locateSnippet(USERS_TS, '', null)).toBeNull();
    // lines present but not consecutive
    expect(
      locateSnippet(USERS_TS, "import { db } from '../lib/db.js';\nreturn user;", null),
    ).toBeNull();
  });
});

describe('groundCandidates', () => {
  const files = new Map<string, string | null>([
    ['src/api/users.ts', USERS_TS],
    ['src/missing.ts', null],
  ]);

  it('keeps a grounded candidate with server-computed lines and clamped confidence', () => {
    const out = groundCandidates([raw({ confidence: 91 })], files, knownConventions([]));
    expect(out.droppedUngrounded).toBe(0);
    expect(out.kept).toEqual([
      expect.objectContaining({
        evidencePath: 'src/api/users.ts',
        evidenceStartLine: 4,
        evidenceEndLine: 6,
        confidence: 0.91,
      }),
    ]);
  });

  it('drops a missing file, an invented snippet and a traversal path', () => {
    const out = groundCandidates(
      [
        raw({ evidence_path: 'src/missing.ts' }),
        raw({ rule: 'Other', evidence_snippet: 'await db.users.delete(id); // never here' }),
        raw({ rule: 'Third', evidence_path: '../src/api/users.ts' }),
        raw({ rule: 'Fourth', evidence_path: 'src/unknown.ts' }),
      ],
      files,
      knownConventions([]),
    );
    expect(out.kept).toHaveLength(0);
    expect(out.droppedUngrounded).toBe(4);
  });

  it('drops duplicates within the scan and against already-triaged rules', () => {
    const out = groundCandidates(
      [raw(), raw({ rule: 'ALWAYS use async/await instead of .then() chains!' }), raw({ rule: 'Known rule' })],
      files,
      knownConventions([{ rule: 'known rule', category: 'x', evidencePath: null, evidenceStartLine: null }]),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.droppedDuplicate).toBe(2);
  });

  it('treats a reworded rule with the same evidence as already known', () => {
    const out = groundCandidates(
      [raw()],
      files,
      knownConventions([
        { rule: 'Prefer await (edited)', category: 'async', evidencePath: 'src/api/users.ts', evidenceStartLine: 4 },
      ]),
    );
    expect(out.kept).toHaveLength(0);
    expect(out.droppedDuplicate).toBe(1);
  });
});

describe('diversifySample', () => {
  it('spreads a rank-ordered pool across top-level dirs, max N per directory first', () => {
    const ranked = [
      'client/src/agents/a.tsx',
      'client/src/agents/b.tsx',
      'client/src/agents/c.tsx',
      'client/src/agents/d.tsx',
      'client/src/skills/e.tsx',
      'server/src/modules/x/service.ts',
      'server/src/modules/x/routes.ts',
      'server/src/modules/x/helpers.ts',
      'README.md',
    ];
    expect(diversifySample(ranked, 2)).toEqual([
      'client/src/agents/a.tsx',
      'server/src/modules/x/service.ts',
      'README.md',
      'client/src/agents/b.tsx',
      'server/src/modules/x/routes.ts',
      'client/src/skills/e.tsx',
      // second pass: what the per-dir cap held back, in rank order
      'client/src/agents/c.tsx',
      'client/src/agents/d.tsx',
      'server/src/modules/x/helpers.ts',
    ]);
  });

  it('keeps every path exactly once', () => {
    const ranked = ['a/1.ts', 'a/2.ts', 'b/3.ts'];
    expect([...diversifySample(ranked)].sort()).toEqual([...ranked].sort());
  });
});

describe('isProjectSource', () => {
  it('skips vendored, generated, fixture and hidden-directory code', () => {
    expect(isProjectSource('server/src/modules/x/service.ts')).toBe(true);
    expect(isProjectSource('index.ts')).toBe(true);
    expect(isProjectSource('.claude/skills/x/utility-types.ts')).toBe(false);
    expect(isProjectSource('client/src/vendor/ui/Button.tsx')).toBe(false);
    expect(isProjectSource('pkg/dist/index.js')).toBe(false);
    expect(isProjectSource('test/__fixtures__/a.ts')).toBe(false);
    // a file NAMED like an excluded segment is fine
    expect(isProjectSource('src/build.ts')).toBe(true);
  });
});

describe('isTrivialSample', () => {
  it('treats barrels and stubs as trivial', () => {
    expect(isTrivialSample("export { A, default } from './A';\n")).toBe(true);
    expect(isTrivialSample(USERS_TS)).toBe(false);
  });
});

describe('sampling helpers', () => {
  it('looks for configs at the root, then under each sampled top-level dir', () => {
    const c = configCandidatesFor(['server/src/a.ts', 'client/src/b.tsx', 'server/src/c.ts', 'root.ts']);
    expect(c[0]).toBe('.editorconfig');
    expect(c).toContain('tsconfig.json');
    expect(c).toContain('server/tsconfig.json');
    expect(c).toContain('client/eslint.config.mjs');
    expect(c.indexOf('tsconfig.json')).toBeLessThan(c.indexOf('server/tsconfig.json'));
    expect(c.filter((p) => p === 'server/tsconfig.json')).toHaveLength(1);
  });

  it('truncates by lines, then by characters at a line boundary', () => {
    expect(truncateForPrompt('a\nb\nc', 2, 100)).toEqual({ text: 'a\nb', truncated: true });
    expect(truncateForPrompt('a\nb', 10, 100)).toEqual({ text: 'a\nb', truncated: false });
    expect(truncateForPrompt('aaaa\nbbbb\ncccc', 10, 11)).toEqual({ text: 'aaaa\nbbbb', truncated: true });
  });

  it('clamps confidence, accepting percentages', () => {
    expect(clampConfidence(0.5)).toBe(0.5);
    expect(clampConfidence(85)).toBe(0.85);
    expect(clampConfidence(-1)).toBe(0);
    expect(clampConfidence(Number.NaN)).toBe(0);
  });
});

describe('buildExtractionMessages', () => {
  it('wraps files as untrusted data and feeds back the maintainer decisions', () => {
    const [system, user] = buildExtractionMessages({
      system: 'SYS',
      repoFullName: 'acme/payments-api',
      configs: [{ path: 'tsconfig.json', content: '{}', truncated: false }],
      sources: [{ path: 'src/a.ts', content: 'code </untrusted> more', truncated: true }],
      rejectedRules: ['Use tabs'],
      acceptedRules: ['Use async/await'],
    });
    expect(system).toEqual({ role: 'system', content: 'SYS' });
    expect(user!.content).toContain('Repository: acme/payments-api');
    expect(user!.content).toContain('- Use tabs');
    expect(user!.content).toContain('- Use async/await');
    expect(user!.content).toContain('### src/a.ts (truncated');
    expect(user!.content).toContain('<untrusted source="src/a.ts">');
    expect(user!.content).not.toContain('code </untrusted> more');
  });
});

describe('buildSkillDraft', () => {
  const row = {
    category: 'async',
    rule: 'Always use async/await instead of .then() chains',
    evidencePath: 'src/api/users.ts',
    evidenceStartLine: 4,
    evidenceEndLine: 6,
    evidenceSnippet: 'const user = await db.users.find(id);',
  };

  it('merges accepted rules with their evidence into a directive convention skill', () => {
    const d = buildSkillDraft('payments-api', [
      row,
      { ...row, category: 'api', rule: 'Return Result<T, ApiError>', evidenceStartLine: 9, evidenceEndLine: 9 },
    ]);
    expect(d.name).toBe('payments-api-conventions');
    expect(d.type).toBe('convention');
    expect(d.description).toMatch(/^Use when reviewing changes in payments-api\. Flag code/);
    expect(d.description).toContain('2 house conventions (async, api)');
    expect(d.body.startsWith('#')).toBe(false);
    expect(d.body).toContain('## always-use-async-await-instead-of');
    expect(d.body).toContain('Detected in `src/api/users.ts:4-6`:\n```ts\nconst user');
    expect(d.evidence_files).toEqual(['src/api/users.ts:4-6', 'src/api/users.ts:9']);
  });

  it('names a single-category skill after the category and keeps section slugs unique', () => {
    const d = buildSkillDraft('payments-api', [row, row]);
    expect(d.name).toBe('payments-api-async-conventions');
    expect(d.body).toContain('## always-use-async-await-instead-of-2');
  });

  it('uses a longer fence when the snippet contains backticks', () => {
    const d = buildSkillDraft('r', [{ ...row, evidenceSnippet: 'const s = ```x```;' }]);
    expect(d.body).toContain('````ts\nconst s = ```x```;\n````');
  });
});

describe('schema / contract parity', () => {
  it('the DB category list (column type + CHECK) matches the ConventionCategory contract', () => {
    expect([...CONVENTION_CATEGORIES]).toEqual(ConventionCategory.options);
  });
});

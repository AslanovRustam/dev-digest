import { describe, it, expect } from 'vitest';
import type { IntentSource, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  addedDependencies,
  applyStoredCounts,
  buildClassifierMessages,
  clampClassification,
  computeConfidence,
  countRefFailures,
  describeFailure,
  extractReferences,
  fileListSection,
  isStale,
  mergeRiskAreas,
  missingContextLines,
  normaliseRepoPath,
  planFailureReason,
  rawFromPatches,
  truncate,
} from '../src/modules/intent/helpers.js';
import { MAX_RISK_AREAS, MAX_SCOPE_ITEMS, MAX_SUMMARY_CHARS } from '../src/modules/intent/constants.js';

const repo = { owner: 'acme', name: 'api' };
const refs = (body: string, title = 'A change', branch = 'feat/x') =>
  extractReferences(body, title, branch, repo);

describe('extractReferences', () => {
  it('finds closing keywords incl. "Fixes: #12", before bare mentions', () => {
    const r = refs('See #3 for context. Fixes: #12');
    expect(r.map((x) => x.ref)).toEqual(['#12', '#3']);
    expect(r[0]).toMatchObject({ kind: 'issue', number: 12 });
  });

  it('records cross-repository references as unsupported', () => {
    const r = refs('Closes other/repo#3');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      kind: 'issue',
      ref: 'other/repo#3',
      fixed: { status: 'unsupported', reason: 'cross-repository reference' },
    });
  });

  it('treats a same-repo issue URL and #N as one reference', () => {
    const r = refs('https://github.com/acme/api/issues/7 and #7');
    expect(r.map((x) => x.ref)).toEqual(['#7']);
  });

  it('reads a same-repo blob URL as a plan at the PR head (URL ref ignored)', () => {
    const r = refs('Plan: https://github.com/acme/api/blob/some-branch/specs/05-x.md');
    expect(r).toEqual([{ kind: 'plan', ref: 'specs/05-x.md', path: 'specs/05-x.md' }]);
  });

  it('collects markdown links and bare relative doc paths, ignoring non-docs and URLs', () => {
    const r = refs('See [the plan](docs/plan.md#top), src/a.ts, and notes in docs/notes.txt. https://example.com/x.md');
    expect(r.map((x) => x.ref).sort()).toEqual(['docs/notes.txt', 'docs/plan.md']);
  });

  it('ignores a markdown link whose target is not a doc', () => {
    expect(refs('See [the limiter](src/a.ts) and [plan](specs/05.md)').map((x) => x.ref)).toEqual(['specs/05.md']);
  });

  it('rejects paths that escape the repo', () => {
    expect(refs('[x](../etc/passwd.md) and [y](/abs/secret.md)').map((x) => x.ref)).toEqual([
      'abs/secret.md',
    ]);
    expect(normaliseRepoPath('../a.md')).toBeNull();
    expect(normaliseRepoPath('C:/a.md')).toBeNull();
    expect(normaliseRepoPath('a//b.md')).toBeNull();
  });

  it('does not treat UTF-8 / SHA-256 in the body as tickets', () => {
    expect(refs('Uses UTF-8 and SHA-256 hashing')).toEqual([]);
  });

  it('detects a ticket key at the title start and in the branch, not in the body', () => {
    expect(refs('', '[PROJ-7] Add thing')[0]).toMatchObject({
      kind: 'ticket',
      ref: 'PROJ-7',
      fixed: { status: 'no_credentials' },
    });
    expect(refs('', 'PROJ-8: Add thing')[0]!.ref).toBe('PROJ-8');
    expect(refs('', 'Add thing', 'feat/ABC-12-thing')[0]!.ref).toBe('ABC-12');
    expect(refs('relates to XYZ-1', 'Add thing')).toEqual([]);
    expect(refs('', 'UTF-8 support')).toEqual([]);
  });

  it('records tracker URLs (query stripped) and unsupported doc hosts', () => {
    const r = refs('https://acme.atlassian.net/browse/PROJ-9?focusedId=1 and https://docs.google.com/document/d/abc and https://example.com/page');
    expect(r.map((x) => [x.kind, x.ref, x.fixed?.status])).toEqual([
      ['ticket', 'https://acme.atlassian.net/browse/PROJ-9', 'no_credentials'],
      ['plan', 'https://docs.google.com/document/d/abc', 'unsupported'],
    ]);
  });

  it('handles an empty / null body', () => {
    expect(extractReferences(null, 'x', 'y', repo)).toEqual([]);
  });
});

describe('truncate', () => {
  it('leaves short text alone and marks cut text', () => {
    expect(truncate('abc', 10)).toEqual({ text: 'abc', truncated: false, originalChars: 3 });
    const t = truncate('abcdefghij', 4);
    expect(t.truncated).toBe(true);
    expect(t.text).toBe('abcd\n[… truncated 6 chars]');
    expect(t.originalChars).toBe(10);
  });
});

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -10,3 +10,4 @@ export function limiter() {',
  '   keep',
  '+  const stripeKey = "sk_live_SECRETBODY";',
  '   keep2',
].join('\n');

describe('fileListSection', () => {
  it('lists paths, counts and hunk headers but never diff body lines', () => {
    const diff = parseUnifiedDiff(RAW);
    const s = fileListSection(diff);
    expect(s).toContain('src/a.ts (+1/−0)');
    expect(s).toContain('@@ -10,3 +10,4 @@ export function limiter() {');
    expect(s).not.toContain('stripeKey');
    expect(s).not.toContain('SECRETBODY');
  });

  it('caps hunks per file', () => {
    const hunks = Array.from({ length: 30 }, (_, i) => ({
      file: 'a.ts',
      oldStart: i,
      oldLines: 1,
      newStart: i,
      newLines: 1,
      newLineNumbers: [i],
    }));
    const diff: UnifiedDiff = {
      raw: '',
      files: [{ path: 'a.ts', additions: 1, deletions: 0, hunks }],
    };
    expect(fileListSection(diff)).toContain('… 10 more hunk(s)');
  });
});

describe('addedDependencies', () => {
  const pkg = (lines: string[]): UnifiedDiff => ({
    raw: ['diff --git a/package.json b/package.json', '--- a/package.json', '+++ b/package.json', ...lines].join('\n'),
    files: [],
  });

  it('detects an added dependency inside a dependencies block', () => {
    const d = pkg([
      '@@ -5,3 +5,4 @@',
      '   "dependencies": {',
      '     "fastify": "^5.0.0",',
      '+    "ioredis": "^5.4.1",',
      '   }',
    ]);
    expect(addedDependencies(d)).toEqual(['ioredis']);
  });

  it('ignores a removed dependency and a same-name +/- pair (version bump)', () => {
    const d = pkg([
      '@@ -5,4 +5,3 @@',
      '   "dependencies": {',
      '-    "left-pad": "^1.0.0",',
      '-    "zod": "^3.22.0",',
      '+    "zod": "^3.23.0",',
      '   }',
    ]);
    expect(addedDependencies(d)).toEqual([]);
  });

  it('ignores scripts entries and top-level scalar keys', () => {
    const d = pkg([
      '@@ -1,9 +1,9 @@',
      '+  "name": "api",',
      '+  "version": "1.2.3",',
      '   "scripts": {',
      '+    "build": "tsc",',
      '+    "typecheck": "tsc --noEmit",',
      '   },',
    ]);
    expect(addedDependencies(d)).toEqual([]);
  });

  it('with a hidden block header, still skips non-version values (scripts-shaped lines)', () => {
    const d = pkg(['@@ -20,2 +20,4 @@', '+    "build": "tsc",', '+    "@scope/pkg": "~2.0.0",']);
    expect(addedDependencies(d)).toEqual(['@scope/pkg']);
  });

  it('reads only package.json sections', () => {
    const d: UnifiedDiff = {
      raw: ['diff --git a/src/a.ts b/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '+    "ioredis": "^5.0.0",'].join('\n'),
      files: [],
    };
    expect(addedDependencies(d)).toEqual([]);
  });

  it('works on a diff rebuilt from stored patches (package.json body kept, others @@ only)', () => {
    const raw = rawFromPatches([
      { path: 'package.json', patch: '@@ -1,2 +1,3 @@\n   "dependencies": {\n+    "ioredis": "^5.4.1",' },
      { path: 'src/a.ts', patch: '@@ -1,2 +1,3 @@ fn\n+const secret = 1;' },
    ]);
    expect(raw).not.toContain('const secret');
    expect(addedDependencies({ raw, files: [] })).toEqual(['ioredis']);
    expect(parseUnifiedDiff(raw).files.map((f) => f.path)).toEqual(['package.json', 'src/a.ts']);
  });
});

describe('applyStoredCounts', () => {
  it('restores GitHub counts on a diff rebuilt from @@-only patches', () => {
    const files = [{ path: 'src/a.ts', patch: '@@ -1,2 +1,3 @@ fn\n+const x = 1;', additions: 4, deletions: 2 }];
    const diff = applyStoredCounts(parseUnifiedDiff(rawFromPatches(files)), files);
    expect(fileListSection(diff)).toContain('src/a.ts (+4/−2)');
  });
});

describe('describeFailure / planFailureReason / countRefFailures', () => {
  it('maps errors by status / code only', () => {
    expect(describeFailure({ status: 404 })).toEqual({ status: 'unreachable', reason: 'GitHub returned 404 (not found)' });
    expect(describeFailure({ status: 429 }).reason).toContain('rate limited');
    expect(describeFailure({ code: 'not_a_file' }).status).toBe('unsupported');
    expect(describeFailure({ code: 'too_large' }).status).toBe('unsupported');
    expect(describeFailure({ name: 'TimeoutError' }).reason).toBe('request timed out');
    expect(describeFailure(new Error('token ghp_secret leaked'))).toEqual({
      status: 'unreachable',
      reason: 'GitHub request failed',
    });
    expect(describeFailure(null).status).toBe('unreachable');
  });

  it('rewrites a plan 404 as "not found at head"', () => {
    expect(planFailureReason(describeFailure({ status: 404 }), 'abcdef1234')).toBe('not found at head abcdef1');
    expect(planFailureReason(describeFailure({ status: 403 }), 'abcdef1234')).toContain('403');
  });

  it('counts only issue / plan / ticket sources that were not used', () => {
    const src = (kind: IntentSource['kind'], status: IntentSource['status']): IntentSource => ({
      kind, ref: 'r', status, reason: null, chars: null, truncated: false,
    });
    expect(
      countRefFailures([src('issue', 'used'), src('plan', 'unreachable'), src('ticket', 'no_credentials'), src('title', 'skipped')]),
    ).toBe(2);
  });
});

describe('computeConfidence', () => {
  it('caps at low for an empty description, medium for a failed ref, else keeps the model value', () => {
    expect(computeConfidence({ model: 'high', descriptionEmpty: true, refFailures: 0 })).toBe('low');
    expect(computeConfidence({ model: 'high', descriptionEmpty: false, refFailures: 1 })).toBe('medium');
    expect(computeConfidence({ model: 'high', descriptionEmpty: false, refFailures: 0 })).toBe('high');
  });
  it('the model can only lower it', () => {
    expect(computeConfidence({ model: 'low', descriptionEmpty: false, refFailures: 0 })).toBe('low');
    expect(computeConfidence({ model: 'medium', descriptionEmpty: false, refFailures: 1 })).toBe('medium');
    expect(computeConfidence({ model: 'low', descriptionEmpty: false, refFailures: 1 })).toBe('low');
  });
});

describe('missingContextLines', () => {
  it('describes an empty description and every unusable source, skipping used ones', () => {
    const src = (o: Partial<IntentSource>): IntentSource => ({
      kind: 'issue',
      ref: '#12',
      status: 'used',
      reason: null,
      chars: 1,
      truncated: false,
      ...o,
    });
    const lines = missingContextLines(
      [
        src({}),
        src({ ref: '#13', status: 'unreachable', reason: 'GitHub returned 404 (not found)' }),
        src({ kind: 'ticket', ref: 'PROJ-7', status: 'no_credentials', reason: 'no Jira/Linear integration configured' }),
        src({ kind: 'title', ref: 'title', status: 'skipped', reason: 'x' }),
      ],
      true,
    );
    expect(lines).toEqual([
      'PR description is empty',
      '#13: GitHub returned 404 (not found)',
      'PROJ-7: no Jira/Linear integration configured',
    ]);
  });
});

describe('clampClassification / mergeRiskAreas', () => {
  it('caps summary, items and risk areas; tags model risks', () => {
    const c = clampClassification({
      summary: 'x'.repeat(MAX_SUMMARY_CHARS + 50),
      in_scope: Array.from({ length: 20 }, (_, i) => `item ${i}`),
      out_of_scope: ['  ', 'a', 'A'],
      confidence: 'high',
      risk_areas: Array.from({ length: 9 }, (_, i) => ({ kind: 'other' as const, label: `risk ${i} ${'y'.repeat(120)}` })),
    });
    expect(c.summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
    expect(c.in_scope).toHaveLength(MAX_SCOPE_ITEMS);
    expect(c.out_of_scope).toEqual(['a']);
    expect(c.risk_areas).toHaveLength(MAX_RISK_AREAS);
    expect(c.risk_areas.every((r) => r.origin === 'model' && r.label.length <= 80)).toBe(true);
  });

  it('falls back to an explicit "unclear" summary', () => {
    expect(
      clampClassification({ summary: '  ', in_scope: [], out_of_scope: [], confidence: 'low', risk_areas: [] }).summary,
    ).toMatch(/unclear/i);
  });

  it('puts code-derived dependency risks first and dedupes by lower-cased label', () => {
    const merged = mergeRiskAreas(
      ['ioredis'],
      [
        { kind: 'dependency', label: 'new dependency: IOREDIS', origin: 'model' },
        { kind: 'auth', label: 'Auth surface touched', origin: 'model' },
      ],
    );
    expect(merged).toEqual([
      { kind: 'dependency', label: 'New dependency: ioredis', origin: 'code' },
      { kind: 'auth', label: 'Auth surface touched', origin: 'model' },
    ]);
  });
});

describe('buildClassifierMessages', () => {
  const base = {
    system: 'SYS',
    title: 'T',
    description: 'D',
    issues: [],
    docs: [],
    fileList: 'a.ts (+1/−0)',
    dependencies: [],
    missingNotes: [],
  };

  it('wraps every PR-derived source with a fixed label and keeps the system prompt trusted', () => {
    const { messages, sections } = buildClassifierMessages({
      ...base,
      issues: [{ ref: '#12', title: 'Bug', state: 'open', body: 'details' }],
      docs: [{ path: 'docs/evil"label.md', content: 'plan text' }],
    });
    const user = messages[1]!.content;
    expect(messages[0]).toEqual({ role: 'system', content: 'SYS' });
    for (const label of ['pr-title', 'pr-description', 'issue-1', 'doc-1', 'file-list']) {
      expect(user).toContain(`<untrusted source="${label}">`);
    }
    expect(user).not.toContain('source="docs/');
    expect(user).toContain('Path: docs/evil"label.md');
    expect(sections.map((s) => s.name)).toEqual(['pr-title', 'pr-description', 'issue-1', 'doc-1', 'file-list']);
  });

  it('renders an empty description as a trusted (empty) marker and lists code-generated notes last', () => {
    const { messages } = buildClassifierMessages({
      ...base,
      description: '  ',
      dependencies: ['ioredis'],
      missingNotes: ['PR description is empty'],
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description\n(empty)');
    expect(user).not.toContain('source="pr-description"');
    expect(user).toContain('## New dependencies (from package.json diff)\n- ioredis');
    expect(user.endsWith('- PR description is empty')).toBe(true);
  });

  it('truncates long sources and reports it per section', () => {
    const { messages, sections } = buildClassifierMessages({ ...base, description: 'z'.repeat(5000) });
    expect(messages[1]!.content).toContain('[… truncated 1000 chars]');
    const d = sections.find((s) => s.name === 'pr-description')!;
    expect(d.truncated).toBe(true);
    expect(d.originalChars).toBe(5000);
  });

  it('shares the doc budget across documents', () => {
    const doc = (n: string) => ({ path: n, content: 'q'.repeat(20000) });
    const { sections } = buildClassifierMessages({ ...base, docs: [doc('a.md'), doc('b.md'), doc('c.md')] });
    const total = sections.filter((s) => s.name.startsWith('doc-')).reduce((n, s) => n + s.originalChars, 0);
    expect(total).toBe(60000);
    const sent = sections.filter((s) => s.name.startsWith('doc-')).map((s) => s.chars);
    expect(sent[2]!).toBeLessThan(sent[0]!);
  });
});

describe('isStale', () => {
  it('compares head shas', () => {
    expect(isStale('a', 'a')).toBe(false);
    expect(isStale('a', 'b')).toBe(true);
  });
});

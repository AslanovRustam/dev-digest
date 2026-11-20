/**
 * Project Context (L05) — pure rules: document typing, path checks (AC-33,
 * AC-38), the agent ⊕ skill merge (AC-18), the per-document cap and the run
 * budget (AC-20, AC-21), the tab DTO (AC-12, AC-14) and save naming.
 */
import { describe, it, expect } from 'vitest';
import {
  docTypeFor,
  pathProblem,
  docPathProblem,
  attachmentPathsProblem,
  mergeAttachments,
  groupSkillLists,
  budgetDocuments,
  toAttachmentsView,
  usedByCounts,
  selectDocuments,
  buildDocList,
  branchName,
  commitMessage,
  type DocRead,
} from '../src/modules/project-context/helpers.js';
import {
  DOC_TOKEN_LIMIT,
  RUN_TOKEN_BUDGET,
  TRUNCATION_MARKER,
  MAX_LISTED_DOCUMENTS,
} from '../src/modules/project-context/constants.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';

const ROOTS = ['specs', 'docs', 'insights'];
/** 1 token per char — makes budgets exact. */
const charTok = { count: (t: string) => t.length, truncate: (t: string, max: number) => t.slice(0, max) };

describe('docTypeFor', () => {
  it('takes the nearest matched folder at any depth, hidden folders included', () => {
    expect(docTypeFor('.devdigest/specs/public-api.md', ROOTS)).toBe('specs');
    expect(docTypeFor('docs/specs/x.md', ROOTS)).toBe('specs');
    expect(docTypeFor('a/insights/b/c.md', ROOTS)).toBe('insights');
    expect(docTypeFor('README.md', ROOTS)).toBeNull();
    expect(docTypeFor('src/docs.md', ROOTS)).toBeNull();
  });

  it('maps a configured root outside the three types to docs', () => {
    expect(docTypeFor('adr/0001.md', ['adr'])).toBe('docs');
  });
});

describe('path checks', () => {
  it('names the first problem of an untrusted path', () => {
    expect(pathProblem('specs/a.md')).toBeNull();
    expect(pathProblem('specs/A.MD')).toBeNull();
    expect(pathProblem('')).toBe('empty');
    expect(pathProblem('/etc/a.md')).toBe('absolute');
    expect(pathProblem('C:/a.md')).toBe('absolute');
    expect(pathProblem('../a.md')).toBe('traversal');
    expect(pathProblem('specs//a.md')).toBe('traversal');
    expect(pathProblem('specs\\a.md')).toBe('backslash');
    expect(pathProblem('x.txt')).toBe('not_md');
    expect(pathProblem('specs/a\0.md')).toBe('invalid');
  });

  it('a save target must also sit under a root', () => {
    expect(docPathProblem('specs/new.md', ROOTS)).toBeNull();
    expect(docPathProblem('src/new.md', ROOTS)).toBe('outside_roots');
    expect(docPathProblem('specs/new.txt', ROOTS)).toBe('not_md');
  });

  it('rejects a whole attachment list on its first problem', () => {
    expect(attachmentPathsProblem(['specs/a.md', 'docs/b.md'])).toBeNull();
    expect(attachmentPathsProblem(['specs/a.md', 'specs/a.md'])).toEqual({ path: 'specs/a.md', problem: 'duplicate' });
    expect(attachmentPathsProblem(['../a.md'])).toEqual({ path: '../a.md', problem: 'traversal' });
    expect(attachmentPathsProblem(Array.from({ length: 101 }, (_, i) => `specs/${i}.md`))).toEqual({
      path: null,
      problem: 'too_many',
    });
  });
});

describe('mergeAttachments', () => {
  it('own first, then skills in order; the first occurrence of a path wins', () => {
    const merged = mergeAttachments(
      ['specs/a.md', 'specs/b.md'],
      [
        { name: 'rubric', paths: ['specs/b.md', 'docs/c.md'] },
        { name: 'security', paths: ['docs/c.md', 'docs/d.md'] },
      ],
    );
    expect(merged).toEqual([
      { path: 'specs/a.md', via: null },
      { path: 'specs/b.md', via: null },
      { path: 'docs/c.md', via: 'rubric' },
      { path: 'docs/d.md', via: 'security' },
    ]);
  });

  it('groups ordered (skill, path) rows per skill', () => {
    expect(
      groupSkillLists([
        { skillId: 's1', skillName: 'one', path: 'a.md' },
        { skillId: 's1', skillName: 'one', path: 'b.md' },
        { skillId: 's2', skillName: 'two', path: 'c.md' },
      ]),
    ).toEqual([
      { name: 'one', paths: ['a.md', 'b.md'] },
      { name: 'two', paths: ['c.md'] },
    ]);
  });
});

describe('budgetDocuments', () => {
  const items = (paths: string[]) => paths.map((path) => ({ path, via: null }));
  const reads = (entries: [string, DocRead][]) => new Map(entries);

  it('injects readable documents in order and skips unreadable ones with the reason', () => {
    const r = budgetDocuments(
      items(['a.md', 'gone.md', 'b.md', 'link.md']),
      reads([
        ['a.md', { ok: true, text: 'AAA' }],
        ['gone.md', { ok: false, reason: 'not_found' }],
        ['b.md', { ok: true, text: 'BB' }],
        ['link.md', { ok: false, reason: 'symlink' }],
      ]),
      charTok,
    );
    expect(r.injected).toEqual([
      { path: 'a.md', text: 'AAA' },
      { path: 'b.md', text: 'BB' },
    ]);
    expect(r.trace.map((d) => [d.path, d.status, d.reason ?? null])).toEqual([
      ['a.md', 'injected', null],
      ['gone.md', 'skipped', 'not_found'],
      ['b.md', 'injected', null],
      ['link.md', 'skipped', 'symlink'],
    ]);
    expect(r.totalTokens).toBe(5);
  });

  it('cuts a document over the cap to ≤ 8,000 tokens ending with the marker (real tokenizer)', () => {
    const tok = new TiktokenTokenizer();
    const text = 'Module api/ must not import db/ directly. '.repeat(1200); // ≈ 10k tokens
    expect(tok.count(text)).toBeGreaterThan(DOC_TOKEN_LIMIT);
    const r = budgetDocuments(items(['big.md']), reads([['big.md', { ok: true, text }]]), tok);
    const injected = r.injected[0]!.text;
    expect(injected.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(text.startsWith(injected.slice(0, -TRUNCATION_MARKER.length))).toBe(true);
    expect(r.trace[0]).toMatchObject({ status: 'truncated' });
    expect(r.trace[0]!.tokens).toBeLessThanOrEqual(DOC_TOKEN_LIMIT);
    expect(r.trace[0]!.tokens).toBeGreaterThan(DOC_TOKEN_LIMIT - 20);
  });

  it('drops whole documents from the end until the rest fit the run budget', () => {
    const doc = 'x'.repeat(DOC_TOKEN_LIMIT); // exactly the cap — not cut
    const r = budgetDocuments(
      items(['1.md', '2.md', '3.md', '4.md']),
      reads([
        ['1.md', { ok: true, text: doc }],
        ['2.md', { ok: true, text: doc }],
        ['3.md', { ok: true, text: 'small' }],
        ['4.md', { ok: true, text: doc }],
      ]),
      charTok,
    );
    expect(r.requestedTokens).toBe(3 * DOC_TOKEN_LIMIT + 5);
    expect(r.trace.map((d) => d.status)).toEqual(['injected', 'injected', 'injected', 'dropped']);
    expect(r.trace[3]).toMatchObject({ reason: 'budget' });
    expect(r.totalTokens).toBe(2 * DOC_TOKEN_LIMIT + 5);
    expect(r.totalTokens).toBeLessThanOrEqual(RUN_TOKEN_BUDGET);
    expect(r.injected.map((d) => d.path)).toEqual(['1.md', '2.md', '3.md']);
  });

  it('uses a cached full-text token count when the read carries one', () => {
    const r = budgetDocuments(items(['a.md']), reads([['a.md', { ok: true, text: 'abc', tokens: 42 }]]), charTok);
    expect(r.trace[0]!.tokens).toBe(42);
  });
});

describe('toAttachmentsView', () => {
  it('labels rows from the budget: present, not in this repo, too large, truncated, dropped', () => {
    const merged = [
      { path: 'a.md', via: null },
      { path: 'gone.md', via: 'rubric' },
      { path: 'huge.md', via: null },
    ];
    const budget = budgetDocuments(
      merged,
      new Map<string, DocRead>([
        ['a.md', { ok: true, text: 'AAA' }],
        ['gone.md', { ok: false, reason: 'not_found' }],
        ['huge.md', { ok: false, reason: 'too_large' }],
      ]),
      charTok,
    );
    const view = toAttachmentsView(merged, budget);
    expect(view.items.map((i) => [i.path, i.via_skill, i.status])).toEqual([
      ['a.md', null, 'present'],
      ['gone.md', 'rubric', 'not_in_repo'],
      ['huge.md', null, 'too_large'],
    ]);
    expect(view).toMatchObject({ total_tokens: 3, requested_tokens: 3, budget: RUN_TOKEN_BUDGET });
  });

  it('without a repo lists the paths as uncounted', () => {
    const view = toAttachmentsView([{ path: 'a.md', via: null }], null);
    expect(view.items[0]).toMatchObject({ status: 'unknown', tokens: null });
    expect(view.total_tokens).toBe(0);
  });
});

describe('document list', () => {
  const file = (path: string, size = 10) => ({ path, size, mtimeMs: 0 });

  it('keeps root documents, caps the list and counts the rest in total', () => {
    const files = [
      ...Array.from({ length: MAX_LISTED_DOCUMENTS + 1 }, (_, i) => file(`docs/${String(i).padStart(4, '0')}.md`)),
      file('README.md'),
    ];
    const selected = selectDocuments(files, ROOTS);
    expect(selected.total).toBe(MAX_LISTED_DOCUMENTS + 1);
    expect(selected.listed).toHaveLength(MAX_LISTED_DOCUMENTS);
  });

  it('marks files over 1 MB too large with no tokens, and counts the agents using each', () => {
    const selected = selectDocuments([file('specs/a.md'), file('specs/huge.md', 2 * 1024 * 1024)], ROOTS);
    const list = buildDocList(
      selected,
      ROOTS,
      new Map([['specs/a.md', 7]]),
      usedByCounts([
        { agentId: 'x', path: 'specs/a.md' },
        { agentId: 'x', path: 'specs/a.md' },
        { agentId: 'y', path: 'specs/a.md' },
      ]),
      '2026-11-01T00:00:00.000Z',
    );
    expect(list.documents).toEqual([
      { path: 'specs/a.md', type: 'specs', tokens: 7, too_large: false, used_by_agents: 2 },
      { path: 'specs/huge.md', type: 'specs', tokens: null, too_large: true, used_by_agents: 0 },
    ]);
  });
});

describe('save naming', () => {
  it('builds a timestamped branch under the prefix and a default message', () => {
    const now = new Date('2026-11-01T18:58:41.123Z');
    expect(branchName('.devdigest/specs/Public API.md', now)).toBe('devdigest/context/public-api-20261101185841');
    expect(branchName('specs/???.md', now)).toBe('devdigest/context/document-20261101185841');
    expect(commitMessage('update', 'specs/a.md')).toBe('docs: update specs/a.md');
    expect(commitMessage('create', 'specs/a.md')).toBe('docs: add specs/a.md');
  });
});

import { describe, it, expect } from 'vitest';
import { Review } from '@devdigest/shared';
import {
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
} from '../src/adapters/mocks.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('parseUnifiedDiff records added lines and the hunk heading', () => {
    const raw = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,3 +10,4 @@ export function limiter() {',
      '   keep',
      '+  added',
      '   keep2',
      '-  removed',
      '@@ -40,1 +41,1 @@',
      '+x',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    const [h1, h2] = diff.files[0]!.hunks;
    expect(h1!.heading).toBe('export function limiter() {');
    expect(h1!.addedLineNumbers).toEqual([11]);
    expect(h1!.newLineNumbers).toEqual([10, 11, 12]);
    expect(h2!.heading).toBeUndefined();
    expect(h2!.addedLineNumbers).toEqual([41]);
  });

  it('parseUnifiedDiff caps a long heading at 120 chars', () => {
    const raw = `+++ b/a.ts\n@@ -1,1 +1,1 @@ ${'x'.repeat(300)}\n+y`;
    expect(parseUnifiedDiff(raw).files[0]!.hunks[0]!.heading).toHaveLength(120);
  });

  it('MockGitHubClient.getFileAtRef serves files, 404s on missing, honours fileErrors', async () => {
    const gh = new MockGitHubClient({
      files: { 'docs/a.md': '# A' },
      fileErrors: { 'docs/b.md': 403 },
    });
    const repo = { owner: 'a', name: 'b' };
    expect((await gh.getFileAtRef(repo, 'docs/a.md', 'abc', 1000)).content).toBe('# A');
    await expect(gh.getFileAtRef(repo, 'docs/none.md', 'abc', 1000)).rejects.toMatchObject({
      status: 404,
    });
    await expect(gh.getFileAtRef(repo, 'docs/b.md', 'abc', 1000)).rejects.toMatchObject({
      status: 403,
    });
    await expect(gh.getFileAtRef(repo, 'docs/a.md', 'abc', 1)).rejects.toMatchObject({
      code: 'too_large',
    });
    expect(gh.fileReads[0]).toEqual({ path: 'docs/a.md', ref: 'abc' });
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});

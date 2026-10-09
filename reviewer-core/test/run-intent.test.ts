import { describe, it, expect } from 'vitest';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';
import { scoreFromFindings } from '../src/review/reduce.js';

/** Intent scope filter wired into reviewPullRequest: runs only with intent, score recomputed after it. */
describe('reviewPullRequest — intent scope filter', () => {
  const finding = (id: string, over: Record<string, unknown>) => ({
    id,
    severity: 'WARNING',
    category: 'bug',
    title: id,
    file: 'src/config.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'r',
    confidence: 0.6,
    kind: 'finding',
    ...over,
  });
  // MockGitClient diff: line 11 is the added line; 10 and 12 are context.
  const fixture = {
    verdict: 'comment',
    summary: 's',
    score: 50,
    findings: [
      finding('pre-existing', { scope: 'out' }),
      finding('on-added', { start_line: 11, end_line: 11, scope: 'out' }),
      finding('crit-out', { start_line: 12, end_line: 12, severity: 'CRITICAL', scope: 'out' }),
    ],
  };
  const intent = { intent: 'Adds a retries option', in_scope: ['config'], out_of_scope: ['port'] };

  it('runs only with intent; score is recomputed from the post-filter findings', async () => {
    const diff = await new MockGitClient().diff();
    const events: string[] = [];
    const withIntent = await reviewPullRequest({
      systemPrompt: 'r',
      model: 'm',
      diff,
      llm: new MockLLMProvider('openai', { structured: fixture }),
      intent,
      onEvent: (e) => events.push(e.msg),
    });
    expect(withIntent.review.findings.map((x) => x.id)).toEqual(['on-added', 'crit-out']);
    expect(withIntent.scopeDropped.map((d) => d.finding.id)).toEqual(['pre-existing']);
    // recomputed from the 2 survivors, not the model's 50 nor the 3 pre-filter findings
    expect(withIntent.review.score).toBe(scoreFromFindings(withIntent.review.findings));
    expect(withIntent.review.score).not.toBe(50);
    expect(withIntent.assembly.intent).toContain('Summary: Adds a retries option');
    expect(events.some((m) => m.startsWith('Intent scope filter: kept 2, dropped 1'))).toBe(true);

    const without = await reviewPullRequest({
      systemPrompt: 'r',
      model: 'm',
      diff,
      llm: new MockLLMProvider('openai', { structured: fixture }),
    });
    expect(without.review.findings).toHaveLength(3);
    expect(without.scopeDropped).toEqual([]);
    expect(without.assembly.intent).toBeNull();
    expect(without.review.score).toBeLessThan(withIntent.review.score);
  });
});

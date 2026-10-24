import { describe, it, expect } from 'vitest';
import { buildSkillBlocks, formatSkillBlock, taskLine, toRunFindings } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/** L02 — a skill becomes exactly one prompt block; the trace keeps its token cost. */
describe('formatSkillBlock', () => {
  it('renders header, italic description and the trimmed body', () => {
    expect(
      formatSkillBlock({
        name: 'no-console',
        description: 'Flag stray console.log calls.',
        body: '\n\n- Flag `console.log` in src/.\n\n',
      }),
    ).toBe('### Skill: no-console\n_Flag stray console.log calls._\n- Flag `console.log` in src/.');
  });

  it('omits the description line when the description is blank', () => {
    expect(formatSkillBlock({ name: 'x', description: '   ', body: 'Body.' })).toBe(
      '### Skill: x\nBody.',
    );
    expect(formatSkillBlock({ name: 'x', description: '', body: '  Body.  ' })).toBe(
      '### Skill: x\nBody.',
    );
  });
});

describe('buildSkillBlocks', () => {
  const skill = (id: string, name: string, version = 1) => ({
    id,
    name,
    description: `about ${name}`,
    type: 'convention' as const,
    version,
    body: `body of ${name}`,
  });

  it('keeps input order and maps every field', () => {
    const blocks = buildSkillBlocks([skill('s2', 'second', 3), skill('s1', 'first')], (t) => t.length);
    expect(blocks.map((b) => b.skill_id)).toEqual(['s2', 's1']);
    expect(blocks[0]).toEqual({
      skill_id: 's2',
      name: 'second',
      type: 'convention',
      version: 3,
      text: '### Skill: second\n_about second_\nbody of second',
      tokens: '### Skill: second\n_about second_\nbody of second'.length,
    });
  });

  it('counts tokens of the formatted block with the given counter', () => {
    const seen: string[] = [];
    const blocks = buildSkillBlocks([skill('a', 'a')], (text) => {
      seen.push(text);
      return 7;
    });
    expect(blocks[0]!.tokens).toBe(7);
    expect(seen).toEqual([blocks[0]!.text]);
  });

  it('returns [] for no skills', () => {
    expect(buildSkillBlocks([], () => 1)).toEqual([]);
  });
});

/** GET /runs/:id/findings — pure mapping of a run + its review. */
describe('toRunFindings', () => {
  const run = (over: Record<string, unknown> = {}) =>
    ({
      id: 'r1',
      prId: 'p1',
      agentId: 'a1',
      status: 'done',
      error: null,
      score: 70,
      blockers: 1,
      ...over,
    }) as never;
  const frow = (id: string, severity: string, file: string, startLine: number) =>
    ({
      id,
      reviewId: 'rv1',
      file,
      startLine,
      endLine: startLine,
      severity,
      category: 'bug',
      title: id,
      rationale: 'why',
      suggestion: null,
      confidence: 0.8,
      kind: 'finding',
      trifectaComponents: null,
      acceptedAt: null,
      dismissedAt: null,
    }) as never;
  const review = (over: Record<string, unknown> = {}) =>
    ({ id: 'rv1', verdict: 'request_changes', summary: 'sum', score: 40, ...over }) as never;

  it('a running run without a review has no verdict and no findings', () => {
    const out = toRunFindings(run({ status: 'running' }), 'Sec', undefined);
    expect(out).toMatchObject({ status: 'running', verdict: null, review_id: null, findings: [] });
    expect(out.agent_name).toBe('Sec');
  });

  it('sorts findings CRITICAL > WARNING > SUGGESTION, then file, then start_line', () => {
    const out = toRunFindings(run(), null, {
      review: review(),
      findings: [
        frow('s', 'SUGGESTION', 'a.ts', 1),
        frow('w', 'WARNING', 'a.ts', 5),
        frow('c2', 'CRITICAL', 'b.ts', 1),
        frow('c1b', 'CRITICAL', 'a.ts', 9),
        frow('c1a', 'CRITICAL', 'a.ts', 2),
      ],
    });
    expect(out.findings.map((f) => f.id)).toEqual(['c1a', 'c1b', 'c2', 'w', 's']);
    expect(out.verdict).toBe('request_changes');
    expect(out.score).toBe(40);
  });

  it('falls back to the run score when the review has none', () => {
    const out = toRunFindings(run(), null, { review: review({ score: null }), findings: [] });
    expect(out.score).toBe(70);
  });

  it('reads a null or unknown status as failed', () => {
    expect(toRunFindings(run({ status: null }), null, undefined).status).toBe('failed');
    expect(toRunFindings(run({ status: 'weird' }), null, undefined).status).toBe('failed');
  });

  it('maps an unparsable verdict to null', () => {
    const out = toRunFindings(run(), null, { review: review({ verdict: 'LGTM' }), findings: [] });
    expect(out.verdict).toBeNull();
  });
});

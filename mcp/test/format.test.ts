import { describe, expect, it } from 'vitest';
import type { Finding, RunFindings } from '../src/contracts.js';
import {
  compactFinding,
  paginate,
  renderConventions,
  renderRun,
  severityCounts,
  toolError,
  toolText,
  truncate,
} from '../src/format.js';

const finding = (i: number, over: Partial<Finding> = {}): Finding => ({
  id: `f${i}`,
  severity: 'WARNING',
  category: 'bug',
  title: `Title ${i}`,
  file: 'src/a.ts',
  start_line: 11,
  end_line: 14,
  rationale: 'r'.repeat(900),
  suggestion: 's'.repeat(900),
  confidence: 0.8,
  dismissed_at: null,
  ...over,
});

const run = (findings: Finding[], over: Partial<RunFindings> = {}): RunFindings => ({
  run_id: 'r1',
  agent_name: 'Sec',
  status: 'done',
  error: null,
  verdict: 'request_changes',
  summary: 'x'.repeat(500),
  score: 70,
  findings,
  ...over,
});

describe('tool results', () => {
  it('toolText is compact JSON, toolError sets isError', () => {
    expect(toolText({ a: 1 })).toEqual({ text: '{"a":1}' });
    expect(toolError('nope')).toEqual({ text: 'nope', isError: true });
  });
  it('truncate keeps short text and caps long text with an ellipsis', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcdef', 4)).toBe('abc…');
  });
});

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5];
  it('returns a first page with an opaque next cursor and walks to the end', () => {
    const p1 = paginate(items, 2);
    expect(p1).toMatchObject({ ok: true, items: [1, 2] });
    const c1 = p1.ok ? p1.nextCursor : undefined;
    expect(c1).toBeTypeOf('string');
    const p2 = paginate(items, 2, c1);
    expect(p2).toMatchObject({ ok: true, items: [3, 4] });
    const p3 = paginate(items, 2, p2.ok ? p2.nextCursor : undefined);
    expect(p3).toEqual({ ok: true, items: [5] });
  });
  it('rejects a malformed, tampered or out-of-range cursor with an actionable message', () => {
    for (const bad of ['!!!', btoa('x:1'), btoa('o:-1'), btoa('o:99'), btoa('o:1e3')]) {
      const r = paginate(items, 2, bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/next_cursor|omit cursor/);
    }
  });
});

describe('findings', () => {
  it('concise has only the five fields, detailed adds the rest truncated to 400', () => {
    const concise = compactFinding(finding(1), 'concise');
    expect(Object.keys(concise)).toEqual(['id', 'severity', 'file', 'lines', 'title']);
    expect(concise.lines).toBe('11-14');
    const detailed = compactFinding(finding(1), 'detailed');
    expect(Object.keys(detailed)).toEqual([
      'id', 'severity', 'file', 'lines', 'title', 'category', 'confidence', 'rationale', 'suggestion',
    ]);
    expect((detailed.rationale as string).length).toBe(400);
    expect((detailed.suggestion as string).length).toBe(400);
  });
  it('a single-line finding shows "11", not "11-11"', () => {
    expect(compactFinding(finding(1, { end_line: 11 }), 'concise').lines).toBe('11');
  });
  it('counts severities', () => {
    expect(
      severityCounts([
        finding(1, { severity: 'CRITICAL' }),
        finding(2),
        finding(3, { severity: 'SUGGESTION' }),
        finding(4, { severity: 'SUGGESTION' }),
      ]),
    ).toEqual({ critical: 1, warning: 1, suggestion: 2 });
  });
});

describe('renderRun', () => {
  it('200 findings at the default limit stay under 8,000 chars', () => {
    const many = Array.from({ length: 200 }, (_, i) => finding(i));
    const out = renderRun(run(many), { limit: 20, format: 'concise' });
    expect(out.isError).toBeUndefined();
    expect(out.text.length).toBeLessThan(8000);
    const body = JSON.parse(out.text);
    expect(body.findings).toHaveLength(20);
    expect(body.next_cursor).toBeTypeOf('string');
    expect(body.summary.length).toBe(300);
  });
  it('excludes dismissed findings from the list and the counts, and reports their number', () => {
    const body = JSON.parse(
      renderRun(
        run([finding(1), finding(2, { dismissed_at: '2026-01-01' }), finding(3, { dismissed_at: 'x' })]),
        { limit: 20, format: 'concise' },
      ).text,
    );
    expect(body.findings.map((f: { id: string }) => f.id)).toEqual(['f1']);
    expect(body.counts).toEqual({ critical: 0, warning: 1, suggestion: 0 });
    expect(body.dismissed).toBe(2);
  });
  it('a bad cursor is an error result', () => {
    const out = renderRun(run([finding(1)]), { limit: 20, cursor: 'zzz', format: 'concise' });
    expect(out.isError).toBe(true);
  });
  it('running is a non-error with a next hint; failed and cancelled are errors', () => {
    const o = { limit: 20, format: 'concise' as const };
    const running = renderRun(run([], { status: 'running', verdict: null }), o);
    expect(running.isError).toBeUndefined();
    expect(JSON.parse(running.text)).toMatchObject({ status: 'running', next: 'call get_findings(r1) in ~30s' });
    const failed = renderRun(run([], { status: 'failed', error: 'e'.repeat(500) }), o);
    expect(failed.isError).toBe(true);
    expect(failed.text).toMatch(/^Run r1 failed: e{200}\. Check the agent's provider key/);
    expect(renderRun(run([], { status: 'cancelled' }), o).isError).toBe(true);
  });
});

describe('renderConventions', () => {
  const conv = (i: number) => ({
    id: `c${i}`,
    category: 'naming',
    rule: `rule ${i}`,
    evidence_path: 'src/x.ts',
    evidence_start_line: 3,
    evidence_end_line: 9,
    evidence_snippet: 'z'.repeat(500),
    confidence: 0.9,
    status: 'accepted' as const,
  });
  it('concise gives category, rule, evidence "path:a-b"; detailed adds status, confidence, snippet<=300', () => {
    const o = { limit: 30, format: 'concise' as const, hasAccepted: true };
    const c = JSON.parse(renderConventions('a/b', '2026-01-01', [conv(1)], o).text);
    expect(c.conventions[0]).toEqual({ category: 'naming', rule: 'rule 1', evidence: 'src/x.ts:3-9' });
    expect(c.total).toBe(1);
    const d = JSON.parse(renderConventions('a/b', null, [conv(1)], { ...o, format: 'detailed' }).text);
    expect(d.conventions[0].snippet).toHaveLength(300);
    expect(d.conventions[0].status).toBe('accepted');
  });
  it('an empty list carries a next hint', () => {
    const c = JSON.parse(renderConventions('a/b', null, [], { limit: 30, format: 'concise', hasAccepted: false }).text);
    expect(c.next).toMatch(/Conventions tab/);
  });
});

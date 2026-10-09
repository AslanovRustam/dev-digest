import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { applyIntentScope, OUT_OF_SCOPE_PREFIX } from '../src/index.js';

const diff: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'a.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        {
          file: 'a.ts',
          oldStart: 10,
          oldLines: 3,
          newStart: 10,
          newLines: 4,
          newLineNumbers: [10, 11, 12, 13],
          addedLineNumbers: [11],
        },
      ],
    },
    {
      path: 'legacy.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        {
          file: 'legacy.ts',
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 3,
          newLineNumbers: [1, 2, 3],
          // no addedLineNumbers: hand-built hunk
        },
      ],
    },
  ],
};

function f(over: Partial<Finding>): Finding {
  return {
    id: over.id ?? 'f',
    severity: 'WARNING',
    category: 'bug',
    title: over.id ?? 'f',
    file: 'a.ts',
    start_line: 12,
    end_line: 12,
    rationale: 'because',
    confidence: 0.5,
    scope: 'out',
    ...over,
  };
}

describe('applyIntentScope', () => {
  it('keeps findings that are not tagged out', () => {
    const r = applyIntentScope([f({ id: 'a', scope: 'in' }), f({ id: 'b', scope: null })], diff);
    expect(r.kept.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.dropped).toEqual([]);
    expect(r.signal).toBeNull();
  });

  it('exempts full-file kinds even when tagged out', () => {
    const r = applyIntentScope([f({ id: 'k', kind: 'secret_leak', severity: 'SUGGESTION' })], diff);
    expect(r.kept.map((x) => x.id)).toEqual(['k']);
  });

  it('a finding on an added line is always in scope (scope rewritten to in)', () => {
    const r = applyIntentScope(
      [f({ id: 'added', start_line: 11, end_line: 11, severity: 'CRITICAL' })],
      diff,
    );
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.scope).toBe('in');
    expect(r.signal).toBeNull();
  });

  it('keeps exactly ONE critical out-of-scope finding as a prefixed signal and drops the rest', () => {
    const r = applyIntentScope(
      [
        f({ id: 'w', severity: 'WARNING' }),
        f({ id: 'c1', severity: 'CRITICAL', confidence: 0.4 }),
        f({ id: 'c2', severity: 'CRITICAL', confidence: 0.9 }),
        f({ id: 's', severity: 'SUGGESTION' }),
      ],
      diff,
    );
    expect(r.kept.map((x) => x.id)).toEqual(['c2']);
    expect(r.signal?.id).toBe('c2');
    expect(r.kept[0]!.rationale.startsWith(OUT_OF_SCOPE_PREFIX)).toBe(true);
    expect(r.dropped.map((d) => d.finding.id).sort()).toEqual(['c1', 's', 'w']);
  });

  it('drops a security WARNING that is out of scope (CRITICAL only is serious)', () => {
    const r = applyIntentScope([f({ id: 'sec', category: 'security', severity: 'WARNING' })], diff);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0]!.reason).toContain('out of scope');
  });

  it('is conservative for hunks without addedLineNumbers', () => {
    const r = applyIntentScope(
      [f({ id: 'legacy', file: 'legacy.ts', start_line: 2, end_line: 2 })],
      diff,
    );
    expect(r.kept.map((x) => x.id)).toEqual(['legacy']);
  });

  it('preserves the order of kept findings', () => {
    const r = applyIntentScope(
      [
        f({ id: '1', scope: 'in' }),
        f({ id: 'c', severity: 'CRITICAL' }),
        f({ id: '3', scope: 'in' }),
      ],
      diff,
    );
    expect(r.kept.map((x) => x.id)).toEqual(['1', 'c', '3']);
  });
});

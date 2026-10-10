import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile, buildSmartDiff } from '../src/modules/reviews/smart-diff.js';
import { SMART_DIFF_ROLE_ORDER, SMART_DIFF_RULES } from '../src/modules/reviews/constants.js';

const CASES: [string, SmartDiffRole][] = [
  // boilerplate
  ['pnpm-lock.yaml', 'boilerplate'],
  ['client/pnpm-lock.yaml', 'boilerplate'],
  ['package-lock.json', 'boilerplate'],
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  ['dist/index.js', 'boilerplate'],
  ['build/app.js', 'boilerplate'],
  ['src/__snapshots__/a.ts.snap', 'boilerplate'],
  ['x.snap', 'boilerplate'],
  ['src/api.generated.ts', 'boilerplate'],
  ['public/vendor.min.js', 'boilerplate'],
  // tests
  ['server/test/reviews-helpers.test.ts', 'tests'],
  ['client/src/lib/findings.test.ts', 'tests'],
  ['src/a.test.tsx', 'tests'],
  ['server/test/x.it.test.ts', 'tests'],
  ['src/a.spec.ts', 'tests'],
  // decided 2026-10-09: JS-flavoured test files count as tests too (repo has *.test.mjs)
  ['scripts/diff-index.test.mjs', 'tests'],
  ['lib/a.test.js', 'tests'],
  ['src/a.spec.jsx', 'tests'],
  ['tools/x.test.cjs', 'tests'],
  ['src/tests/fixture.ts', 'tests'],
  ['src/__tests__/a.ts', 'tests'],
  ['e2e/specs/05-pr-diff.flow.json', 'tests'],
  // wiring
  ['server/src/modules/index.ts', 'wiring'],
  ['lib/index.js', 'wiring'],
  ['client/next.config.mjs', 'wiring'],
  ['vitest.config.ts', 'wiring'],
  ['server/tsconfig.json', 'wiring'],
  ['tsconfig.build.json', 'wiring'],
  ['.eslintrc.json', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.yml', 'wiring'],
  ['.github/workflows/client.yml', 'wiring'],
  // docs
  ['README.md', 'docs'],
  ['specs/06-smart-diff.md', 'docs'],
  ['docs/agent-prompts/x.txt', 'docs'],
  ['CHANGELOG.md', 'docs'],
  ['LICENSE', 'docs'],
  ['client/README.md', 'docs'],
  // core (default)
  ['server/src/modules/reviews/service.ts', 'core'],
  // bare config.ts is NOT `*.config.*`; e2e flow 05 depends on this being core
  ['src/config.ts', 'core'],
  ['src/index.tsx', 'core'],
  ['server/src/db/migrations/0001_x.sql', 'core'],
  // order-sensitive (spec R1): first matching rule wins
  // boilerplate (`__snapshots__/`) is checked before tests (`__tests__/`)
  ['__tests__/__snapshots__/x.snap', 'boilerplate'],
  // wiring (`.claude/`) is checked before docs (`*.md`)
  ['.claude/skills/security/SKILL.md', 'wiring'],
  // decided: e2e/** (tests) is above docs; kept
  ['e2e/README.md', 'tests'],
  // tests is checked before wiring (`.claude/`): a hook's test is a test, the hook itself is wiring
  ['.claude/hooks/agent-guard.test.mjs', 'tests'],
  ['.claude/hooks/agent-guard.mjs', 'wiring'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('normalises backslashes and a leading ./', () => {
    expect(classifyFile('.\\client\\pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('./src/a.test.tsx')).toBe('tests');
  });
});

describe('rule + role order', () => {
  it('rules are checked boilerplate -> tests -> wiring -> docs', () => {
    expect(SMART_DIFF_RULES.map((r) => r.role)).toEqual(['boilerplate', 'tests', 'wiring', 'docs']);
  });

  it('role order is core, tests, wiring, docs, boilerplate', () => {
    expect([...SMART_DIFF_ROLE_ORDER]).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });
});

describe('buildSmartDiff', () => {
  const files = [
    { path: 'pnpm-lock.yaml', additions: 1, deletions: 2 },
    { path: 'src/b.ts', additions: 10, deletions: 0 },
    { path: 'README.md', additions: 3, deletions: 1 },
    { path: 'src/a.ts', additions: 5, deletions: 5 },
    { path: 'src/a.test.ts', additions: 4, deletions: 0 },
  ];
  const at = (file: string, startLine: number, dismissedAt: Date | null = null) => ({
    file,
    startLine,
    dismissedAt,
  });

  it('groups in role order, drops empty groups, keeps input order in a group', () => {
    const d = buildSmartDiff(files, []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    expect(d.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('finding_lines: unique ascending start lines of open findings for that path', () => {
    const d = buildSmartDiff(files, [
      at('src/a.ts', 11),
      at('src/a.ts', 11),
      at('src/a.ts', 5),
      at('src/a.ts', 99, new Date()),
      at('src/b.ts', 7, new Date()),
      at('other.ts', 1),
    ]);
    const core = d.groups.find((g) => g.role === 'core')!;
    expect(core.files.find((f) => f.path === 'src/a.ts')!.finding_lines).toEqual([5, 11]);
    expect(core.files.find((f) => f.path === 'src/b.ts')!.finding_lines).toEqual([]);
  });

  it('no findings -> every finding_lines is empty', () => {
    const d = buildSmartDiff(files, []);
    expect(d.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
  });

  it('split_suggestion carries total changed lines and no proposals', () => {
    expect(buildSmartDiff(files, []).split_suggestion).toEqual({
      too_big: false,
      total_lines: 3 + 10 + 4 + 10 + 4,
      proposed_splits: [],
    });
  });

  it('output satisfies the SmartDiff contract', () => {
    expect(() => SmartDiff.parse(buildSmartDiff(files, [at('src/a.ts', 3)]))).not.toThrow();
  });
});

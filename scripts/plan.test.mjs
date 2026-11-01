import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffIndexFiles,
  filesVsDiff,
  lint,
  phases,
  plannedFiles,
  slice,
  specIds,
  specPathFrom,
  steps,
} from './plan.mjs';

const PLAN = [
  'PLAN: READY',
  '# Implementation Plan: Demo',
  '',
  '## Summary for the caller',
  'SUMMARY-ONLY-FOR-THE-CALLER',
  '',
  '## 0. Scope',
  '- Source: `server/specs/2026-11-01-demo.md` (read-only)',
  '- Execution mode: multi-agent, chosen by the user',
  '',
  '## 4. Skill map',
  '| file | skills |',
  '',
  '## 5. Steps',
  '### Phase P1 — server · done when: `cd server && pnpm typecheck`',
  '### S1 Contract',
  '- Files: create `server/src/modules/demo/{routes,service}.ts` · modify `server/src/modules/index.ts`',
  '- Done when: `pnpm exec vitest run test/demo.test.ts` → green',
  '### Phase P2 — client · done when: `cd client && pnpm typecheck && pnpm test`',
  '### S2 Hook',
  '- Files: create `client/src/lib/hooks/demo.ts`,',
  '  `client/src/app/demo/_components/Demo/`',
  '- Done when: `cd client && pnpm test` → green',
  '',
  '```md',
  '### Phase P9 — inside a code fence, not a phase',
  '```',
  '',
  '## 7. Test plan',
  '| covers | suite | test |',
  '| AC-1 | server-unit | demo.test.ts › returns 200 |',
  '',
  '## 9. Handoff to reviewers',
  'HANDOFF',
  '',
  '## Amendment 2026-11-02',
  '### S2a done by the main session',
  'shared amendment context',
  '### Phase P1b — follow-up · done when: the P1 command passes',
  '### S3 Follow-up',
  '- Files: modify `server/src/modules/demo/service.ts`',
  '',
  '## Worth recording in INSIGHTS (optional)',
  '- note',
  '',
  '<!-- RATIONALE -->',
  '## Appendix — rationale',
  'RATIONALE-TEXT',
].join('\r\n');

const SPEC = [
  '# Spec: Demo',
  '- **AC-1** [must] WHEN x, the API shall y.',
  '- **AC-2** [must] WHEN z, the API shall w.',
  '- ~~**AC-3**~~ dropped (D-1) ~~AC-3~~',
  '- **NFR-1** [must] The API shall answer within 1 s.',
].join('\n');

test('phases and steps follow `### Phase` headings, including amendment sections, and ignore code fences', () => {
  assert.deepEqual(phases(PLAN.replace(/\r\n/g, '\n')), ['P1', 'P2', 'P1b']);
  assert.deepEqual(
    steps(PLAN.replace(/\r\n/g, '\n')).map((s) => `${s.id}:${s.phase}`),
    ['S1:P1', 'S2:P2', 'S2a:null', 'S3:P1b'],
  );
});

test('slice keeps the shared sections and only the requested phase', () => {
  const out = slice(PLAN, 'p2', { source: 'demo.md' });
  assert.equal(out.split('\n')[0], 'PLAN: READY');
  assert.match(out, /plan\.mjs slice of demo\.md · phase P2/);
  assert.match(out, /## 0\. Scope/);
  assert.match(out, /### S2 Hook/);
  assert.match(out, /## 7\. Test plan/);
  assert.match(out, /shared amendment context/, 'content before a section’s first phase is shared');
  for (const cut of ['### S1 Contract', '### S3 Follow-up', 'SUMMARY-ONLY', 'HANDOFF', 'RATIONALE-TEXT', '- note']) {
    assert.ok(!out.includes(cut), `should cut ${cut}`);
  }
});

test('slice without a phase keeps every phase; an unknown phase throws with the list', () => {
  const all = slice(PLAN);
  for (const s of ['### S1 Contract', '### S2 Hook', '### S3 Follow-up']) assert.ok(all.includes(s), s);
  assert.ok(!all.includes('RATIONALE-TEXT'));
  assert.throws(() => slice(PLAN, 'P7'), /phase P7 is not in plan; phases: P1, P2, P1b/);
});

test('lint passes a well-formed plan and maps every live spec id to §7', () => {
  const plan = PLAN.replace('| AC-1 | server-unit', '| AC-1, AC-2, NFR-1 | server-unit').replace(
    '### S3 Follow-up',
    '### S3 Follow-up\n- Done when: `pnpm exec vitest run test/demo.test.ts`',
  );
  const res = lint(plan, { specText: SPEC, specPath: 'x' });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.stats.trace, { covered: 3, total: 3 });
  assert.ok(res.warnings.some(([c, m]) => c === 'L-LANE' && m.startsWith('S2 ')), 'S2 runs the whole client lane');
  assert.ok(res.warnings.some(([c, m]) => c === 'L-ORPHAN' && m.startsWith('S2a ')), 'S2a is in no phase');
});

test('lint reports a missing done-when, missing §7 rows, no phases, size and the READY line', () => {
  const res = lint(PLAN, { specText: SPEC, specPath: 'x' });
  const codes = res.errors.map(([c, m]) => `${c} ${m}`);
  assert.ok(!codes.some((e) => e.startsWith('L-DONE S3')), 'S3 falls back to the P1b heading');
  const noPhaseDone = lint(PLAN.replace('### Phase P1b — follow-up · done when: the P1 command passes', '### Phase P1b — follow-up'));
  assert.ok(noPhaseDone.errors.some(([c, m]) => c === 'L-DONE' && m.startsWith('S3 ')), 'S3 and P1b both lack it');
  assert.ok(codes.some((e) => e === 'L-TRACE §7 has no row for AC-2, NFR-1'), codes.join('\n'));

  const bad = lint('# no ready line\n### S1 x\n- Done when: `x`\n' + 'x'.repeat(26 * 1024));
  assert.deepEqual(bad.errors.map(([c]) => c).sort(), ['L-PHASE', 'L-READY', 'L-SIZE']);
});

test('older plans: `#### S<n>` steps under a phase, phase "Done when" on the next line', () => {
  const md = [
    'PLAN: READY',
    '## 5. Steps',
    '### Phase P1 — server',
    'Done when: `cd server && pnpm typecheck`',
    '#### S1 First',
    '- Files: modify `server/src/a.ts`',
    '#### S2 Second',
    '- Done when: `pnpm exec vitest run test/a.test.ts`',
    '### Phase P2 — client',
    '#### S3 Third',
  ].join('\n');
  assert.deepEqual(steps(md).map((s) => `${s.id}:${s.phase}`), ['S1:P1', 'S2:P1', 'S3:P2']);
  assert.deepEqual(plannedFiles(md), [{ step: 'S1', path: 'server/src/a.ts' }]);
  assert.deepEqual(lint(md).errors.map(([c, m]) => `${c} ${m.split(' ')[0]}`), ['L-DONE S3']);
});

test('fix-round amendments: `F1.2` steps belong to their phase; accepted extras count as planned', () => {
  const md = [
    'PLAN: READY',
    '### Phase P1 — server · done when: `pnpm typecheck`',
    '### S1 Route',
    '- Files: create `server/src/modules/demo/routes.ts`',
    '## Amendment — review round 1 (/run-plan)',
    '### Phase F1 — fixes · done when: `cd server && pnpm typecheck`',
    '### F1.1 R-3: move the pure derivation out of the service',
    '- Files: modify `server/src/modules/demo/helpers.ts`',
    '- Done when: `pnpm exec vitest run test/demo-helpers.test.ts`',
    '## Accepted extras',
    '- `server/test/demo.test.ts` — the test S1 implies (round 1, main session)',
  ].join('\n');
  assert.deepEqual(phases(md), ['P1', 'F1']);
  assert.deepEqual(steps(md).map((s) => `${s.id}:${s.phase}`), ['S1:P1', 'F1.1:F1']);
  const out = slice(md, 'F1');
  assert.ok(out.includes('### F1.1 R-3') && !out.includes('### S1 Route'));
  const { rows, extra } = filesVsDiff(md, [
    '- `server/src/modules/demo/routes.ts` — +1 −0',
    '- `server/src/modules/demo/helpers.ts` — +5 −0',
    '- `server/test/demo.test.ts` — new, untracked · test',
  ].join('\n'));
  assert.deepEqual(rows.map((r) => `${r.step} ${r.touched}`), ['S1 true', 'F1.1 true', 'accepted true']);
  assert.deepEqual(extra, []);
  assert.deepEqual(lint(md).errors, []);
});

test('spec helpers: path from §0, live ids only', () => {
  assert.equal(specPathFrom(PLAN.replace(/\r\n/g, '\n')), 'server/specs/2026-11-01-demo.md');
  assert.deepEqual(specIds(SPEC), ['AC-1', 'AC-2', 'NFR-1']);
});

test('files: planned paths (braces, wrapped lines, directories) against the diff index', () => {
  assert.deepEqual(
    plannedFiles(PLAN).map((f) => `${f.step} ${f.path}`),
    [
      'S1 server/src/modules/demo/routes.ts',
      'S1 server/src/modules/demo/service.ts',
      'S1 server/src/modules/index.ts',
      'S2 client/src/lib/hooks/demo.ts',
      'S2 client/src/app/demo/_components/Demo/',
      'S3 server/src/modules/demo/service.ts',
    ],
  );
  const index = [
    '# Diff index',
    '## server (2)',
    '- `server/src/modules/demo/routes.ts` — +40 −0',
    '- `server/test/demo.test.ts` — new, untracked · test',
    '## client (1)',
    '- `client/src/app/demo/_components/Demo/Demo.tsx` — +10 −0',
    '## Architecture scope (2)',
    '- `server/src/modules/demo/routes.ts`',
  ].join('\n');
  assert.deepEqual(diffIndexFiles(index), [
    'server/src/modules/demo/routes.ts',
    'server/test/demo.test.ts',
    'client/src/app/demo/_components/Demo/Demo.tsx',
  ]);
  const { rows, extra } = filesVsDiff(PLAN, index);
  assert.deepEqual(
    rows.filter((r) => !r.touched).map((r) => r.path),
    ['server/src/modules/demo/service.ts', 'server/src/modules/index.ts', 'client/src/lib/hooks/demo.ts', 'server/src/modules/demo/service.ts'],
  );
  assert.deepEqual(extra, ['server/test/demo.test.ts']);
});

test('files: code on the bullet is skipped; a short path is matched by suffix and flagged by lint', () => {
  const md = [
    'PLAN: READY',
    '### Phase P1 — client',
    '### S1 Hook',
    '- Files: create `client/src/lib/hooks/blast.ts`; `useQuery` calls `api.get<Blast>(`; edit `.../_components/Demo/Demo.tsx`',
    '- Done when: `pnpm typecheck`',
  ].join('\n');
  assert.deepEqual(plannedFiles(md).map((f) => f.path), ['client/src/lib/hooks/blast.ts', '.../_components/Demo/Demo.tsx']);
  const { rows } = filesVsDiff(md, '- `client/src/app/demo/_components/Demo/Demo.tsx` — +1 −0');
  assert.deepEqual(rows.map((r) => [r.touched, r.short]), [[false, false], [true, true]]);
  assert.ok(lint(md).warnings.some(([c, m]) => c === 'L-PATH' && m.includes('S1 `.../_components/Demo/Demo.tsx`')));
});

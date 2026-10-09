import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inArchitectureScope, packageOf, renderIndex, tagsFor } from './diff-index.mjs';

test('tags decide reviewer relevance', () => {
  assert.deepEqual(tagsFor('server/test/intent.it.test.ts'), ['test']);
  assert.deepEqual(tagsFor('server/src/vendor/shared/contracts/brief.ts'), ['contract']);
  assert.deepEqual(tagsFor('server/src/db/migrations/0018_x.sql'), ['migration']);
  assert.deepEqual(tagsFor('client/messages/en/intent.json'), ['messages']);
});

test('architecture scope keeps production code and migration SQL only', () => {
  assert.equal(inArchitectureScope('server/src/modules/intent/service.ts'), true);
  assert.equal(inArchitectureScope('reviewer-core/src/review/scope.ts'), true);
  assert.equal(inArchitectureScope('client/src/lib/hooks/intent.ts'), true);
  assert.equal(inArchitectureScope('server/src/db/migrations/0018_x.sql'), true);
  assert.equal(inArchitectureScope('server/src/db/migrations/meta/0018_snapshot.json'), false);
  assert.equal(inArchitectureScope('server/test/intent.it.test.ts'), false);
  assert.equal(inArchitectureScope('client/src/app/x/_components/Card/styles.ts'), false);
  assert.equal(inArchitectureScope('client/messages/en/intent.json'), false);
  assert.equal(inArchitectureScope('INSIGHTS.md'), false);
});

test('packages and rendering', () => {
  assert.equal(packageOf('reviewer-core/src/prompt.ts'), 'reviewer-core');
  assert.equal(packageOf('INSIGHTS.md'), 'other');
  const md = renderIndex({
    base: 'origin/main',
    baseSha: 'aaaaaaaaaa',
    mergeBase: 'bbbbbbbbbb',
    headSha: 'cccccccccc',
    files: [
      { path: 'server/src/modules/intent/service.ts', added: 10, deleted: 2 },
      { path: 'server/test/intent.it.test.ts', added: null, deleted: null, untracked: true },
    ],
  });
  assert.match(md, /Base: origin\/main \(aaaaaaa\) · merge-base bbbbbbb/);
  assert.match(md, /## server \(2\)/);
  assert.match(md, /`server\/test\/intent\.it\.test\.ts` — new, untracked · test/);
  assert.match(md, /## Architecture scope \(1\)\n- `server\/src\/modules\/intent\/service\.ts`/);
});

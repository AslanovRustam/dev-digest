import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { excludeGeneratedFiles, isGeneratedPath } from '../src/review/generated.js';

const block = (path: string, body: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n ${body}\n+${body}2\n`;

const file = (path: string) => ({ path, additions: 1, deletions: 0, hunks: [] });

describe('isGeneratedPath', () => {
  it('matches lockfiles, migration snapshots, minified bundles and source maps', () => {
    for (const p of [
      'pnpm-lock.yaml',
      'client/package-lock.json',
      'yarn.lock',
      'go.sum',
      'server/src/db/migrations/meta/0013_snapshot.json',
      'server/src/db/migrations/meta/_journal.json',
      'public/app.min.js',
      'dist/app.js.map',
    ]) {
      expect(isGeneratedPath(p), p).toBe(true);
    }
  });

  it('keeps hand-written code, including the migration SQL itself', () => {
    for (const p of [
      'server/src/db/migrations/0013_ancient_nightshade.sql',
      'server/src/db/schema/knowledge.ts',
      'package.json',
      'src/lock.ts',
      'docs/meta/notes.json',
    ]) {
      expect(isGeneratedPath(p), p).toBe(false);
    }
  });
});

describe('excludeGeneratedFiles', () => {
  const diff: UnifiedDiff = {
    raw:
      block('src/a.ts', 'const a = 1;') +
      block('server/src/db/migrations/meta/0013_snapshot.json', '"x": 1') +
      block('pnpm-lock.yaml', 'lock: 1') +
      block('src/b.ts', 'const b = 2;'),
    files: [
      file('src/a.ts'),
      file('server/src/db/migrations/meta/0013_snapshot.json'),
      file('pnpm-lock.yaml'),
      file('src/b.ts'),
    ],
  };

  it('drops generated files from both the file list and the raw diff', () => {
    const { diff: out, excluded } = excludeGeneratedFiles(diff);
    expect(excluded).toEqual(['server/src/db/migrations/meta/0013_snapshot.json', 'pnpm-lock.yaml']);
    expect(out.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(out.raw).toBe(block('src/a.ts', 'const a = 1;') + block('src/b.ts', 'const b = 2;'));
  });

  it('returns the same diff object when nothing is generated', () => {
    const clean: UnifiedDiff = { raw: block('src/a.ts', 'x'), files: [file('src/a.ts')] };
    const res = excludeGeneratedFiles(clean);
    expect(res.diff).toBe(clean);
    expect(res.excluded).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import {
  excludeGeneratedFiles,
  GENERATED_SKIP_MIN_LINES,
  isGeneratedPath,
} from '../src/review/generated.js';

const block = (path: string, body: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n ${body}\n+${body}2\n`;

const BIG = GENERATED_SKIP_MIN_LINES + 1;
const file = (path: string, additions = 1) => ({ path, additions, deletions: 0, hunks: [] });

describe('isGeneratedPath', () => {
  it('matches drizzle migration snapshots', () => {
    for (const p of [
      'server/src/db/migrations/meta/0013_snapshot.json',
      'db/migrations/meta/0001_snapshot.json',
    ]) {
      expect(isGeneratedPath(p), p).toBe(true);
    }
  });

  it('keeps hand-written code, lockfiles, executable bundles and the migration SQL itself', () => {
    for (const p of [
      // a swapped `resolved` / `integrity` in a lockfile is a supply-chain attack — always reviewed
      'pnpm-lock.yaml',
      'client/package-lock.json',
      'go.sum',
      // the migrator reads the journal at runtime to choose and order migrations
      'server/src/db/migrations/meta/_journal.json',
      'server/src/db/migrations/0013_ancient_nightshade.sql',
      'server/src/db/schema/knowledge.ts',
      'package.json',
      'src/lock.ts',
      'docs/meta/notes.json',
      // executable or loadable whatever the extension says — always reviewed
      'public/app.min.js',
      'dist/app.js.map',
      'src/payload.map',
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
      block('server/src/db/migrations/meta/0014_snapshot.json', '"y": 2') +
      block('src/b.ts', 'const b = 2;'),
    files: [
      file('src/a.ts'),
      file('server/src/db/migrations/meta/0013_snapshot.json', BIG),
      file('server/src/db/migrations/meta/0014_snapshot.json', BIG),
      file('src/b.ts'),
    ],
  };

  it('drops LARGE generated files from both the file list and the raw diff', () => {
    const { diff: out, excluded } = excludeGeneratedFiles(diff);
    expect(excluded).toEqual([
      'server/src/db/migrations/meta/0013_snapshot.json',
      'server/src/db/migrations/meta/0014_snapshot.json',
    ]);
    expect(out.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(out.raw).toBe(block('src/a.ts', 'const a = 1;') + block('src/b.ts', 'const b = 2;'));
  });

  it('keeps a small change to a generated file in the review', () => {
    const small: UnifiedDiff = {
      raw: block('src/a.ts', 'x') + block('server/src/db/migrations/meta/0015_snapshot.json', '"id": "x"'),
      files: [file('src/a.ts'), file('server/src/db/migrations/meta/0015_snapshot.json', 7)],
    };
    const res = excludeGeneratedFiles(small);
    expect(res.excluded).toEqual([]);
    expect(res.diff).toBe(small);
  });
});

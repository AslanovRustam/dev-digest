/**
 * DepCruiseGraph against a real (temp) tree: edges must come back as
 * repo-relative POSIX paths that match the `files` it was given. On Windows
 * `path.relative` emits `\`, which silently dropped every edge (0 edges →
 * no `decl_file` → blast radius with no callers).
 *
 * The fixture lives under cwd, not os.tmpdir(): cruise joins cwd with the
 * absolute path, so a root on another Windows drive fails with ENOENT.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

describe('DepCruiseGraph.buildEdges', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(process.cwd(), '.tmp-depgraph-'));
    mkdirSync(join(root, 'src', 'lib'), { recursive: true });
    writeFileSync(join(root, 'src', 'lib', 'b.ts'), 'export const b = 1;\n');
    writeFileSync(join(root, 'src', 'a.ts'), "import { b } from './lib/b';\nexport const a = b;\n");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns the local import edge with POSIX repo-relative paths', async () => {
    const edges = await new DepCruiseGraph().buildEdges(root, ['src/a.ts', 'src/lib/b.ts']);
    expect(edges).toEqual([{ from: 'src/a.ts', to: 'src/lib/b.ts' }]);
  });
});

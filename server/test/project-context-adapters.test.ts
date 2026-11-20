/**
 * Project Context (L05) — adapter level: tokenizer truncation, the content
 * version, and the clone's working-tree list/read (symlinks, traversal, size,
 * UTF-8, `/` paths on every OS). Real fs under process.cwd(), like depgraph.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { TiktokenTokenizer, approxTruncate } from '../src/adapters/tokenizer/index.js';
import { contentVersion } from '../src/platform/content-version.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { MockGitClient } from '../src/adapters/mocks.js';

const REPO = { owner: 'acme', name: 'payments-api' };
const OPTS = { extension: '.md', excludeDirs: ['.git', 'node_modules'] };

describe('TiktokenTokenizer.truncate', () => {
  const tok = new TiktokenTokenizer();
  const long = 'Module api/ must not import db/ directly. Ünïcödé ✓ 🚀 '.repeat(400);

  it('returns a prefix that counts at most max tokens', () => {
    for (const max of [1, 7, 100, 2000]) {
      const out = tok.truncate(long, max);
      expect(long.startsWith(out)).toBe(true);
      expect(tok.count(out)).toBeLessThanOrEqual(max);
      expect(tok.count(out)).toBeGreaterThan(max - 8);
    }
  });

  it('returns the text unchanged when it fits', () => {
    expect(tok.truncate('short text', 100)).toBe('short text');
  });

  it('approxTruncate keeps max × 4 chars', () => {
    expect(approxTruncate('abcdefghij', 2)).toBe('abcdefgh');
    expect(approxTruncate('abc', 2)).toBe('abc');
  });
});

describe('contentVersion', () => {
  it('is the same for CRLF and LF text and differs for other text', () => {
    expect(contentVersion('a\r\nb\r\n')).toBe(contentVersion('a\nb\n'));
    expect(contentVersion('a\nb\n')).not.toBe(contentVersion('a\nc\n'));
    expect(contentVersion('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('SimpleGitClient working tree', () => {
  let cloneDir: string;
  let outside: string;
  let git: SimpleGitClient;
  let fileLinkWorks = true;
  let dirLinkWorks = true;

  beforeAll(() => {
    cloneDir = mkdtempSync(join(process.cwd(), '.tmp-project-context-'));
    const root = join(cloneDir, 'acme', 'payments-api');
    const write = (rel: string, data: string | Buffer) => {
      const full = join(root, ...rel.split('/'));
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, data);
    };
    mkdirSync(join(root, '.git'), { recursive: true });
    write('specs/public-api.md', '# Public API\r\nAll endpoints MUST be rate-limited.\r\n');
    write('.devdigest/specs/security.md', '# Security baseline');
    write('docs/Guide.MD', 'upper-case extension');
    write('node_modules/pkg/README.md', 'never listed');
    write('src/notes.txt', 'not markdown');
    write('insights/latin1.md', Buffer.from([0x63, 0x61, 0x66, 0xe9])); // "café" in latin-1
    write('docs/big.md', 'x'.repeat(2048));
    outside = join(cloneDir, 'secrets.json');
    writeFileSync(outside, '{"github_token":"ghp_secret"}');
    try {
      symlinkSync(outside, join(root, 'docs', 'link.md'));
    } catch {
      fileLinkWorks = false; // Windows without Developer Mode / admin
    }
    try {
      // A junction needs no privilege on Windows; Node reports it as a symlink.
      symlinkSync(join(root, 'specs'), join(root, 'docs', 'linked-dir'), 'junction');
    } catch {
      dirLinkWorks = false;
    }
    git = new SimpleGitClient(cloneDir);
  });

  afterAll(() => {
    rmSync(cloneDir, { recursive: true, force: true });
  });

  it('lists .md files with `/` paths, hidden dirs in, node_modules and .git out', async () => {
    const files = await git.listWorkingFiles(REPO, OPTS);
    const paths = files!.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining(['.devdigest/specs/security.md', 'docs/Guide.MD', 'specs/public-api.md']),
    );
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(paths).not.toContain('src/notes.txt');
    expect(paths.every((p) => !p.includes('\\'))).toBe(true);
    expect(files!.find((f) => f.path === 'docs/big.md')!.size).toBe(2048);
  });

  it('returns null / not_cloned for a repo without a clone', async () => {
    const missing = { owner: 'acme', name: 'missing' };
    expect(await git.listWorkingFiles(missing, OPTS)).toBeNull();
    expect(await git.readWorkingFile(missing, 'specs/a.md', 1024)).toEqual({ ok: false, code: 'not_cloned' });
  });

  it('reads a file as UTF-8 text with its size', async () => {
    const r = await git.readWorkingFile(REPO, 'specs/public-api.md', 1024);
    expect(r).toMatchObject({ ok: true, text: '# Public API\r\nAll endpoints MUST be rate-limited.\r\n' });
  });

  it('rejects traversal, absolute and backslash paths without touching the disk', async () => {
    for (const p of ['../secrets.json', 'specs/../../secrets.json', '/etc/passwd', 'C:/x.md', 'specs\\public-api.md', '']) {
      expect(await git.readWorkingFile(REPO, p, 1024)).toEqual({ ok: false, code: 'outside_clone' });
    }
  });

  it('reports not_found, too_large and not_utf8', async () => {
    expect(await git.readWorkingFile(REPO, 'specs/nope.md', 1024)).toEqual({ ok: false, code: 'not_found' });
    expect(await git.readWorkingFile(REPO, 'docs/big.md', 1024)).toEqual({ ok: false, code: 'too_large' });
    expect(await git.readWorkingFile(REPO, 'insights/latin1.md', 1024)).toEqual({ ok: false, code: 'not_utf8' });
  });

  it('never lists or reads a symlinked file (e.g. to the local secrets file)', async (ctx) => {
    if (!fileLinkWorks) ctx.skip();
    const paths = (await git.listWorkingFiles(REPO, OPTS))!.map((f) => f.path);
    expect(paths).not.toContain('docs/link.md');
    expect(await git.readWorkingFile(REPO, 'docs/link.md', 1024)).toEqual({ ok: false, code: 'symlink' });
  });

  it('never lists or reads a file under a symlinked directory', async (ctx) => {
    if (!dirLinkWorks) ctx.skip();
    const paths = (await git.listWorkingFiles(REPO, OPTS))!.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('docs/linked-dir/'))).toBe(false);
    expect(await git.readWorkingFile(REPO, 'docs/linked-dir/public-api.md', 1024)).toEqual({
      ok: false,
      code: 'symlink',
    });
  });
});

describe('MockGitClient working tree', () => {
  it('mirrors the adapter rules for symlinks, excluded dirs and no clone', async () => {
    const git = new MockGitClient({
      files: { 'specs/a.md': 'A', 'node_modules/x/b.md': 'B', 'docs/link.md': 'S' },
      symlinks: ['docs/link.md'],
    });
    expect((await git.listWorkingFiles(REPO, OPTS))!.map((f) => f.path)).toEqual(['specs/a.md']);
    expect(await git.readWorkingFile(REPO, 'docs/link.md', 10)).toEqual({ ok: false, code: 'symlink' });
    expect(await git.readWorkingFile(REPO, '../a.md', 10)).toEqual({ ok: false, code: 'outside_clone' });
    expect(await new MockGitClient({ notCloned: true }).listWorkingFiles(REPO, OPTS)).toBeNull();
  });
});

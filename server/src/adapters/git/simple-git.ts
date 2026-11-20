import { simpleGit, type SimpleGit } from 'simple-git';
import { join, sep } from 'node:path';
import { mkdir, readFile, access, rm, readdir, lstat, realpath } from 'node:fs/promises';
import { constants, type Dirent } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
  ListWorkingFilesOptions,
  WorkingFile,
  WorkingFileRead,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await simpleGit(dest).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await simpleGit(this.cloneDir).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.git(repo).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = this.git(repo);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(join(this.clonePathFor(repo), path), 'utf8');
  }

  async listWorkingFiles(
    repo: RepoRef,
    opts: ListWorkingFilesOptions,
  ): Promise<WorkingFile[] | null> {
    const root = this.clonePathFor(repo);
    if (!(await this.exists(join(root, '.git')))) return null;
    const out: WorkingFile[] = [];
    await walkWorkingTree(root, '', opts.extension.toLowerCase(), new Set(opts.excludeDirs), out);
    out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
  }

  async readWorkingFile(repo: RepoRef, path: string, maxBytes: number): Promise<WorkingFileRead> {
    const segments = path.split('/');
    // Untrusted path: relative, `/`-only, no empty / `.` / `..` segment, no NUL.
    if (
      path.includes('\\') ||
      path.includes('\0') ||
      /^[a-zA-Z]:/.test(path) ||
      segments.some((s) => s === '' || s === '.' || s === '..')
    ) {
      return { ok: false, code: 'outside_clone' };
    }
    const root = this.clonePathFor(repo);
    if (!(await this.exists(join(root, '.git')))) return { ok: false, code: 'not_cloned' };
    // lstat every component: a symlinked file OR directory anywhere on the
    // path is refused (a committed `docs/x.md` → ~/.devdigest/secrets.json).
    let current = root;
    let size = 0;
    let mtimeMs = 0;
    for (let i = 0; i < segments.length; i++) {
      current = join(current, segments[i]!);
      let st;
      try {
        st = await lstat(current);
      } catch {
        return { ok: false, code: 'not_found' };
      }
      if (st.isSymbolicLink()) return { ok: false, code: 'symlink' };
      const last = i === segments.length - 1;
      if (last ? !st.isFile() : !st.isDirectory()) return { ok: false, code: 'not_found' };
      if (last) {
        size = st.size;
        mtimeMs = st.mtimeMs;
      }
    }
    // Defense in depth (junctions, mount tricks): the real path stays inside.
    try {
      const [realRoot, realFile] = await Promise.all([realpath(root), realpath(current)]);
      if (!realFile.startsWith(realRoot + sep)) return { ok: false, code: 'outside_clone' };
    } catch {
      return { ok: false, code: 'not_found' };
    }
    if (size > maxBytes) return { ok: false, code: 'too_large' };
    const buf = await readFile(current);
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { ok: true, text, size, mtimeMs };
    } catch {
      return { ok: false, code: 'not_utf8' };
    }
  }
}

/**
 * Working-tree walk for `listWorkingFiles` — the repo-intel walker's rules
 * (never follow symlinks, skip excluded dir names, tolerate unreadable dirs),
 * collecting `{ path, size, mtimeMs }` for files with `ext`.
 */
async function walkWorkingTree(
  root: string,
  rel: string,
  ext: string,
  exclude: Set<string>,
  out: WorkingFile[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(rel ? join(root, rel) : root, { withFileTypes: true })) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (exclude.has(entry.name)) continue;
      await walkWorkingTree(root, childRel, ext, exclude, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(ext)) continue;
    try {
      const st = await lstat(join(root, childRel));
      out.push({ path: childRel, size: st.size, mtimeMs: st.mtimeMs });
    } catch {
      // vanished mid-walk — skip
    }
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}

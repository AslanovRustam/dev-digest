import type {
  ContextAttachments,
  ContextDocList,
  ContextDocument,
  ContextSaveRequest,
  ContextSaveResult,
  GitHubClient,
  RepoRef,
  WorkingFile,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RepoRow } from '../../db/rows.js';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { contentVersion } from '../../platform/content-version.js';
import { REFRESH_JOB_KIND } from '../repo-intel/constants.js';
import { ProjectContextRepository } from './repository.js';
import {
  CONTEXT_EXCLUDED_DIRS,
  CONTEXT_EXTENSION,
  MAX_READ_BYTES,
  MAX_SAVE_BYTES,
  SAVE_PR_BODY,
} from './constants.js';
import {
  attachmentPathsProblem,
  branchName,
  budgetDocuments,
  buildDocList,
  commitMessage,
  docPathProblem,
  docTypeFor,
  groupSkillLists,
  isTooLarge,
  mergeAttachments,
  notClonedList,
  pathProblemText,
  selectDocuments,
  toAttachmentsView,
  usedByCounts,
  type BudgetResult,
  type DocRead,
  type MergedAttachment,
} from './helpers.js';
import type { AttachmentOwner, ProjectContextFacade, ReviewProjectContext } from './types.js';

const LIST_OPTS = { extension: CONTEXT_EXTENSION, excludeDirs: CONTEXT_EXCLUDED_DIRS };

/** Concurrent file reads per batch (1,000 documents must not open 1,000 fds at once). */
const READ_BATCH = 32;

/** Token-cache cap; the cache is cleared rather than grown past it. */
const TOKEN_CACHE_MAX = 20_000;

/**
 * Project Context (L05): the clone's markdown documents, their attachment to
 * agents and skills (paths only), their injection into review runs, and edits
 * committed to GitHub as a PR. Reads the clone's WORKING TREE (default branch as
 * of the last sync) and never writes to it.
 */
export class ProjectContextService implements ProjectContextFacade {
  private repo: ProjectContextRepository;
  /** Full-text tokens by `repoId:path:size:mtimeMs` — a changed file gets a new key. */
  private tokenCache = new Map<string, number>();

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  private get roots(): string[] {
    return this.container.config.projectContextRoots;
  }

  async list(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const ref = refOf(repo);
    const files = await this.container.git.listWorkingFiles(ref, LIST_OPTS);
    if (!files) return notClonedList(this.roots);
    const scannedAt = new Date().toISOString();
    const selected = selectDocuments(files, this.roots);
    const tokens = new Map<string, number | null>();
    const readable = selected.listed.filter((d) => !isTooLarge(d.file)).map((d) => d.file);
    await inBatches(readable, async (file) => {
      tokens.set(file.path, await this.fileTokens(repo.id, ref, file));
    });
    const usedBy = usedByCounts(await this.repo.usagePairs(workspaceId));
    return buildDocList(selected, this.roots, tokens, usedBy, scannedAt);
  }

  async document(workspaceId: string, repoId: string, path: string): Promise<ContextDocument> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const problem = docPathProblem(path, this.roots);
    if (problem) throw new ValidationError(pathProblemText(problem), { path, reason: problem });
    const read = await this.container.git.readWorkingFile(refOf(repo), path, MAX_READ_BYTES);
    if (!read.ok) {
      if (read.code === 'too_large') throw new AppError('too_large', 'The document is over 1 MB', 413);
      if (read.code === 'not_utf8') throw new AppError('not_utf8', 'The document is not valid UTF-8', 422);
      if (read.code === 'not_cloned') throw new AppError('not_cloned', 'Repository not cloned yet', 409);
      // not_found, symlink, outside_clone — never confirm that such a file exists.
      throw new NotFoundError('Document not found');
    }
    const tokens = this.cachedCount(`${repo.id}:${path}:${read.size}:${read.mtimeMs}`, read.text);
    const usedBy = usedByCounts(await this.repo.usagePairs(workspaceId));
    return {
      path,
      type: docTypeFor(path, this.roots)!,
      text: read.text,
      tokens,
      version: contentVersion(read.text),
      used_by_agents: usedBy.get(path) ?? 0,
    };
  }

  async rescan(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const ref = refOf(repo);
    if (!(await this.container.git.listWorkingFiles(ref, LIST_OPTS))) {
      throw new AppError('not_cloned', 'Repository not cloned yet', 409);
    }
    try {
      await this.container.git.sync(ref, repo.defaultBranch);
    } catch {
      throw new ExternalServiceError('Could not fetch the latest default branch from GitHub');
    }
    this.forgetRepo(repo.id);
    // Same as the repo refresh: the index follows the new HEAD. Best-effort.
    try {
      await this.container.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // no handler / transient enqueue failure — the list below is still fresh
    }
    return this.list(workspaceId, repoId);
  }

  async getAttachments(
    workspaceId: string,
    owner: AttachmentOwner,
    repoId?: string,
  ): Promise<ContextAttachments> {
    await this.requireOwner(workspaceId, owner);
    const merged = await this.mergedFor(owner);
    if (!repoId) return toAttachmentsView(merged, null);
    const repo = await this.requireRepo(workspaceId, repoId);
    return toAttachmentsView(merged, await this.budgetFor(repo, merged));
  }

  async setAttachments(
    workspaceId: string,
    owner: AttachmentOwner,
    paths: string[],
    repoId?: string,
  ): Promise<ContextAttachments> {
    const bad = attachmentPathsProblem(paths);
    if (bad) {
      const text = pathProblemText(bad.problem);
      throw new ValidationError(bad.path ? `${text}: ${bad.path}` : text, bad);
    }
    await this.requireOwner(workspaceId, owner);
    // Paths only — and no version bump: attachments are not part of the agent / skill version.
    if (owner.kind === 'agent') await this.repo.setAgentPaths(owner.id, paths);
    else await this.repo.setSkillPaths(owner.id, paths);
    return this.getAttachments(workspaceId, owner, repoId);
  }

  async save(workspaceId: string, repoId: string, req: ContextSaveRequest): Promise<ContextSaveResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const problem = docPathProblem(req.path, this.roots);
    if (problem) throw new ValidationError(pathProblemText(problem), { path: req.path, reason: problem });
    if (Buffer.byteLength(req.text, 'utf8') > MAX_SAVE_BYTES) {
      throw new AppError('too_large', 'The document is over 256 KB', 413);
    }
    if (req.mode === 'update' && !req.base_version) {
      throw new ValidationError('base_version is required to update a document', { reason: 'base_version' });
    }

    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_token', 'No GitHub token is stored. Add one in Settings.', 403);
    }
    const ref = refOf(repo);

    // Compare with GitHub's default branch, not the (possibly stale) clone.
    const upstream = await this.upstreamVersion(gh, ref, req.path, repo.defaultBranch);
    if (req.mode === 'create' && upstream !== null) {
      throw new AppError('exists', 'A document with this path already exists', 409);
    }
    if (req.mode === 'update' && upstream !== req.base_version) {
      throw new AppError('changed_upstream', 'Changed on GitHub. Rescan and reapply your edit.', 409);
    }

    const branch = branchName(req.path, new Date());
    const message = req.message?.trim() || commitMessage(req.mode, req.path);
    try {
      // createOnly: a new branch per save — never the default branch, never an existing one.
      await gh.commitFiles(ref, {
        branch,
        base: repo.defaultBranch,
        message,
        files: [{ path: req.path, contents: req.text }],
        createOnly: true,
      });
      const pr = await gh.openPullRequest(ref, {
        title: message,
        head: branch,
        base: repo.defaultBranch,
        body: SAVE_PR_BODY,
      });
      return { branch, pr_number: pr.number, pr_url: pr.url };
    } catch (err) {
      throw githubError(err);
    }
  }

  async forReview(agentId: string, repo: RepoRow): Promise<ReviewProjectContext> {
    try {
      const merged = await this.mergedFor({ kind: 'agent', id: agentId });
      if (merged.length === 0) return { documents: [], reads: [] };
      const reads = await this.readAll(repo, merged.map((m) => m.path));
      const budget = budgetDocuments(merged, reads, this.container.tokenizer);
      return { documents: budget.injected, reads: budget.trace };
    } catch {
      // A context failure never fails the review — the run proceeds without it.
      return { documents: [], reads: [] };
    }
  }

  // ---------------------------------------------------------------- internals

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async requireOwner(workspaceId: string, owner: AttachmentOwner): Promise<void> {
    const exists =
      owner.kind === 'agent'
        ? await this.repo.agentExists(workspaceId, owner.id)
        : await this.repo.skillExists(workspaceId, owner.id);
    if (!exists) throw new NotFoundError(owner.kind === 'agent' ? 'Agent not found' : 'Skill not found');
  }

  /** An agent: own + inherited from enabled skill links. A skill: its own list. */
  private async mergedFor(owner: AttachmentOwner): Promise<MergedAttachment[]> {
    if (owner.kind === 'skill') return mergeAttachments(await this.repo.skillPaths(owner.id), []);
    const [own, inherited] = await Promise.all([
      this.repo.agentPaths(owner.id),
      this.repo.skillPathsForAgent(owner.id),
    ]);
    return mergeAttachments(own, groupSkillLists(inherited));
  }

  /** Null = the repo has no clone, so nothing can be counted (AC-14). */
  private async budgetFor(repo: RepoRow, merged: MergedAttachment[]): Promise<BudgetResult | null> {
    const reads = await this.readAll(repo, merged.map((m) => m.path));
    if ([...reads.values()].some((r) => !r.ok && r.reason === 'not_cloned')) return null;
    return budgetDocuments(merged, reads, this.container.tokenizer);
  }

  private async readAll(repo: RepoRow, paths: string[]): Promise<Map<string, DocRead>> {
    const ref = refOf(repo);
    const reads = new Map<string, DocRead>();
    await inBatches(paths, async (path) => {
      const read = await this.container.git.readWorkingFile(ref, path, MAX_READ_BYTES);
      reads.set(
        path,
        read.ok
          ? {
              ok: true,
              text: read.text,
              tokens: this.cachedCount(`${repo.id}:${path}:${read.size}:${read.mtimeMs}`, read.text),
            }
          : { ok: false, reason: read.code },
      );
    });
    return reads;
  }

  /** Tokens of a listed file; reads it only on a cache miss. Null when unreadable. */
  private async fileTokens(repoId: string, ref: RepoRef, file: WorkingFile): Promise<number | null> {
    const key = `${repoId}:${file.path}:${file.size}:${file.mtimeMs}`;
    const hit = this.tokenCache.get(key);
    if (hit !== undefined) return hit;
    const read = await this.container.git.readWorkingFile(ref, file.path, MAX_READ_BYTES);
    return read.ok ? this.cachedCount(key, read.text) : null;
  }

  private cachedCount(key: string, text: string): number {
    const hit = this.tokenCache.get(key);
    if (hit !== undefined) return hit;
    if (this.tokenCache.size >= TOKEN_CACHE_MAX) this.tokenCache.clear();
    const tokens = this.container.tokenizer.count(text);
    this.tokenCache.set(key, tokens);
    return tokens;
  }

  private forgetRepo(repoId: string): void {
    for (const key of this.tokenCache.keys()) {
      if (key.startsWith(`${repoId}:`)) this.tokenCache.delete(key);
    }
  }

  /** Version of the file on GitHub's default branch; null when it does not exist there. */
  private async upstreamVersion(
    gh: GitHubClient,
    ref: RepoRef,
    path: string,
    branch: string,
  ): Promise<string | null> {
    try {
      const file = await gh.getFileAtRef(ref, path, branch, MAX_READ_BYTES);
      return contentVersion(file.content);
    } catch (err) {
      const e = err as { status?: number; code?: string };
      if (e.status === 404) return null;
      // Present but unreadable here (a folder, over the cap) — it exists, and its version can't match.
      if (e.code === 'not_a_file' || e.code === 'too_large') return 'unreadable';
      throw githubError(err);
    }
  }
}

function refOf(repo: RepoRow): RepoRef {
  return { owner: repo.owner, name: repo.name };
}

async function inBatches<T>(items: readonly T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += READ_BATCH) {
    await Promise.all(items.slice(i, i + READ_BATCH).map(fn));
  }
}

/** GitHub failure → the API error the page shows (AC-32): its reason, never a token. */
function githubError(err: unknown): AppError {
  const e = err as { status?: number; code?: string; message?: string };
  const reason = (e.message ?? 'unknown error').slice(0, 300);
  if (e.code === 'branch_exists') {
    return new AppError('branch_exists', 'A save of this file is already in progress — try again in a moment', 409);
  }
  if (e.status === 401 || e.status === 403 || e.status === 404) {
    return new AppError('github_refused', `GitHub refused the write: ${reason}`, 403);
  }
  if (e.status === 429) return new AppError('rate_limited', 'GitHub rate limit reached — try again later', 429);
  return new ExternalServiceError(`GitHub request failed: ${reason}`);
}

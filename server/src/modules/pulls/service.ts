import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
  SeverityCounts,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { PullsRepository, type PullRow, type RepoRow } from './repository.js';
import { deriveReviewStatus } from './status.js';
import { totalReviewCost } from './cost.js';
import { openFindingsByPr } from './findings.js';
import { BACKFILL_LIMIT } from './constants.js';

/**
 * F1 — pulls service. Business logic for PR import and reads:
 *   - local-first sync from GitHub, degrading to persisted rows when no token
 *   - diff-stat backfill
 *   - the list roll-up (review score · cost · open findings by severity)
 *   - inline review comments, proxied live to GitHub
 *
 * No HTTP and no raw SQL live here — persistence goes through PullsRepository,
 * pure transforms through status.ts / cost.ts / findings.ts.
 *
 * The service cannot see Fastify's logger (ring 2 knows nothing about HTTP), so
 * callers pass a `warn` callback. That is deliberate: the degradation paths below
 * are business policy — "a PR list must still render without a GitHub token" —
 * and the caller decides where the warning goes.
 */

/** Structured warning sink supplied by the caller (Fastify's `log.warn` in routes). */
export type WarnFn = (meta: Record<string, unknown>, msg: string) => void;

export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  /**
   * The forge client, or null when none is configured. Callers degrade rather
   * than fail: already-imported PRs stay viewable offline.
   */
  private async forgeOrNull(warn: WarnFn, msg: string): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      warn({ err }, msg);
      return null;
    }
  }

  /** Resolve a PR and its repo, both workspace-scoped. */
  private async resolvePrAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRow; repo: RepoRow }> {
    const pr = await this.repo.getPullInWorkspace(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  // ---- list ----------------------------------------------------------------

  /**
   * PRs of a repo: sync from GitHub when possible, then roll up score, cost and
   * open findings. Never fails on a GitHub error — the persisted rows are the
   * source of truth for the response.
   */
  async listForRepo(workspaceId: string, repoId: string, warn: WarnFn): Promise<PrMeta[]> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.forgeOrNull(
      warn,
      'GitHub client unavailable (no token / offline); serving persisted PRs',
    );

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await this.repo.upsertFromForge(workspaceId, repo.id, pr);
        }
      } catch (err) {
        warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listByRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, rows, warn);

    return this.rollUp(workspaceId, rows);
  }

  /**
   * Repair PRs that were imported with zeroed size/diff, capped per request.
   * Mutates `rows` in place so the response reflects the repair immediately.
   */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: RepoRow,
    rows: PullRow[],
    warn: WarnFn,
  ): Promise<void> {
    const needStats = rows
      .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
      .slice(0, BACKFILL_LIMIT);

    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        await this.repo.updateDiffStats(r.id, {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        });
        r.additions = detail.additions;
        r.deletions = detail.deletions;
        r.filesCount = detail.files_count;
      } catch (err) {
        warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  /**
   * Fold the persisted rows into the list DTO: latest review score, total run
   * cost, open findings by severity. Three reads + pure helpers; the list is
   * small, so IN-queries plus JS grouping are cheap.
   */
  private async rollUp(workspaceId: string, rows: PullRow[]): Promise<PrMeta[]> {
    const prIds = rows.map((r) => r.id);

    // Rows come back newest-first → first seen per PR is the latest review.
    const reviewRows = await this.repo.latestReviewRowsForPrs(prIds);
    const latestReviewByPr = new Map<string, { score: number | null }>();
    for (const rv of reviewRows) {
      if (!latestReviewByPr.has(rv.prId)) latestReviewByPr.set(rv.prId, { score: rv.score });
    }

    // COST (L01): the total of ALL the PR's finished runs.
    const runRows = await this.repo.runCostRowsForPrs(workspaceId, prIds);
    const costByPr = totalReviewCost(runRows);

    // FINDINGS (L01): open findings across ALL the PR's reviews — a clean re-run
    // must not hide what an earlier run found. Dismissed are left out.
    let findingsByPr = new Map<string, SeverityCounts>();
    if (reviewRows.length > 0) {
      const findingRows = await this.repo.openFindingRowsForReviews(reviewRows.map((rv) => rv.id));
      findingsByPr = openFindingsByPr(reviewRows, findingRows);
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        findings: findingsByPr.get(r.id) ?? null,
      };
    });
  }

  // ---- detail --------------------------------------------------------------

  /**
   * Full PR detail. Refreshes from GitHub and persists files/commits/body when a
   * token is configured; otherwise serves the persisted detail so the page works
   * offline.
   */
  async detail(workspaceId: string, prId: string, warn: WarnFn): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);

    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      await this.repo.replaceFiles(pr.id, detail.files);
      await this.repo.replaceCommits(pr.id, detail.commits);
      await this.repo.updateDetail(pr.id, detail);

      return { ...detail, id: pr.id };
    } catch (err) {
      warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      return this.persistedDetail(pr);
    }
  }

  /** PR detail assembled from what was last persisted. */
  private async persistedDetail(pr: PullRow): Promise<PrDetail> {
    const files = await this.repo.listFiles(pr.id);
    const commits = await this.repo.listCommits(pr.id);
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      head_sha: pr.headSha,
      additions: pr.additions,
      deletions: pr.deletions,
      files_count: pr.filesCount,
      status: pr.status as PrDetail['status'],
      opened_at: pr.openedAt?.toISOString() ?? null,
      updated_at: pr.updatedAt?.toISOString() ?? null,
      body: pr.body ?? null,
      files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: c.author,
        committed_at: c.committedAt?.toISOString() ?? null,
      })),
    };
  }

  // ---- inline review comments ---------------------------------------------
  // Proxied live to GitHub (no local persistence): the list reflects existing PR
  // comments; create posts one immediately. Keeps the Files-changed tab in
  // lock-step with GitHub and avoids a stale local mirror.

  /** Existing inline comments, or an empty list when GitHub is unreachable. */
  async listComments(
    workspaceId: string,
    prId: string,
    warn: WarnFn,
  ): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);

    const gh = await this.forgeOrNull(warn, 'GitHub client unavailable; serving no PR comments');
    if (!gh) return [];

    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  /** Post one inline comment. Unlike the read, this fails loudly. */
  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);

    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }

    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}

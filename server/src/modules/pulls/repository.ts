import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { PrCommitRow, PrFileRow, PullRow, RepoRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import type { RunCostRow } from './cost.js';

/**
 * F1 — pulls data-access layer. The ONLY place that touches `pull_requests`,
 * `pr_files` and `pr_commits` for this module. Every entry point is scoped by
 * `workspaceId` (tenancy guard) or reached through a row already scoped that way.
 *
 * Queries are verbatim moves out of `routes.ts` — the read shapes, the ordering
 * and the `onConflictDoUpdate` target are load-bearing and were not "improved"
 * while moving.
 *
 * Note: `modules/reviews/repository/pull.repo.ts` also reads `pull_requests`,
 * reached as `container.reviewRepo`. That duplication is deliberate for now —
 * merging the two is a separate decision, not part of the layering move.
 */

export type { PrCommitRow, PrFileRow, PullRow, RepoRow };

/** Re-exported so the service reads one shape, owned by the domain file. */
export type { RunCostRow };

/** A review row as the PR list needs it: newest-first, for score + findings. */
export interface ReviewScoreRow {
  id: string;
  prId: string;
  score: number | null;
}

/** A finding row as the severity roll-up needs it. */
export interface FindingSeverityRow {
  reviewId: string;
  severity: string;
}

/** Diff stats backfilled onto a PR from its detail payload. */
export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export class PullsRepository {
  constructor(private db: Db) {}

  // ---- lookups (workspace-scoped) -----------------------------------------

  /** The repo, only if it belongs to the workspace. */
  async getRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** The repo a PR belongs to (the PR was already workspace-scoped). */
  async getRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  /** The PR, only if it belongs to the workspace. */
  async getPullInWorkspace(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** Every persisted PR of a repo. */
  async listByRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  // ---- writes --------------------------------------------------------------

  /**
   * Idempotent import of one PR from the forge. Conflict target is the
   * `(repo_id, number)` unique index, and the update set is deliberately narrow:
   * only the fields that legitimately change on an already-imported PR.
   */
  async upsertFromForge(workspaceId: string, repoId: string, pr: PrMeta): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        },
      });
  }

  /** Backfill size/diff stats that the PR-list payload does not carry. */
  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        additions: stats.additions,
        deletions: stats.deletions,
        filesCount: stats.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  /** Persist the body plus the diff stats that come with a detail fetch. */
  async updateDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  /** Replace the PR's file list wholesale (delete + insert, as the route did). */
  async replaceFiles(prId: string, files: PrDetail['files']): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length === 0) return;
    await this.db.insert(t.prFiles).values(
      files.map((f) => ({
        prId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
  }

  /** Replace the PR's commit list wholesale. */
  async replaceCommits(prId: string, commits: PrDetail['commits']): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length === 0) return;
    await this.db.insert(t.prCommits).values(
      commits.map((c) => ({
        prId,
        sha: c.sha,
        message: c.message,
        author: c.author,
        committedAt: c.committed_at ? new Date(c.committed_at) : null,
      })),
    );
  }

  // ---- persisted detail ----------------------------------------------------

  async listFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async listCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  // ---- list roll-up inputs -------------------------------------------------

  /**
   * Review rows for the PR list, NEWEST FIRST — the caller relies on that order
   * to take the first row per PR as the latest review.
   */
  async latestReviewRowsForPrs(prIds: string[]): Promise<ReviewScoreRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  /** Agent-run rows for the per-PR cost total. */
  async runCostRowsForPrs(workspaceId: string, prIds: string[]): Promise<RunCostRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.agentRuns.prId, status: t.agentRuns.status, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.prId, prIds)));
  }

  /** Open (not dismissed) findings across the given reviews. */
  async openFindingRowsForReviews(reviewIds: string[]): Promise<FindingSeverityRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({ reviewId: t.findings.reviewId, severity: t.findings.severity })
      .from(t.findings)
      .where(and(inArray(t.findings.reviewId, reviewIds), isNull(t.findings.dismissedAt)));
  }
}

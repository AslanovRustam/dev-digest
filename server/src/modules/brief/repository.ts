import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingRow, PrFileRow, PullRow, RepoRow, ReviewRow } from '../../db/rows.js';

/**
 * PR Brief data-access. Owns `pr_brief` (one JSON row per PR); reads
 * `pull_requests`, `repos`, `pr_files`, `reviews` and `findings`.
 * Workspace-scoped throughout — `pr_brief` has no workspace column, so it is
 * scoped through the PR it belongs to. Returns rows, never DTOs.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async listPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId)).orderBy(asc(t.prFiles.path));
  }

  /** The PR's most recently created review, if any. */
  async newestReview(workspaceId: string, prId: string): Promise<ReviewRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.prId, prId)))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    return row;
  }

  /** Findings of a review that were not dismissed. */
  async openFindings(reviewId: string): Promise<FindingRow[]> {
    return this.db
      .select()
      .from(t.findings)
      .where(and(eq(t.findings.reviewId, reviewId), isNull(t.findings.dismissedAt)));
  }

  /** The stored brief JSON (unvalidated — the service parses it). */
  async getBrief(workspaceId: string, prId: string): Promise<unknown | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.prBrief.prId, t.pullRequests.id))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row?.json;
  }

  /** One row per PR: regenerating replaces the JSON. */
  async upsertBrief(prId: string, json: unknown): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}

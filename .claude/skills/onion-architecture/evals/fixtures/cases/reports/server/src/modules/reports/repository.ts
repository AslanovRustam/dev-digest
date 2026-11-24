import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ComposedReviewRow } from '../../db/rows.js';
import { toReportDto } from './helpers.js';
import type { ReportDto } from './types.js';

export type { ComposedReviewRow };

export interface InsertReport {
  prId: string;
  body: string;
  verdict: string | null;
}

/**
 * Composed reviews carry no workspace column of their own: they belong to a
 * workspace through the pull request they were composed for.
 */
export class ReportRepository {
  constructor(private db: Db) {}

  async listForPull(workspaceId: string, prId: string, limit: number): Promise<ReportDto[]> {
    const rows = await this.db
      .select({ report: t.composedReviews })
      .from(t.composedReviews)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.composedReviews.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.composedReviews.prId, prId)))
      .orderBy(desc(t.composedReviews.postedAt))
      .limit(limit);
    return rows.map((r) => toReportDto(r.report));
  }

  async getById(id: string): Promise<ComposedReviewRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.composedReviews)
      .where(eq(t.composedReviews.id, id));
    return row;
  }

  async insert(values: InsertReport): Promise<ComposedReviewRow> {
    const [row] = await this.db
      .insert(t.composedReviews)
      .values({ prId: values.prId, body: values.body, verdict: values.verdict })
      .returning();
    return row!;
  }

  async deleteForPull(prId: string): Promise<void> {
    await this.db.delete(t.composedReviews).where(eq(t.composedReviews.prId, prId));
  }

  async markPosted(id: string, githubReviewId: string): Promise<void> {
    await this.db
      .update(t.composedReviews)
      .set({ githubReviewId, postedAt: new Date() })
      .where(eq(t.composedReviews.id, id));
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.composedReviews)
      .where(eq(t.composedReviews.id, id))
      .returning({ id: t.composedReviews.id });
    return deleted.length > 0;
  }
}

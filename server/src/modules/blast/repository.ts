import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Blast data-access. Reads `pull_requests` and `pr_files` only; workspace-scoped
 * throughout (`pr_files` has no workspace column, so it is scoped through its PR).
 * Returns rows, never DTOs.
 */
export class BlastRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listChangedPaths(workspaceId: string, prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.prFiles.prId, t.pullRequests.id))
      .where(and(eq(t.prFiles.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)))
      .orderBy(asc(t.prFiles.path));
    return rows.map((r) => r.path);
  }
}

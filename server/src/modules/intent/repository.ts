import { and, asc, eq } from 'drizzle-orm';
import type { IntentRiskArea, IntentSource } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrFileRow, PrIntentRow, PullRow, RepoRow } from '../../db/rows.js';

/**
 * Intent data-access. Owns `pr_intent`; reads `pull_requests`, `repos` and
 * `pr_files` (to rebuild a file list when no clone is available).
 * Workspace-scoped throughout — `pr_intent` has no workspace column, so it is
 * scoped through the PR it belongs to. Returns rows, never DTOs.
 */

export type { PrIntentRow };

export interface UpsertIntent {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  headSha: string;
  confidence: 'high' | 'medium' | 'low';
  sources: IntentSource[];
  missingContext: string[];
  riskAreas: IntentRiskArea[];
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  durationMs: number;
}

export class IntentRepository {
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

  async get(workspaceId: string, prId: string): Promise<PrIntentRow | undefined> {
    const [row] = await this.db
      .select({ intent: t.prIntent })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.prIntent.prId, t.pullRequests.id))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row?.intent;
  }

  /** One row per PR: re-deriving replaces everything, including `derived_at`. */
  async upsert(values: UpsertIntent): Promise<PrIntentRow> {
    const { prId, ...rest } = values;
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...rest })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: { ...rest, derivedAt: new Date() } })
      .returning();
    return row!;
  }
}
